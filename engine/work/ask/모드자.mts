/** 모드가 제대로 갈리나. 모델 0 · 값 0. */
const { 모드계산 } = await import("../../../src/app/ask/모드");
const 판: [boolean, number, string][] = [
  [false, 0, "조용함"],
  [true, 0, "대화중"],
  [false, 1, "일하는중"],
  [true, 1, "일하는중"],   // 일이 돌면 대화보다 일이 이긴다 — 더 오래 걸리는 쪽을 보여 준다
  [true, 3, "일하는중"],
];
let 맞음 = 0;
for (const [busy, n, 바람] of 판) {
  const r = 모드계산(busy, n);
  const ok = r === 바람;
  if (ok) 맞음++;
  console.log(`${ok ? "맞음  " : "**어긋남**"} busy=${busy} 도는일=${n} → ${r} (바란 것 ${바람})`);
}
console.log(`\n${맞음}/${판.length}`);
if (맞음 < 판.length) process.exitCode = 1;
