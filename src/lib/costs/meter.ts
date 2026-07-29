import type { SupabaseClient } from "@supabase/supabase-js";
import type { Providers } from "@/lib/execution/shared";
import type { AIProvider } from "@/lib/providers/types";
import { costOf, unitFor } from "@/lib/costs/pricing";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface UsageScope {
  companyId: string;
  workExecutionId?: string;
  projectId?: string;
  companyEmployeeId?: string;
}

/**
 * Wraps the model provider so every call is recorded.
 *
 * Done here rather than at each call site because the call sites are the thing
 * that keeps growing: a new skill, a new detector, a new kind of decision. Any
 * of them can forget to record what it spent, and the failure is silent — the
 * bill arrives and the ledger says the work was free. Wrapping the provider
 * means a call cannot happen without being counted.
 */
export function meterProviders(
  providers: Providers,
  db: Db,
  scope: UsageScope,
): Providers {
  return { ...providers, ai: meterAi(providers.ai, db, scope) };
}

/** Marks a wrapped provider and keeps the original within reach. */
const UNMETERED = Symbol("unmetered");

type Metered = AIProvider & { [UNMETERED]: AIProvider };

function meterAi(ai: AIProvider, db: Db, scope: UsageScope): AIProvider {
  // Re-wrapping replaces the scope instead of stacking on it. A project passes
  // its metered providers down to each member, and the engine meters them again
  // against that member's run — without this, every one of those calls would be
  // written twice and the project would appear to cost double what it did.
  const base = (ai as Partial<Metered>)[UNMETERED] ?? ai;

  const metered: Metered = {
    [UNMETERED]: base,
    name: base.name,
    model: base.model,
    async generateStructuredOutput(params) {
      const result = await base.generateStructuredOutput(params);

      // Recorded after the call returns, so a failed call — which was still
      // charged for its input — is the one gap. Accepted: the alternative is
      // writing a row before knowing the token counts, which would be a
      // fabricated number rather than a missing one.
      await record(db, scope, {
        // What ran, not what the provider is configured with. Since calls can
        // be routed to different models by tier, reading the provider's own
        // field would price every routine call at the judgment rate — the
        // ledger would still balance and every number in it would be wrong.
        model: result.model,
        purpose: params.schemaName,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });

      return result;
    },
  };

  return metered;
}

async function record(
  db: Db,
  scope: UsageScope,
  call: {
    model: string;
    purpose: string;
    inputTokens: number;
    outputTokens: number;
    /** Pictures, seconds — whatever a non-token backend counts. */
    quantity?: number;
  },
) {
  // Priced outside the try on purpose. Everything below swallows its errors so
  // bookkeeping cannot break finished work — which is right for a failed
  // insert, and exactly wrong for a backend nobody has priced. That one has to
  // be loud: silently dropping the row would leave a paid call with no trace
  // at all, which is worse than the $0 this replaced.
  const cost = costOf({
    backend: call.model,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    quantity: call.quantity,
  });

  // Never let bookkeeping break the work. An employee who finished their
  // assignment has finished it, whether or not the ledger accepted the row.
  try {
    await db.from("model_usage").insert({
      company_id: scope.companyId,
      model: call.model,
      purpose: call.purpose,
      input_tokens: call.inputTokens,
      output_tokens: call.outputTokens,
      unit: unitFor(call.model),
      quantity: call.quantity ?? null,
      cost_usd: cost,
      work_execution_id: scope.workExecutionId ?? null,
      project_id: scope.projectId ?? null,
      company_employee_id: scope.companyEmployeeId ?? null,
    });
  } catch {
    // Deliberately silent.
  }
}
