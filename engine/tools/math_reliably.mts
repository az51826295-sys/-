/**
 * **수학은 흔들리면 안 된다** (226회차 2026-09-27).
 *
 * math_probe 는 문제마다 한 번씩 물어 6/6 이 나왔다. 그런데 chat_bench 에서 같은 문제를
 * 다시 물었더니 **55(틀림)** 이 나왔다 — 앞서 맞은 73 은 deepseek 이 잘린 뒤 gpt-5-mini 가
 * 낸 것이었다. 한 번씩 재는 것으로는 "맞힌다" 를 말할 수 없다.
 *
 * 그래서 같은 문제를 여러 번 던져 **몇 번 맞히는지** 센다. 학생은 틀린 답을 알아볼 수 없으므로
 * 여기서는 흔들림 자체가 고장이다.
 */
import { z } from "zod";
import { defaultProviders } from "../../src/lib/execution/shared";

const N = Number(process.argv[2] ?? 5);
const 문제 = [
  { q: "0 이상 9 이하의 정수 x, y, z 에 대하여 x + y + z = 12 를 만족하는 순서쌍 (x,y,z) 의 개수를 구하시오.", a: 73 },
  { q: "삼차함수 f(x) = x³ + ax² + bx + c 가 x = 1 에서 극대, x = 3 에서 극소이고 극댓값이 4 일 때 극솟값을 구하시오.", a: 0 },
];
const schema = z.object({ 답: z.string(), 풀이: z.string() });
const SYS = "너는 고3 학생에게 수학을 알려 준다. 끝까지 풀고, 답과 함께 어떻게 나왔는지 적는다.";

for (const [name, tier, tok] of [["싼 자리 3000 (직원 대화)", "routine", 3000], ["싼 자리 16000 (실제 /ask)", "conversation", 16000], ["판단 자리 16000", "judgment", 16000]] as const) {
  console.log(`\n=== ${name} ===`);
  for (const p of 문제) {
    const 답들: string[] = [];
    let hit = 0, 잘림 = 0;
    for (let i = 0; i < N; i++) {
      try {
        const { output } = await defaultProviders().ai.generateStructuredOutput({
          systemInstructions: SYS, input: p.q, schema, schemaName: "math", maxTokens: tok, tier,
        });
        const nums = (output.답.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
        const ok = nums.includes(p.a);
        if (ok) hit++;
        답들.push(ok ? `${output.답.slice(0, 10)}✓` : output.답.slice(0, 10));
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (/TRUNCAT/i.test(m)) 잘림++;
        답들.push("떨어짐");
      }
    }
    console.log(`  ${hit}/${N} 맞음${잘림 ? ` · 잘림 ${잘림}` : ""}  (정답 ${p.a})  ${p.q.slice(0, 22)}…`);
    console.log(`     나온 답: ${답들.join(" · ")}`);
  }
}
