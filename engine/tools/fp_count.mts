/**
 * **같은 모델을 여러 번 불렀을 때 지문이 같은가** (205회차 09-22, 사장님 정정).
 * 모델끼리 다른 것은 "서버 설정을 가리키는 값" 이어도 똑같이 나온다 —
 * 흩어지지 않는다는 근거는 **한 모델 안에서 여러 줄이 같은 값**인 것뿐이다.
 *
 * **문턱 2줄은 '못 잼' 을 막는 최소선이지 '같다' 를 증명하는 선이 아니다**(사장님 09-22).
 * 두 줄이 같은 것은 우연일 수 있다. 그래서 이 자는 "안 흩어진다" 고 단정하지 않고
 * **"N줄 동안 같았다"** 로만 낸다 — 줄이 쌓일수록 그 말이 단단해진다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { readFiltered } = await import("../../src/lib/db/readAll");
const db = createServiceClient();
const rows = await readFiltered(db, "model_usage", "model, answered_by, answered_fingerprint, created_at",
  (q) => q.not("answered_fingerprint", "is", null), { column: "created_at" });
const by = new Map<string, Map<string, number>>();
for (const r of rows as { model: string; answered_by: string | null; answered_fingerprint: string }[]) {
  const k = `${r.model} → ${r.answered_by}`;
  if (!by.has(k)) by.set(k, new Map());
  const m = by.get(k)!;
  m.set(r.answered_fingerprint, (m.get(r.answered_fingerprint) ?? 0) + 1);
}
console.log(`지문이 찍힌 줄 ${rows.length}개 (원장 전체)`);
for (const [k, m] of by) {
  const n = [...m.values()].reduce((a, b) => a + b, 0);
  const 판정 = n < 2 ? "**못 잼 — 한 줄뿐이다**" : m.size === 1 ? `**${n}줄 동안 같았다** (증명이 아니다 — 줄이 쌓일수록 단단해진다)` : `**${m.size}종으로 흩어진다**`;
  console.log(`  ${k} · ${n}줄 · ${판정}`);
  for (const [fp, c] of m) console.log(`      ${fp} ×${c}`);
}
