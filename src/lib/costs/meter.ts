import type { SupabaseClient } from "@supabase/supabase-js";
import type { Providers } from "@/lib/execution/shared";
import type { AIProvider, Routing, WorkTier } from "@/lib/providers/types";
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
        // 부른 쪽이 이 일을 무엇이라고 불렀는지. 모델 이름만 남기면 "싼 일이
        // 비싼 모델로 돌았다"를 나중에 물어볼 수가 없다 — 무엇이 쌌어야 하는지가
        // 원장에 없기 때문이다. 기본값은 호출 쪽과 같은 이유로 `judgment` 다.
        tier: params.tier ?? "judgment",
        // 왜 그 자리에서 돌았는지. 라우터가 붙여 준다.
        routing: result.routing,
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
    /** 부른 쪽이 이 일을 무엇이라고 불렀는지. */
    tier?: WorkTier;
    /** 라우터가 왜 그 자리를 골랐는지. 라우터를 안 거쳤으면 없다. */
    routing?: Routing;
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
  const row = {
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
  };

  try {
    const { error } = await db
      .from("model_usage")
      .insert({ ...row, tier: call.tier ?? null, routing: call.routing ?? null });

    // 새 칸이 아직 없는 데이터베이스에 배포되면, 이 한 줄이 아니라 **원장 전체가**
    // 조용히 안 적힌다 — 모르는 칸이 하나 껴 있으면 insert 가 통째로 거절되고,
    // 그 거절은 던지지 않고 `error` 로만 온다. 마이그레이션과 배포의 순서가
    // 어긋나면 그날 하루의 돈이 통째로 사라지는 셈이다.
    //
    // 그래서 그 오류만 알아보고 **새 칸 없이 한 번 더** 적는다. 등급은 못 남겨도
    // 값은 남는다. 순서를 지키면 이 길로 오지 않는다.
    if (error && (error.code === "PGRST204" || error.code === "42703")) {
      console.warn(
        "model_usage 에 tier/routing 칸이 아직 없습니다 — 등급 없이 적습니다. " +
          "supabase/schema_usage_routing.sql 을 적용하십시오.",
      );
      await db.from("model_usage").insert(row);
    }
  } catch {
    // Deliberately silent.
  }
}
