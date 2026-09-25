/** 접수 자(routing_test)가 왜 전부 '호출 실패' 인지 — 오류 전문과 스택. 돈: 호출 1번. */
import { z } from "zod";
const { intakeInstructions } = await import("../../src/lib/chat/routing");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const NL = String.fromCharCode(10);
const ai = defaultProviders().ai;
console.log("공급자:", ai.name, "· 모델:", (ai as { model?: string }).model);
try {
  const r = await ai.generateStructuredOutput({
    systemInstructions: intakeInstructions({ hasImages: false, speaker: null }) + NL + NL + "**지금은 접수만 한다.** `capabilityId` 와 `why` 만 낸다.",
    input: "이 영상 분석해 줘 https://www.youtube.com/watch?v=09r1B9cVEQY",
    schema: z.object({ capabilityId: z.string().nullable(), why: z.string() }),
    schemaName: "routing_probe", maxTokens: 4000, tier: "conversation",
  });
  console.log("됨:", JSON.stringify(r.output), "· 답한 모델:", (r as { answeredBy?: string }).answeredBy);
} catch (e) {
  const err = e as Error;
  console.log("오류 이름:", err.name);
  console.log("메시지:", err.message.split(NL).join(" ").slice(0, 700));
  console.log("스택:", (err.stack ?? "").split(NL).slice(1, 6).join(" | ").slice(0, 600));
}
