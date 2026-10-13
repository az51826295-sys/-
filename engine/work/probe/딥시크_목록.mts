/**
 * **"deepseek-chat 이 목록에서 사라졌다" 가 참인가** (10-13). 모델 0 · 값 0 (목록 GET 은 공짜다).
 *   npx tsx engine/tools/rookery_env.mts engine/work/probe/딥시크_목록.mts
 *
 * 자가진화의 눈이 **14일 내내 똑같이** 이 경보를 냈다. 둘 중 하나다 —
 * 진짜 없어졌거나(그러면 싼 자리가 어느 날 멈춘다), 내 눈이 거짓 경보를 내는 것(09-30 에 둘 있었다).
 * 공급자에게 직접 물어 가린다.
 */
const key = process.env.DEEPSEEK_API_KEY ?? "";
if (!key) { console.error("DEEPSEEK_API_KEY 가 없다 — 못 잼"); process.exit(1); }
const r = await fetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${key}` } });
if (!r.ok) { console.error(`목록을 못 받았다: ${r.status} ${await r.text()}`); process.exit(1); }
const j = await r.json() as { data?: { id: string }[] };
const 들 = (j.data ?? []).map((m) => m.id);
console.log(` 공급자가 주는 목록(${들.length}개): ${들.join(", ")}`);
for (const 쓰는 of ["deepseek-chat", "deepseek-reasoner"]) {
  console.log(` ${들.includes(쓰는) ? "**있다**" : "**없다**"} — ${쓰는}`);
}
