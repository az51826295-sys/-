/** 견주는 자 — 잠그기 전에 가짜 값으로 끝까지 돌린다. 모델 0, 돈 0. */
const { compare, decisivePower, wilson } = await import("../../src/lib/genesis/compare");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const ROPE = 0.10; // 행동을 바꿀 만한 최소 차이 10%p

check("한쪽이 비면 모름", compare({ n: 0, ok: 0 }, { n: 5, ok: 4 }, ROPE).kind === "모름");
const small = compare({ n: 12, ok: 9 }, { n: 5, ok: 4 }, ROPE);
check("**오늘 2단계 표본은 모름**(구간이 띠에 걸친다)", small.kind === "모름", small);
check("큰 차이 · 충분한 판이면 우위", compare({ n: 40, ok: 36 }, { n: 40, ok: 20 }, ROPE).kind === "우위", compare({ n: 40, ok: 36 }, { n: 40, ok: 20 }, ROPE));
check("반대면 열위", compare({ n: 40, ok: 20 }, { n: 40, ok: 36 }, ROPE).kind === "열위");
const eq = compare({ n: 400, ok: 316 }, { n: 400, ok: 320 }, ROPE);
check("**거의 같고 판이 많으면 등가**(모름이 아니다)", eq.kind === "등가", eq);
check("0%·100% 에서도 안 무너진다", wilson(5, 5).hi <= 1 && wilson(5, 0).lo >= 0);

console.log("");
console.log("판을 늘리면 '모름' 이 줄어드는가 (진짜 차이 20%p · 띠 10%p):");
let prev = 0;
for (const n of [5, 12, 30, 60, 120]) {
  const pw = decisivePower(0.8, 0.6, n, n, ROPE);
  console.log(`  각 ${String(n).padStart(3)}판 → 말할 수 있는 힘 ${(pw * 100).toFixed(0)}%`);
  if (n > 5) check(`  ${n}판이 앞보다 낫다`, pw >= prev - 0.02, { n, pw, prev });
  prev = pw;
}
console.log("");
console.log("옛 규칙(관측값 vs 40%p 띠)은 반대로 갔다: 각 5판 24% → 각 30판 5%");
check("**새 틀은 판을 늘릴수록 좋아진다**", decisivePower(0.8, 0.6, 60, 60, ROPE) > decisivePower(0.8, 0.6, 5, 5, ROPE));
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
