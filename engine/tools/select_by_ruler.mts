/**
 * **고르는 자 첫 판 — 비서 말투** (11-23). 설계·판정식: engine/docs/select-by-ruler-design.md (잠금).
 *   npx tsx engine/tools/select_by_ruler.mts --mock            # 모델 0 · 돈 0, 끝까지 도는지
 *   npx tsx engine/tools/select_by_ruler.mts --mock --sabotage # 사실 자가 빠진 사실을 잡는지
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/select_by_ruler.mts   # 본판, 상한 $1.4
 *
 * 팔: S1 luna×1 · S5 luna×5 → checkVoice 가 고름 · B1 gpt-5×1. 말마다 3번.
 */
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { checkVoice, voiceScore, secretaryNote, type VoiceOptions } from "../../src/lib/chat/voice";
import { selfNote } from "../../src/lib/chat/persona";

const MOCK = process.argv.includes("--mock");
const SAB = process.argv.includes("--sabotage");
const REP = 3, N = 5, CAP = 1.4;
const CHEAP = "gpt-5.6-luna", BIG = "gpt-5";
if (!MOCK && process.env.GENESIS_SPEND !== "i-approve") { console.error("돈이 든다. GENESIS_SPEND=i-approve 로."); process.exit(1); }

// ---- 재료: voice_live.mts 와 같은 말·같은 일감 ----
type Q = { 물음: string; opts: VoiceOptions; 사실: ((t: string) => boolean) | null };
const any = (...ws: string[]) => (t: string) => ws.some((w) => t.includes(w));
const 손 = (t: string) => [["SQL", "schema_laptop_jobs"], ["railway"], ["시크릿"]].filter((ws) => ws.some((w) => t.includes(w))).length >= 2;
const 판: Q[] = [
  { 물음: "앱이랑 내 노트북에 있는 클로드 코드랑 연결 됨?", opts: { owner: true }, 사실: any("laptop_jobs", "테이블") },
  { 물음: "배포 됐어?", opts: { owner: true }, 사실: any("17") },
  { 물음: "지금 돈 얼마 썼어?", opts: { owner: true }, 사실: any("0.19") },
  { 물음: "그거 왜 안 됐어", opts: { owner: true }, 사실: any("laptop_jobs", "테이블") },
  { 물음: "할 거 정리해줘", opts: { owner: true }, 사실: 손 },
  { 물음: "MCP 그거 끝난 거 맞아?", opts: { owner: true }, 사실: any("16", "339") },
  { 물음: "내가 뭐 해야 돼", opts: { owner: true }, 사실: 손 },
  { 물음: "그 우성이라고 사문 4따리 있거든?", opts: { owner: true, smalltalk: true }, 사실: null },
];
const 일감 = [
  "", "## 이 회사의 일 (지금 사실)",
  "- MCP 콘센트: 끝남. 검사 16개 전부 통과, 한 장 재는 데 339ms.",
  "- 앱→노트북 고리: 코드만 끝남. laptop_jobs 테이블이 없어서 **못 돌려 봤다**.",
  "- 배포: 안 나간 것 17건.",
  "- 사장님 손이 필요한 것: ① Supabase SQL 편집기에 schema_laptop_jobs.sql 붙이기",
  "  ② railway up --service rookery-web ③ 구글 클라이언트 시크릿 새로 발급",
  "- 지출: 이번 달 $0.19. 한도 $14.",
].join("\n");
const SYS = selfNote() + "\n" + 일감 + "\n" + secretaryNote() + "\n\n답은 `답` 칸에 사람에게 보낼 그대로 적는다.";
const SYS_DS = selfNote() + "\n" + 일감 + "\n" + secretaryNote();
// --deepseek: 싼 AI 만(11-23 14:1x 다시 잠금). B1 은 안 부른다.
const DS = process.argv.includes("--deepseek");
const DSKEY = DS ? ((await import("node:fs")).readFileSync(".env.local", "utf8").match(/^DEEPSEEK_API_KEY=(.*)$/m) ?? [])[1]?.trim() : "";
if (DS && !DSKEY) { console.error("DEEPSEEK_API_KEY 가 없다."); process.exit(1); }

