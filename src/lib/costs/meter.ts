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
      const startedAt = Date.now();

      let result;
      try {
        result = await base.generateStructuredOutput(params);
      } catch (error) {
        // 죽은 문도 남긴다.
        //
        // 아래 원장은 성공한 뒤에만 쓰인다. 그래서 08-28 부터 사흘 동안
        // Anthropic 이 판단 등급을 전부 거절하고 있었는데 원장에는 한 줄도 안
        // 남았고, 옆 벤더가 대신 한 줄만 있었다. 돈이 안 나갔으니 원장에 없는
        // 것은 맞다 — 그러나 **벤더가 죽은 사건 자체가 어디에도 없었다.**
        await recordExchange(db, scope, {
          params,
          ok: false,
          model: base.model,
          ms: Date.now() - startedAt,
          error,
        });
        throw error;
      }

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

      // 무엇을 물었고 뭐라 답했는지. 원장과 다른 질문에 답하는 표라 따로 적는다
      // — 돈을 세는 곳은 위의 원장 하나뿐이고, 여기 줄이 없다고 해서 그 호출이
      // 없었던 것은 아니다.
      await recordExchange(db, scope, {
        params,
        ok: true,
        model: result.model,
        routing: result.routing,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        output: result.output,
        ms: Date.now() - startedAt,
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

/**
 * 한 줄에 담을 글의 최대 길이.
 *
 * 유니티 설계 프롬프트가 몇 만 자까지 간다. 통째로 담다가 언젠가 표가 창고가
 * 되는 것보다는, 자르고 **잘랐다고 표시하는** 편이 낫다 — 잘린 줄을 온전한 줄과
 * 같게 두면 나중에 이 표로 무엇을 하든 조용히 틀린다.
 */
const MAX_TEXT = 200_000;

function clip(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_TEXT
    ? { text: text.slice(0, MAX_TEXT), truncated: true }
    : { text, truncated: false };
}

/**
 * 실패를 몇 가지로 묶는다.
 *
 * 원문은 그대로 남기고 이 칸은 세기 위해 둔다 — "잔액이 떨어져 있던 날이
 * 며칠이었나" 는 문장을 훑어서는 못 세고, 그 질문이 이 표를 만든 이유다.
 * 모르겠으면 `other` 로 두고 지어내지 않는다.
 */
function errorKind(error: unknown): string {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  if (message.includes("credit balance") || message.includes("insufficient"))
    return "credit";
  if (message.includes("quota")) return "quota";
  if (message.includes("rate limit") || message.includes("429"))
    return "rate_limit";
  if (message.includes("overloaded") || message.includes("529"))
    return "overloaded";
  if (message.includes("timeout") || message.includes("econnreset"))
    return "timeout";
  if (message.includes("schema") || message.includes("json"))
    return "schema";
  return "other";
}

/** 표가 아직 없을 때 매 호출마다 같은 말을 하지 않게 한다. */
let warnedMissingTable = false;

/**
 * 무엇을 물었고 뭐라 답했는지 남긴다.
 *
 * **이것이 일을 막으면 안 된다.** 기록이 안 됐다고 끝난 일이 안 끝난 것이
 * 되지는 않는다 — 원장과 같은 규율이다. 그래서 여기서 나는 오류는 삼킨다.
 */
async function recordExchange(
  db: Db,
  scope: UsageScope,
  call: {
    params: {
      systemInstructions: string;
      input: string;
      images?: string[];
      schemaName: string;
      tier?: WorkTier;
    };
    ok: boolean;
    model: string;
    routing?: Routing;
    inputTokens?: number;
    outputTokens?: number;
    output?: unknown;
    ms: number;
    error?: unknown;
  },
) {
  try {
    const system = clip(call.params.systemInstructions ?? "");
    const input = clip(call.params.input ?? "");

    const { error } = await db.from("model_exchanges").insert({
      company_id: scope.companyId,
      purpose: call.params.schemaName,
      tier: call.params.tier ?? "judgment",
      routing: call.routing ?? null,
      model: call.model,
      ok: call.ok,
      error_kind: call.ok ? null : errorKind(call.error),
      error_message: call.ok
        ? null
        : clip(
            call.error instanceof Error
              ? call.error.message
              : String(call.error),
          ).text,
      system_instructions: system.text,
      input: input.text,
      // 실패한 줄에는 답이 없다. 빈 객체를 넣으면 "답이 비어 있었다" 로 읽힌다.
      output: call.ok ? (call.output ?? null) : null,
      truncated: system.truncated || input.truncated,
      images: call.params.images?.length ?? 0,
      input_tokens: call.inputTokens ?? null,
      output_tokens: call.outputTokens ?? null,
      ms: call.ms,
      work_execution_id: scope.workExecutionId ?? null,
      project_id: scope.projectId ?? null,
      company_employee_id: scope.companyEmployeeId ?? null,
    });

    // 표가 아직 없는 데이터베이스에 배포될 수 있다. 그때 조용히 넘어가면
    // "안 남기고 있다"는 사실 자체를 아무도 모른다 — 한 번은 말한다.
    if (error && !warnedMissingTable) {
      warnedMissingTable = true;
      console.warn(
        "model_exchanges 에 못 적었습니다 — supabase/schema_model_exchanges.sql " +
          "을 적용하십시오. (" + error.message + ")",
      );
    }
  } catch {
    // 일부러 조용하다. 장부가 일을 막지 않는다.
  }
}
