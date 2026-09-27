/**
 * **수능 점수로 성능을 잰다** (226회차 2026-09-27, 사장님 "수능 문제 점수로 성능 테스트하는거").
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/suneung_bench.mts [판수]
 *
 * 시험지는 `engine/data/suneung-v0.json`, 정답은 `suneung_key.py` 가 **무작정 세서** 맞춘 것이다.
 * 여기서는 정답을 다시 주장하지 않는다 — 파일에 적힌 것을 그대로 쓰고, 그 파일은 코드가 검산했다.
 *
 * 세 줄을 같은 문제·같은 지시문으로 돌린다. 지시문을 같게 두는 이유: 다르면 모델을 비교한 것이
 * 아니라 프롬프트를 비교한 것이 된다.
 */
import { z } from "zod";
import { readFileSync } from "node:fs";

const { createDeepSeekProvider } = await import("../../src/lib/providers/deepseek");
const { createOpenAIProvider } = await import("../../src/lib/providers/openai");

const 판수 = Number(process.argv[2] ?? 1);
const 시험지 = JSON.parse(readFileSync("engine/data/suneung-v0.json", "utf-8")) as {
  문항: { 번호: number; 배점: number; 문제: string; 정답: string }[];
};
const 만점 = 시험지.문항.reduce((a, q) => a + q.배점, 0);

/** solveDeeply 와 **같은 말**. 시험이 제품보다 좋은 지시문을 쓰면 점수가 제품 점수가 아니다. */
const SYS = [
  "너는 고3 학생에게 알려 준다. 한국어로.",
  "",
  "- **끝까지 풀어라.** 어림잡지 말고, 답이 정해질 때까지 계산한다.",
  "- 계산은 **다른 길로 한 번 더** 확인한다. 두 길이 다르면 어느 쪽이 틀렸는지 찾아라 — 골라잡지 마라.",
  "- 답과 **어떻게 나왔는지**를 같이 쓴다. 학생이 다음 문제를 혼자 풀 수 있을 만큼.",
  "- 끝까지 못 갔으면 **어디서 막혔는지 그대로 말한다.** 짐작을 답처럼 내놓지 마라.",
  "- 짧게. 필요한 단계만.",
  "",
  "`답` 칸에는 **숫자만** 적는다. 분수는 a/b 로. 단위·문장·기호를 넣지 마라.",
].join("\n");
const schema = z.object({ 답: z.string(), 풀이: z.string() });

/** 답 한 칸을 값으로 읽는다. 분수·LaTeX·소수를 같은 값으로 본다. 못 읽으면 null. */
function 값(t: string): number | null {
  let s = t.replace(/\\d?frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\(left|right|,|;|!|\s)/g, "")
    .replace(/[≈=、,\s개가지원점]/g, "")
    .replace(/[()]/g, "");   // rac 을 (a)/(b) 로 바꾼 뒤 괄호를 전부 없앤다 — 앞뒤만 지우면 "(3)/(7)" 이 깨진다
  const m = s.match(/^[+-]?\d+(\.\d+)?\/[+-]?\d+(\.\d+)?$/);
  if (m) { const [a, b] = s.split("/").map(Number); return b === 0 ? null : a / b; }
  const n = s.match(/^[+-]?\d+(\.\d+)?$/);
  return n ? Number(s) : null;
}
const 기대 = (t: string) => 값(t)!;

type Lane = { 이름: string; ai: { generateStructuredOutput: Function }; tier: "judgment" | "conversation" };
const lanes: Lane[] = [
  { 이름: "싼 자리 (deepseek-v4-flash) — 09-27 전 /ask", ai: createDeepSeekProvider(), tier: "conversation" },
  { 이름: "판단 자리 (deepseek-v4-pro) — 지금 /ask", ai: createDeepSeekProvider(), tier: "judgment" },
  { 이름: "gpt-5", ai: createOpenAIProvider(), tier: "judgment" },
];

for (const lane of lanes) {
  let 점수 = 0, 푼것 = 0;
  const 틀린것: string[] = [];
  const 배점별 = new Map<number, [number, number]>();
  for (const q of 시험지.문항) {
    for (let r = 0; r < 판수; r++) {
      let 답 = "(떨어짐)";
      try {
        const { output } = await lane.ai.generateStructuredOutput({
          systemInstructions: SYS, input: q.문제, schema, schemaName: "suneung",
          maxTokens: 16000, tier: lane.tier,
        });
        답 = output.답;
      } catch (e) { 답 = `(떨어짐 ${e instanceof Error ? e.message.slice(0, 30) : e})`; }
      const got = 값(답);
      const ok = got !== null && Math.abs(got - 기대(q.정답)) < 1e-9;
      푼것++;
      if (ok) 점수 += q.배점; else 틀린것.push(`${q.번호}번(${q.배점}점) "${답.slice(0, 18)}" ← ${q.정답}`);
      const [h, t] = 배점별.get(q.배점) ?? [0, 0];
      배점별.set(q.배점, [h + (ok ? 1 : 0), t + 1]);
    }
  }
  const 평균 = 점수 / 판수;
  console.log(`\n=== ${lane.이름} ===`);
  console.log(`  **${평균.toFixed(1)} / ${만점}점**  (100점 환산 ${(평균 * 100 / 만점).toFixed(1)}점)`);
  console.log(`  배점별: ${[...배점별.entries()].sort().map(([b, [h, t]]) => `${b}점 ${h}/${t}`).join(" · ")}`);
  if (틀린것.length) for (const x of 틀린것) console.log(`   틀림 ${x}`);
}
console.log(`\n시험지 ${시험지.문항.length}문항 · 배점 합 ${만점} · ${판수}판씩`);
console.log("정답은 suneung_key.py 가 무작정 세서 맞춘 것이다 — 이 도구는 정답을 주장하지 않는다.");
