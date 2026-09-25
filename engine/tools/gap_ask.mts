/** 로키에게 묻는다: 사람이 시킬 법한데 아직 못 하는 것은? — 지금 능력 목록을 주고, 자가 있는 빈칸 셋을 받는다($0.02). */
import { z } from "zod";
const { capabilityCatalogue } = await import("../../src/lib/chat/routing");
const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
const { writeFileSync } = await import("node:fs");
const NL = String.fromCharCode(10);
const caps = capabilityCatalogue().map((c) => `- ${c.capabilityId}: ${c.label.slice(0, 90)}`).join(NL);
const schema = z.object({ 빈칸: z.array(z.object({ 이름: z.string(), 누가시키나: z.string().describe("어떤 사람이 어떤 말로 시키나 — 실제 말 한 줄"), 자: z.string().describe("기계가 무엇을 재서 됐다고 아나"), 어느AI: z.string().describe("바깥 어느 AI/모델이 하나(지금 열쇠: OpenAI·DeepSeek·Anthropic·Meshy). 없으면 '없음'"), 값: z.string(), 하루안에: z.boolean().describe("하루 안에 붙일 수 있나") })).min(3).max(6), 안한것: z.string() });
const ai = createOpenAIProvider({ judgmentModel: "gpt-5.6-luna" });
const { output } = await ai.generateStructuredOutput({
  systemInstructions: ["너는 작은 AI 회사(로키)의 감독이다. 아래는 지금 할 수 있는 일 목록이다. **사람이 대화창에 시킬 법한데 목록에 없는 일**을 셋~여섯 고른다.", "규칙: 학생·1인 창업자가 실제로 시킬 말로. 기계가 잴 수 있는 자가 있는 것 먼저. 바깥 AI 로 되는 것이면 어느 AI 인지. 지어낸 시장 얘기 말고 일 자체만.", "답은 JSON 하나."].join(NL),
  input: `## 지금 할 수 있는 일${NL}${caps}${NL}${NL}## 회사${NL}학생 사장님 1인 회사. 게임·영상·분석·발표 자료·그림·문구까지 됨. 열쇠: OpenAI(글·그림·TTS), DeepSeek, Anthropic, Meshy(3D). 영상 AI(Veo)는 할당량 바닥.`,
  schema, schemaName: "capability_gaps", maxTokens: 16000, tier: "judgment",
});
writeFileSync("engine/work/anything/gaps.json", JSON.stringify(output, null, 2), "utf8");
for (const [i, g] of output.빈칸.entries()) console.log(`${i + 1}. ${g.이름}${g.하루안에 ? "" : "  [하루 넘음]"}${NL}   시키는 말: ${g.누가시키나}${NL}   자: ${g.자}${NL}   어느 AI: ${g.어느AI} · 값: ${g.값}`);
console.log(NL + "안 한 것: " + output.안한것);
