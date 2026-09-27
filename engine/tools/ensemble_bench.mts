/**
 * **싼 모델 둘을 엮어서 비싼 자리를 이기는가** (226회차 2026-09-27).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ensemble_bench.mts [--시험지 …]
 *
 * 사장님 09-27: *"어떤 성능이냐가 문제가 아니라 어떻게 쓰냐가 문제야"* → *"로키의 지능 높이기"*.
 *
 * 오늘 재 보니 한 모델의 성능은 이미 천장이었다(deepseek-v4-pro 와 gpt-5 가 65문항에서 동점).
 * 그러면 남은 길은 **엮는 법**이다. 로키는 "AI 를 잘 다루는 AI" 이므로, 더 좋은 모델을 사는 것이
 * 아니라 **잘 쓰는 것**으로 올라가야 한다.
 *
 * 구조: 서로 다른 회사의 **싼** 모델 둘에게 같은 문제를 준다.
 *   · 답이 같으면 → 그대로 쓴다 (비싼 호출 0)
 *   · 답이 갈리면 → 그때만 판단 자리로 올린다
 *
 * **제일 위험한 칸을 같이 센다: 둘이 같은데 둘 다 틀린 경우.** 겹쳐 틀리는 일이 잦으면
 * 이 구조는 못 쓴다 — "같다" 는 "맞다" 가 아니다([[count-paths-and-split-the-tally]]).
 */
import { z } from "zod";
import { readFileSync } from "node:fs";

const { createDeepSeekProvider } = await import("../../src/lib/providers/deepseek");
const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
const { costOf } = await import("../../src/lib/costs/pricing");

/** 실제 토큰을 세서 값을 매긴다. 단가는 내가 적지 않고 pricing.ts 를 읽는다. */
const 쓴것 = new Map<string, { 들어간: number; 나온: number }>();
function 적기(model: string, i: number, o: number) {
  const r = 쓴것.get(model) ?? { 들어간: 0, 나온: 0 };
  r.들어간 += i;
  r.나온 += o;
  쓴것.set(model, r);
}
function 값어치(model: string): number | null {
  const r = 쓴것.get(model);
  if (!r) return null;
  // 단가를 여기 다시 적지 않는다 — 회사가 쓰는 계산기를 그대로 부른다.
  const c = costOf({ backend: model, inputTokens: r.들어간, outputTokens: r.나온 });
  return c > 0 ? c : null;
}

