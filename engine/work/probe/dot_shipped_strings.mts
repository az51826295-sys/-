/** 배포된 **묶음 파일**에 새 글귀가 들어 있나 — ROOKERY_COMMIT 은 손으로 세운 값이라 못 믿는다. */
const 집 = "https://dot-web-production-7e03.up.railway.app";
const 쪽 = process.argv[2] ?? "/dot/yuna";
const html = await (await fetch(`${집}${쪽}`, { cache: "no-store" as any })).text();
const 길 = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+?\.js/g)].map((m) => m[0]))];
console.log(`${쪽} · 묶음 ${길.length}개`);
const 찾을것 = [
  { 말: "하트가 모자라요", 있어야: true },
  { 말: "크레딧이 모자라요", 있어야: false },
  { 말: "하트 ", 있어야: true },
];
const 본것 = new Map<string, number>();
for (const p of 길) {
  const js = await (await fetch(`${집}${p}`, { cache: "no-store" as any })).text();
  for (const f of 찾을것) if (js.includes(f.말)) 본것.set(f.말, (본것.get(f.말) ?? 0) + 1);
}
let 틀림 = 0;
for (const f of 찾을것) {
  const n = 본것.get(f.말) ?? 0, ok = f.있어야 ? n > 0 : n === 0;
  if (!ok) 틀림++;
  console.log(`${ok ? "맞음" : "틀림"}  "${f.말}" ${f.있어야 ? "있어야" : "없어야"} 한다 — ${n}개 파일에서 봤다`);
}
process.exit(틀림 ? 1 : 0);
