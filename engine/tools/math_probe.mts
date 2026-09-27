/**
 * **풀어야 아는 물음을 싼 자리와 판단 자리에 나란히 대 본다** (226회차 2026-09-27,
 * 사장님 "로키 수학문제라도 알려줘 그게 좋을듯").
 *
 * 대화는 싼 자리에서 생각 토큰 3000 으로 돈다. 수능 수학을 그 안에서 풀면 생각이 잘리고 답만
 * 그럴듯하게 나온다. 같은 문제를 두 자리에 주고 **답이 맞는지** 본다 — 정답은 내가 들고 채점한다.
 */
import { z } from "zod";
import { defaultProviders } from "../../src/lib/execution/shared";

// 첫 판: 쉬운 문제 넷을 싼 자리가 **4/4** 로 맞혔다. "싼 자리는 수학을 못 푼다" 는 내 짐작이 틀렸다.
// 그래서 4점짜리로 올린다 — 여러 단계를 엮어야 하고 한 군데만 어긋나도 답이 달라지는 것들.
const 문제 = [
  { q: "수열 {a_n} 이 a_1 = 2 이고 모든 자연수 n 에 대해 a_(n+1) = a_n + 2n 을 만족한다. a_10 의 값을 구하시오.", a: "92" },
  { q: "삼차함수 f(x) = x³ + ax² + bx + c 가 x = 1 에서 극대, x = 3 에서 극소이고 극댓값이 4 일 때 극솟값을 구하시오.", a: "0" },
  { q: "0 이상 9 이하의 정수 x, y, z 에 대하여 x + y + z = 12 를 만족하는 순서쌍 (x,y,z) 의 개수를 구하시오.", a: "73" },
  { q: "함수 f(x) = ∫(0→x) (t² - 4t + 3) dt 의 극댓값과 극솟값의 차를 구하시오.", a: "4/3" },
  { q: "주사위를 4번 던져 나온 눈의 곱이 짝수일 확률을 구하시오.", a: "15/16" },
  { q: "등비수열 {a_n} 의 첫째항이 3, 공비가 2 일 때, 첫째항부터 제n항까지의 합이 3069 가 되는 n 을 구하시오.", a: "10" },
];
const schema = z.object({ 답: z.string(), 풀이: z.string() });
const SYS = "너는 고3 학생에게 수학을 알려 준다. 끝까지 풀고, 답과 함께 어떻게 나왔는지 적는다.";

for (const [name, tier, tok] of [["싼 자리(지금 대화)", "routine", 3000]] as const) {
  console.log(`\n=== ${name} ===`);
  let hit = 0;
  for (const p of 문제) {
    try {
      const { output, model } = await defaultProviders().ai.generateStructuredOutput({
        systemInstructions: SYS, input: p.q, schema, schemaName: "math", maxTokens: tok, tier,
      });
      // 채점 자가 LaTeX 를 못 읽어 맞는 답(\frac{22}{35})을 틀렸다고 했다 — 자를 먼저 고친다.
      const norm = (t: string) => t
        .replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "$1/$2")
        .replace(/\\[a-zA-Z]+/g, "").replace(/[{}$\s,]/g, "");
      const ok = norm(output.답).includes(norm(p.a));
      if (ok) hit++;
      console.log(`  ${ok ? "맞음" : "틀림"} ${p.q.slice(0, 26)}… → "${output.답.slice(0, 24)}" (정답 ${p.a}) [${model}]`);
    } catch (e) { console.log(`  떨어짐 ${p.q.slice(0, 26)}… ${e instanceof Error ? e.message.slice(0, 50) : e}`); }
  }
  console.log(`  **${hit}/${문제.length}**`);
}
