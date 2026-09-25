import { z } from "zod";
import type { AIProvider } from "@/lib/providers/types";

/**
 * **대본 심판** (215회차 09-25). 그림(veo, ≈$0.6)·목소리를 만들기 **전에** 대본을 지시문과 대 본다.
 *
 * 09-25 광고 판: 지시문 전문("첫 장면에 내 이득·말투 하나로·우리끼리 말 금지·누구의 순간 하나·쓸 수 있는 사실만")이
 * 들어갔는데도 완성 영상의 심판은 "설명서 느낌·이득이 하나로 안 잡힘" 이라 했다 — 그 심판은 다 만든 뒤에 옆에 적힐 뿐이다(09-16 결정).
 * 여기는 **싼 자리에서 한 번 되돌리는 고리**다: 대본 글자만 보고(≈$0.01), 지시문의 규칙을 어겼으면 대본을 한 번 다시 쓴다.
 * 완성 영상을 막지는 않는다 — 되돌림 한 번 뒤엔 그대로 간다. 심판의 말과 되돌림 여부는 결과물에 적힌다.
 */
export const scriptVerdictSchema = z.object({
  되돌린다: z.boolean().describe("지시문의 규칙(사실·말투·첫 장면·대상 등)을 어긴 것이 하나라도 있으면 true."),
  어긴것: z.array(z.string()).describe("어긴 규칙마다 한 줄: 지시문의 어느 줄을, 대본의 어느 장면이 어떻게 어겼나. 없으면 빈 배열."),
  지어낸사실: z.array(z.string()).describe("지시문·재료에 없는 숫자·이름·주장. 없으면 빈 배열."),
  하나만바꾼다면: z.string().describe("대본을 한 군데만 고친다면 무엇을 — 구체적으로. 통과면 빈 문자열."),
});
export type ScriptVerdict = z.infer<typeof scriptVerdictSchema>;

export type SceneLike = { heading: string; bullets: string[]; narration: string; footage?: string; seconds?: number };

export function scriptText(scenes: SceneLike[]): string {
  return scenes.map((s, i) => `장면 ${i + 1}${s.seconds ? ` (${s.seconds}초)` : ""}\n  제목: ${s.heading}\n  본문: ${s.bullets.join(" / ")}\n  읽는 말: ${s.narration}${s.footage ? `\n  화면: ${s.footage}` : ""}`).join("\n\n");
}

export async function judgeScript(ai: AIProvider, o: { ask: string; scenes: SceneLike[] }): Promise<{ verdict: ScriptVerdict; model: string }> {
  const { output, model } = await ai.generateStructuredOutput({
    systemInstructions: [
      "너는 영상 대본을 **지시문과 대 보는** 심판이다. 취향을 말하지 않는다 — 지시문이 시킨 것과 금한 것만 본다.",
      "본다: 지시문에 '지킬 것'·'하지 말 것'·'쓸 수 있는 사실' 이 있으면 대본의 장면마다 그것을 어겼는지. 지시문에 없는 숫자·이름·주장은 지어낸 것이다.",
      "지시문에 규칙이 없으면(주제만 있으면) 지어낸 사실만 본다.",
      "어긴 것이 하나라도 있으면 되돌린다. 어긴 것이 없으면 통과 — 마음에 안 들어도 통과다(취향은 사람 몫).",
      "답은 JSON 하나.",
    ].join("\n"),
    input: `## 지시문(사람이 한 말 그대로)\n${o.ask}\n\n## 대본\n${scriptText(o.scenes)}`,
    schema: scriptVerdictSchema, schemaName: "script_verdict", maxTokens: 16000, tier: "judgment",   // 6000 은 라우터의 생각 모드(deepseek-pro)에 잘렸다(첫 서버 판 TRUNCATED) — 예측자·계획과 같은 함정
  });
  return { verdict: output, model };
}