const arg = (n: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const 시험지경로 = arg("--시험지") ?? "engine/data/suneung-v0.json";

type 문항 = { 번호: number; 과목: string; 배점: number; 문제: string; 정답: string };
const 시험지 = (JSON.parse(readFileSync(시험지경로, "utf-8")) as { 문항: 문항[] }).문항;
const 만점 = 시험지.reduce((a, q) => a + q.배점, 0);

const SYS = [
  "너는 고3 학생에게 알려 준다. 한국어로.",
  "",
  "- **끝까지 풀어라.** 어림잡지 말고, 답이 정해질 때까지 계산한다.",
  "- 계산은 **다른 길로 한 번 더** 확인한다. 두 길이 다르면 어느 쪽이 틀렸는지 찾아라 — 골라잡지 마라.",
  "- 답과 **어떻게 나왔는지**를 같이 쓴다.",
  "- 끝까지 못 갔으면 **어디서 막혔는지 그대로 말한다.** 짐작을 답처럼 내놓지 마라.",
  "",
  "`답` 칸에는 **숫자만** 적는다. 분수는 a/b 로. 단위·문장·기호를 넣지 마라.",
].join("\n");
const schema = z.object({ 답: z.string(), 풀이: z.string() });

function 값(t: string): number | null {
  const s = t
    .replace(/\\d?frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\(left|right|,|;|!|\s)/g, "")
    .replace(/[≈=、,\s개가지원점]/g, "")
    .replace(/[()]/g, "");
  if (/^[+-]?\d+(\.\d+)?\/[+-]?\d+(\.\d+)?$/.test(s)) {
    const [a, b] = s.split("/").map(Number);
    return b === 0 ? null : a / b;
  }
  return /^[+-]?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
const 같은값 = (a: number | null, b: number | null) =>
  a !== null && b !== null && Math.abs(a - b) < 1e-9;

const 딥 = createDeepSeekProvider();
const 오픈 = createOpenAIProvider();

async function 물어(
  ai: { generateStructuredOutput: Function },
  tier: "conversation" | "judgment",
  문제: string,
): Promise<{ 값: number | null; 원문: string }> {
  try {
    const { output, model, inputTokens, outputTokens } = await ai.generateStructuredOutput({
      systemInstructions: SYS,
      input: 문제,
      schema,
      schemaName: "suneung",
      maxTokens: 16000,
      tier,
    });
    적기(model, inputTokens ?? 0, outputTokens ?? 0);
    return { 값: 값(output.답), 원문: output.답 };
  } catch (e) {
    return { 값: null, 원문: `(떨어짐 ${e instanceof Error ? e.message.slice(0, 22) : e})` };
  }
}

let 점수A = 0, 점수B = 0, 점수엮음 = 0;
let 같음 = 0, 같은데둘다틀림 = 0, 올림 = 0, 올려서맞음 = 0;
const 겹쳐틀린것: string[] = [];

console.log(`시험지 ${시험지경로.split("/").pop()} · ${시험지.length}문항 ${만점}점`);
console.log("A = deepseek-v4-flash(싼 자리) · B = gpt-5-mini(싼 자리) · 올림 = deepseek-v4-pro(판단 자리)\n");

for (const q of 시험지) {
  const 기대 = 값(q.정답)!;
  const [a, b] = await Promise.all([물어(딥, "conversation", q.문제), 물어(오픈, "conversation", q.문제)]);
  const aOk = 같은값(a.값, 기대);
  const bOk = 같은값(b.값, 기대);
  if (aOk) 점수A += q.배점;
  if (bOk) 점수B += q.배점;

  let 뽑은: number | null;
  if (같은값(a.값, b.값)) {
    같음++;
    뽑은 = a.값;
    if (!aOk) {
      같은데둘다틀림++;
      겹쳐틀린것.push(`${q.과목} ${q.번호}번(${q.배점}점) 둘 다 "${a.원문.slice(0, 14)}" ← ${q.정답}`);
    }
  } else {
    올림++;
    const c = await 물어(딥, "judgment", q.문제);
    뽑은 = c.값;
    if (같은값(c.값, 기대)) 올려서맞음++;
  }
  if (같은값(뽑은, 기대)) 점수엮음 += q.배점;
}

const 퍼센트 = (x: number) => `${((x * 100) / 만점).toFixed(1)}`;
console.log(`A 혼자 (flash)        ${점수A} / ${만점}  (${퍼센트(점수A)})`);
console.log(`B 혼자 (gpt-5-mini)   ${점수B} / ${만점}  (${퍼센트(점수B)})`);
console.log(`**엮음**              ${점수엮음} / ${만점}  (${퍼센트(점수엮음)})`);
console.log(`(참고) 판단 자리 혼자는 앞선 판에서 ${만점} / ${만점} 이었다\n`);
console.log(`둘이 같았던 문항      ${같음} / ${시험지.length}  → 그중 **둘 다 틀린 것 ${같은데둘다틀림}**`);
console.log(`갈려서 올린 문항      ${올림} / ${시험지.length}  → 올려서 맞힌 것 ${올려서맞음}`);
console.log(`비싼 호출 아낀 비율    ${((같음 * 100) / 시험지.length).toFixed(0)}%`);
console.log("\n값 — 실제 센 토큰 × pricing.ts 단가:");
let 총 = 0;
for (const [m, r] of 쓴것) {
  const c = 값어치(m);
  총 += c ?? 0;
  console.log(`  ${m.padEnd(20)} 들어간 ${r.들어간.toLocaleString()} 나온 ${r.나온.toLocaleString()} → ${c === null ? "단가 모름" : "$" + c.toFixed(4)}`);
}
console.log(`  엮음 한 판 합계 $${총.toFixed(4)} (문항당 $${(총 / 시험지.length).toFixed(5)})`);
const 판단만 = 값어치("deepseek-v4-pro");
if (판단만 !== null && 올림 > 0) {
  const 문항당판단 = 판단만 / 올림;
  console.log(`  판단 자리 혼자 돌렸다면 어림 $${(문항당판단 * 시험지.length).toFixed(4)} (올린 ${올림}문항의 실제 단가로 환산)`);
}

if (겹쳐틀린것.length) {
  console.log("\n**겹쳐 틀린 것 — 여기서는 '같다' 가 '맞다' 가 아니었다:**");
  for (const x of 겹쳐틀린것) console.log(`   ${x}`);
}
