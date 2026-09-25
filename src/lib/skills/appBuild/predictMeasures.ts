import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider } from "@/lib/providers/types";
import type { SourceFile } from "@/lib/skills/appBuild/patch";
import { checkGuards, type WebGuard } from "@/lib/skills/appBuild/webMeasures";

/**
 * **재는 자를 예측자로** (213회차 09-25, 사장님 "재는 자를 예측자로 강화시켜줘").
 *
 * 지금까지 자는 **돌린 뒤에** 값을 읽었다. 이제 고치는 자리가 **돌리기 전에** 그 값을 적고 잠근다 —
 * "이 파일을 재면 높이 118·공중 44 이 나올 것이고, 난간을 다 지킬 확률은 0.7 이다." 그리고 잰 값과 대 본다.
 * 맞아 가면 로키가 코드를 읽고 결과를 아는 것이고, 안 맞으면 감으로 고치는 것이다 — "똑똑한가" 의 자.
 *
 * 제네시스의 예측(work_predictions, 승인 확률)과 같은 결이다: **행동 이전에 적고, 결과 이전에 잠근다.**
 * 잠금은 실행 행(metrics_json.predictions)에 재기 전에 쓰는 것으로 한다 — DB 트리거는 아직 없다(v1). 채점은 같은 자리에 덧붙인다.
 * 값은 바퀴당 flash 한 번(~$0.002). 예측을 못 남겨도 고리는 돈다(예측 실패가 일을 막을 이유는 없다).
 */
const schema = z.object({
  값: z.array(z.object({ measure: z.string(), value: z.number().nullable() })).describe("난간의 칸마다 잰 값이 얼마로 나올지. 모르면 null."),
  통과확률: z.number().min(0).max(1).describe("이번 판이 난간을 전부 지킬 확률(0~1). 상시 난간(게임.클리어)도 포함."),
  근거: z.string().describe("한두 문장. 코드의 어느 값에서 그렇게 셈했나."),
});
export type Prediction = { round: number; at: string; 값: Record<string, number | null>; 통과확률: number; 근거: string };
export type PredScore = {
  통과확률: number; 통과: boolean; brier: number;
  /** 칸마다 |예측 − 실측|. 둘 다 숫자일 때만. */
  오차: Record<string, number>;
  /** 예측한 칸 중 실측이 있어 견준 개수. */
  견줌: number;
};

export async function predictMeasures(ai: AIProvider, input: {
  guards: WebGuard[]; files: SourceFile[]; round: number;
  lastMeasured?: Record<string, number> | null; lastEdits?: string[];
}): Promise<Prediction | null> {
  const main = input.files.find((f) => /\.html?$/i.test(f.path)) ?? input.files[0];
  if (!main) return null;
  const NL = String.fromCharCode(10);
  try {
    const { output } = await ai.generateStructuredOutput({
      systemInstructions: [
        "너는 게임 코드를 읽고 **돌리기 전에** 잰 값을 예측하는 AI 다. 돌린 뒤 기계가 실제로 재서 네 예측과 대 본다.",
        "예측은 코드의 숫자(속도·중력·구간)에서 셈해서 낸다. 감으로 적지 마라. 못 셈하는 칸은 null.",
        "통과확률은 난간 전부를 지킬 확률이다. 자신 없으면 0.5 근처, 셈이 서면 0.9 나 0.1 쪽으로.",
        "답은 JSON 하나.",
      ].join(NL),
      input: [
        `## 난간(지켜야 하는 것)`,
        ...input.guards.map((g) => `- ${g.measure}: ${g.min ?? "-"} ~ ${g.max ?? "-"}`),
        "",
        input.lastMeasured ? `## 지난 바퀴에 실제로 잰 값${NL}${Object.entries(input.lastMeasured).map(([k, v]) => `- ${k} = ${v}`).join(NL)}` : "## 아직 잰 적 없다(첫 바퀴)",
        "",
        input.lastEdits?.length ? `## 이번 판에서 고친 것${NL}${input.lastEdits.map((e) => `- ${e}`).join(NL)}` : "",
        "",
        `## 파일 ${main.path} (${main.contents.length}자)`,
        main.contents.slice(0, 60_000),
      ].join(NL),
      schema, schemaName: "measure_prediction", maxTokens: 1500, tier: "judgment",
    });
    const 값: Record<string, number | null> = {};
    for (const v of output.값) 값[v.measure] = v.value;
    return { round: input.round, at: new Date().toISOString(), 값, 통과확률: output.통과확률, 근거: output.근거 };
  } catch (e) {
    console.warn("[예측] 못 남김 —", e instanceof Error ? e.message.slice(0, 120) : e);
    return null;
  }
}

/** 잰 값과 대 본다. 순수 함수 — 심어서 잴 수 있다. */
export function scorePrediction(pred: Prediction, measured: Record<string, number> | undefined, guards: WebGuard[]): PredScore {
  const 통과 = checkGuards(measured, guards).length === 0;
  const brier = Math.round((pred.통과확률 - (통과 ? 1 : 0)) ** 2 * 1000) / 1000;
  const 오차: Record<string, number> = {};
  let 견줌 = 0;
  for (const [k, v] of Object.entries(pred.값)) {
    const m = measured?.[k];
    if (typeof v === "number" && typeof m === "number") { 오차[k] = Math.round(Math.abs(v - m) * 10) / 10; 견줌++; }
  }
  return { 통과확률: pred.통과확률, 통과, brier, 오차, 견줌 };
}

type Row = { predictions?: unknown[] } & Record<string, unknown>;
/** 재기 **전에** 실행 행에 적는다. 실패해도 던지지 않는다. */
export async function lockPrediction(db: SupabaseClient, executionId: string, pred: Prediction): Promise<void> {
  try {
    const { data } = await db.from("work_executions").select("metrics_json").eq("id", executionId).maybeSingle();
    const m = ((data?.metrics_json as Row | null) ?? {}) as Row;
    const list = Array.isArray(m.predictions) ? m.predictions : [];
    await db.from("work_executions").update({ metrics_json: { ...m, predictions: [...list, pred] }, updated_at: new Date().toISOString() }).eq("id", executionId);
  } catch (e) { console.warn("[예측] 잠금 실패 —", e instanceof Error ? e.message : e); }
}

/** 잰 뒤 같은 행의 그 바퀴 예측에 채점을 덧붙인다. 예측 값은 건드리지 않는다. */
export async function markScored(db: SupabaseClient, executionId: string, round: number, score: PredScore, measured: Record<string, number> | undefined): Promise<void> {
  try {
    const { data } = await db.from("work_executions").select("metrics_json").eq("id", executionId).maybeSingle();
    const m = ((data?.metrics_json as Row | null) ?? {}) as Row;
    const list = (Array.isArray(m.predictions) ? m.predictions : []) as (Prediction & { 채점?: PredScore; 실측?: Record<string, number> })[];
    const next = list.map((p) => (p.round === round && !p.채점 ? { ...p, 채점: score, 실측: measured ?? {} } : p));
    await db.from("work_executions").update({ metrics_json: { ...m, predictions: next }, updated_at: new Date().toISOString() }).eq("id", executionId);
  } catch (e) { console.warn("[예측] 채점 저장 실패 —", e instanceof Error ? e.message : e); }
}
