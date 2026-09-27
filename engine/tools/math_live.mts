/**
 * **배포된 길 그대로** 수학을 재는 자 (226회차 2026-09-27).
 *
 * /ask 는 쿠키 클라이언트를 쓰므로 스크립트에서 `runEverydayTurn` 을 못 돌린다. 그래서 두 판을
 * 제품과 **같은 것으로** 부른다: 접수 지시문 + 제품의 `firstPass` 스키마 → 켜지면 제품의
 * `solveDeeply()`. 프롬프트를 여기 베껴 두면 한쪽만 고치는 날이 온다.
 *
 * 재는 것 둘: (1) `깊게` 게이트가 켜지는가 (2) 켜진 뒤 답이 맞는가.
 */
const { intakeInstructions } = await import("../../src/lib/chat/routing");
const { firstPass, solveDeeply } = await import("../../src/lib/chat/everydayService");
const { defaultProviders } = await import("../../src/lib/execution/shared");

const N = Number(process.argv[2] ?? 3);
const ai = defaultProviders().ai;
const 문제 = [
  { q: "0 이상 9 이하의 정수 x, y, z 에 대해 x + y + z = 12 인 순서쌍 (x,y,z) 개수 구해줘.", a: 73 },
  { q: "삼차함수 f(x) = x³ + ax² + bx + c 가 x = 1 에서 극대, x = 3 에서 극소이고 극댓값이 4 야. 극솟값 알려줘.", a: 0 },
  // 반대편 — 풀 것이 없는 말에 게이트가 켜지면 대화마다 비싼 호출이 붙는다.
  { q: "그 우성이라고 사문 4따리 있거든?", a: null },
];
const SYS = intakeInstructions({ hasImages: false, speaker: { name: process.env.OWNER_NAME ?? "사장님", isOwner: true } });

for (const p of 문제) {
  let 켜짐 = 0, hit = 0;
  const 답들: string[] = [];
  for (let i = 0; i < N; i++) {
    const { output: plan } = await ai.generateStructuredOutput({
      systemInstructions: SYS, input: `user: ${p.q}`,
      schema: firstPass, schemaName: "everyday_plan", maxTokens: 16000, tier: "conversation",
    });
    if (plan.깊게) 켜짐++;
    if (p.a === null) { 답들.push(plan.깊게 ? "깊게(헛)" : "그냥"); continue; }
    const reply = plan.깊게 ? await solveDeeply(ai, { input: `대화:\n user: ${p.q}` }) : plan.reply;
    const nums = ((reply ?? "").match(/-?\d+/g) ?? []).map(Number);
    const ok = nums.includes(p.a);
    if (ok) hit++;
    답들.push(ok ? `맞음${plan.깊게 ? "" : "(싼 자리)"}` : `틀림 ${(reply ?? "").slice(0, 28).replace(/\s+/g, " ")}`);
  }
  const 기대 = p.a === null ? "게이트가 꺼져 있어야 한다" : `${N}/${N} 이어야 한다`;
  console.log(`\n${p.q.slice(0, 30)}…`);
  console.log(`  깊게 켜짐 ${켜짐}/${N}${p.a === null ? "" : ` · 맞음 ${hit}/${N} (정답 ${p.a})`}  ← ${기대}`);
  console.log(`  ${답들.join(" · ")}`);
}