// ---- 부르기 ----
let spent = 0;
type A = { text: string | null; usd: number };
const schema = z.object({ 답: z.string() });
async function call(model: string, q: Q, k: number): Promise<A> {
  if (MOCK) {
    // 가짜: 좋은 답·머리말 답·물음표 답·사실 빠진 답을 섞는다. 값은 실제 어림에 맞춘다.
    const good = `아직입니다. 안 나간 것 17건, laptop_jobs 테이블 없음, 지출 $0.19, 검사 16개.\n\n\`railway up\` 돌리고 SQL 붙이고 시크릿 발급해 주세요.`;
    const bad = ["네, " + good, good + "\n더 궁금한 게 있으세요?", "확인해 보니 아마도 잘 되고 있는 것 같습니다."];
    const t = SAB ? "끝났습니다. 다 됐습니다." : (k + q.물음.length) % 3 === 0 ? good : bad[(k + q.물음.length) % bad.length];
    const usd = model === BIG ? 0.018 : 0.0008;
    spent += usd; return { text: t, usd };
  }
  if (spent >= CAP) return { text: null, usd: 0 };   // 상한: 안 부른다(끄는 게 아니다)
  if (DS) {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + DSKEY },
      body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: SYS_DS }, { role: "user", content: q.물음 }], max_tokens: 700, temperature: 0.7 }),
      signal: AbortSignal.timeout(120_000),
    }).catch((e) => { console.log(`   못 닿음: ${String(e).slice(0, 60)}`); return null; });
    if (!r || !r.ok) { if (r) console.log(`   못 닿음 HTTP ${r.status}: ${(await r.text()).slice(0, 80)}`); return { text: null, usd: 0 }; }
    const j = await r.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const usd = ((j.usage?.prompt_tokens ?? 0) * 0.28 + (j.usage?.completion_tokens ?? 0) * 0.42) / 1e6;
    spent += usd; return { text: j.choices?.[0]?.message?.content ?? null, usd };
  }
  const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
  const { costOf } = await import("../../src/lib/costs/pricing");
  const ai = createOpenAIProvider({ judgmentModel: model });
  try {
    const r = await ai.generateStructuredOutput({ systemInstructions: SYS, input: q.물음, schema, schemaName: "reply", maxTokens: 16000, tier: "judgment" });
    const usd = costOf({ backend: model, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
    spent += usd; return { text: String((r.output as { 답: string }).답), usd };
  } catch (e) {
    const x = e as { inputTokens?: number; outputTokens?: number; message?: string };
    const usd = costOf({ backend: model, inputTokens: x.inputTokens ?? 0, outputTokens: x.outputTokens ?? 0 });
    spent += usd; console.log(`   못 닿음 ${model}: ${String(x.message ?? e).slice(0, 60)}`); return { text: null, usd };
  }
}
const voiceFails = (t: string, q: Q) => voiceScore(checkVoice(t, q.opts)).fail;

// ---- 돌리기 ----
type Arm = { pass: number; fact: number; factN: number; n: number; miss: number; usd: number; picked: { 물음: string; 답: string }[] };
const arm = (): Arm => ({ pass: 0, fact: 0, factN: 0, n: 0, miss: 0, usd: 0, picked: [] });
const R: Record<"S1" | "S5" | "B1", Arm> = { S1: arm(), S5: arm(), B1: arm() };
const tally = (a: Arm, q: Q, t: string | null) => {
  if (t === null) { a.miss++; return; }
  a.n++; if (voiceFails(t, q) === 0) a.pass++;
  if (q.사실) { a.factN++; if (q.사실(t)) a.fact++; }
  if (a.picked.length < 8 && !a.picked.some((p) => p.물음 === q.물음)) a.picked.push({ 물음: q.물음, 답: t });
};
const t0 = Date.now();
for (const q of 판) {
  for (let r = 0; r < REP; r++) {
    const cs = await Promise.all(Array.from({ length: N }, (_, k) => call(CHEAP, q, r * N + k)));
    const b = DS ? { text: null, usd: 0 } : await call(BIG, q, r);
    const cheapUsd = cs.reduce((s, c) => s + c.usd, 0);
    // S1 = 첫 답 그대로(같은 분포, 따로 안 부름)
    R.S1.usd += cs[0].usd; tally(R.S1, q, cs[0].text);
    // S5 = 자가 고름: 어긴 칸이 가장 적은 것, 같으면 먼저 온 것
    const ok = cs.filter((c) => c.text !== null) as { text: string; usd: number }[];
    const best = ok.length ? ok.reduce((m, c) => (voiceFails(c.text, q) < voiceFails(m.text, q) ? c : m)) : null;
    R.S5.usd += cheapUsd; tally(R.S5, q, best ? best.text : null);
    R.B1.usd += b.usd; tally(R.B1, q, b.text);
  }
  process.stdout.write(`· ${q.물음.slice(0, 14)} ($${spent.toFixed(3)})\n`);
}

// ---- 판정 (잠금 그대로) ----
console.log(`\n${MOCK ? "[가짜 판 — 숫자는 의미 없음] " : ""}${SAB ? "[고장 심음] " : ""}`);
for (const [k, a] of Object.entries(R)) console.log(`  ${k}  말투 ${a.pass}/${a.n} · 사실 ${a.fact}/${a.factN} · 못 잼 ${a.miss} · $${a.usd.toFixed(4)}`);
const S5 = R.S5, B1 = R.B1;
if (DS) {
  const S1 = R.S1;
  const void2 = S1.miss > 4 || S5.miss > 4 || S1.n === 0;
  const up = S5.pass - S1.pass;
  const v = void2 ? (S1.n === 0 ? "못 잼(DeepSeek 이 안 닿음)" : "무효(못 잼이 1/6 넘음)")
    : up >= 6 && S5.fact >= S1.fact - 2 ? "고르기가 이김" : up >= 6 ? "말투만 이김" : "못 이김";
  console.log(`\n판정(다시 잠근 식): ${v} · 말투 +${up} · 사실 ${S5.fact - S1.fact >= 0 ? "+" : ""}${S5.fact - S1.fact} · S5 값 = S1 의 ${S1.usd ? (S5.usd / S1.usd).toFixed(1) : "-"}배 · 총 $${spent.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
  mkdirSync("engine/work/select-by-ruler", { recursive: true });
  writeFileSync("engine/work/select-by-ruler/deepseek.json", JSON.stringify({ at: new Date().toISOString(), R, spent }, null, 1));
  console.log("고른 답: engine/work/select-by-ruler/deepseek.json");
  process.exit(0);
}
const void_ = Object.values(R).some((a) => a.miss > 4);
const win = S5.pass >= B1.pass && S5.usd <= B1.usd * 0.5;
const voiceOnly = win && S5.fact < B1.fact - 2;
console.log(`\n판정: ${void_ ? "무효(못 잼이 1/6 넘음)" : voiceOnly ? "말투만 이김" : win ? "이김" : "못 이김"} (S5 값 = B1 의 ${((S5.usd / B1.usd) * 100).toFixed(0)}%) · 총 $${spent.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
if (SAB) { const caught = Object.values(R).every((a) => a.fact === 0); console.log(`사실 자 이빨: ${caught ? "잡음 ✓" : "못 잡음 ✗"}`); process.exit(caught ? 0 : 1); }

mkdirSync("engine/work/select-by-ruler", { recursive: true });
const out = `engine/work/select-by-ruler/${MOCK ? "mock" : "live"}.json`;
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), R, spent }, null, 1));
console.log(`고른 답(사람이 읽을 것): ${out}`);
