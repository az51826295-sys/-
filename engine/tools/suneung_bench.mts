/**
 * **수능 점수로 성능을 잰다 — 수학·과학 전반** (226회차 2026-09-27).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/suneung_bench.mts [판수] [--lanes 1,2] [--과목 물리]
 *
 * 시험지는 `engine/data/suneung-v0.json`(53문항 183점: 수학·물리·화학·생명·지구),
 * 정답은 `suneung_key.py` 가 세서 맞춘 것이다. 여기서는 정답을 다시 주장하지 않는다.
 *
 * 줄마다 **같은 문제·같은 지시문**으로 돌린다. 지시문이 다르면 모델을 비교한 것이 아니라
 * 프롬프트를 비교한 것이 된다.
 *
 * **자를 정직하게 읽는 법**: `검산방식` 이 "셈" 이면 정답이 내 풀이와 독립이다(경우를 전부
 * 돌려 봤다). "식" 이면 내 계산을 옮긴 것이라, 내가 법칙을 잘못 세웠으면 이 자는 못 잡는다.
 * 과학은 대개 "식" 이다 — 물리 법칙은 어차피 사람이 넣는다. 점수표에 같이 적는다.
 */
import { z } from "zod";
import { readFileSync } from "node:fs";

const { createDeepSeekProvider } = await import("../../src/lib/providers/deepseek");
const { createOpenAIProvider } = await import("../../src/lib/providers/openai");

const arg = (name: string) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const 판수 = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 1);
const 고른줄 = arg("--lanes")?.split(",").map(Number) ?? null;
const 고른과목 = arg("--과목");

type 문항 = {
  번호: number;
  과목: string;
  배점: number;
  문제: string;
  정답: string;
  검산방식: "셈" | "식";
};
const 전체 = (JSON.parse(readFileSync("engine/data/suneung-v0.json", "utf-8")) as { 문항: 문항[] }).문항;
const 시험지 = 고른과목 ? 전체.filter((q) => q.과목 === 고른과목) : 전체;
const 과목들 = [...new Set(시험지.map((q) => q.과목))];
const 만점 = (qs: 문항[]) => qs.reduce((a, q) => a + q.배점, 0);

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

/** 답 한 칸을 값으로 읽는다. 분수·LaTeX·소수를 같은 값으로 본다. 애매하면 null — 부풀지 않게. */
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

type Lane = { 이름: string; ai: { generateStructuredOutput: Function }; tier: "judgment" | "conversation" };
const lanes: Lane[] = [
  { 이름: "싼 자리 deepseek-v4-flash — 09-27 오전까지의 /ask", ai: createDeepSeekProvider(), tier: "conversation" },
  { 이름: "판단 자리 deepseek-v4-pro — 지금의 /ask", ai: createDeepSeekProvider(), tier: "judgment" },
  { 이름: "gpt-5", ai: createOpenAIProvider(), tier: "judgment" },
];

console.log(
  `시험지 ${시험지.length}문항 ${만점(시험지)}점 · ${판수}판씩\n` +
    과목들
      .map((k) => {
        const qs = 시험지.filter((q) => q.과목 === k);
        return `  ${k} ${qs.length}문항 ${만점(qs)}점 (정답이 내 풀이와 독립인 것 ${qs.filter((q) => q.검산방식 === "셈").length}/${qs.length})`;
      })
      .join("\n"),
);

for (const [i, lane] of lanes.entries()) {
  if (고른줄 && !고른줄.includes(i + 1)) continue;
  const 딴점수 = new Map<string, number>();
  const 틀린것: string[] = [];
  for (const q of 시험지) {
    for (let r = 0; r < 판수; r++) {
      let 답 = "(떨어짐)";
      try {
        const { output } = await lane.ai.generateStructuredOutput({
          systemInstructions: SYS,
          input: q.문제,
          schema,
          schemaName: "suneung",
          maxTokens: 16000,
          tier: lane.tier,
        });
        답 = output.답;
      } catch (e) {
        답 = `(떨어짐 ${e instanceof Error ? e.message.slice(0, 26) : e})`;
      }
      const got = 값(답);
      const 기대 = 값(q.정답)!;
      const ok = got !== null && Math.abs(got - 기대) < 1e-9;
      if (ok) 딴점수.set(q.과목, (딴점수.get(q.과목) ?? 0) + q.배점);
      else 틀린것.push(`${q.과목} ${q.번호}번(${q.배점}점) "${답.slice(0, 16)}" ← ${q.정답}${q.검산방식 === "식" ? " [식]" : ""}`);
    }
  }
  const 총점 = [...딴점수.values()].reduce((a, b) => a + b, 0) / 판수;
  console.log(`\n=== ${lane.이름} ===`);
  console.log(`  **전체 ${총점.toFixed(1)} / ${만점(시험지)}점** (100점 환산 ${((총점 * 100) / 만점(시험지)).toFixed(1)}점)`);
  for (const k of 과목들) {
    const qs = 시험지.filter((q) => q.과목 === k);
    const s = (딴점수.get(k) ?? 0) / 판수;
    console.log(`    ${k.padEnd(3)} ${s.toFixed(1)} / ${만점(qs)}점 → 100점 환산 ${((s * 100) / 만점(qs)).toFixed(1)}`);
  }
  for (const x of 틀린것) console.log(`   틀림 ${x}`);
}

console.log("\n정답은 suneung_key.py 가 세서 맞춘 것이다 — 이 도구는 정답을 주장하지 않는다.");
console.log("[식] 표시가 붙은 틀림은 **내 계산이 틀렸을 수도 있다** — 그 줄은 사람이 다시 본다.");
