/** 진짜 도트 토큰 장부 자 (11-24, 11-25 토큰으로): 100토큰 넣기·같은 번호표 두 번·만들기(10토큰) 11번·동시 쓰기·환불. 시험 손님은 끝에 지운다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");
const { grantPixelPack, pixelBalance, spendPixelShot, refundPixelShot, PIXEL_PACK, PIXEL_COST } = await import("../../src/lib/pixel/credits");
const C = PIXEL_COST.create, TOT = PIXEL_PACK.shots, MAX = Math.floor(TOT / C);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const db = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const { data } = await anon.auth.signInAnonymously();
const uid = data.user!.id;
const sabotage = process.argv.includes("--sabotage");
let pass = 0, n = 0;
const check = (name: string, ok: boolean, got: unknown) => { n++; if (ok) pass++; console.log(`${ok ? "✅" : "❌"} ${name} — ${JSON.stringify(got)}`); };
try {
  const co = crypto.randomUUID();
  const g1 = await grantPixelPack(db, uid, co);
  const g2 = sabotage ? await grantPixelPack(db, uid, crypto.randomUUID()) : await grantPixelPack(db, uid, co);   // 심은 고장: 다른 번호표로 두 번
  check("첫 지급은 새로", g1.already === false, g1);
  check("같은 번호표 두 번째는 이미", g2.already === true, g2);
  check(`잔액 ${TOT}`, (await pixelBalance(db, uid)) === TOT, await pixelBalance(db, uid));
  let 쓴 = 0;
  for (let i = 0; i < MAX + 1; i++) if (await spendPixelShot(db, uid, `test ${i}`, C)) 쓴++;
  check(`${MAX + 1}번 눌러 ${MAX}번만`, 쓴 === MAX, 쓴);
  check(`잔액 ${TOT - MAX * C}`, (await pixelBalance(db, uid)) === TOT - MAX * C, await pixelBalance(db, uid));
  // 남은 걸 다 비운다(다음 동시 시험이 깨끗하게)
  const 남 = await pixelBalance(db, uid); if (남 > 0) await spendPixelShot(db, uid, "drain", 남);
  await grantPixelPack(db, uid, crypto.randomUUID());
  const 동시 = await Promise.all(Array.from({ length: MAX + 4 }, (_, i) => spendPixelShot(db, uid, `race ${i}`, C)));
  const 잔 = await pixelBalance(db, uid);
  check(`동시 ${MAX + 4}번: 음수 안 됨`, 잔 >= 0, { 성공: 동시.filter(Boolean).length, 잔 });
  check(`동시 ${MAX + 4}번: 성공 ≤ ${MAX}`, 동시.filter(Boolean).length <= MAX, 동시.filter(Boolean).length);
  // 11-24 AI 동작 생성: 실패하면 쓴 장을 돌려준다 — 쓰고 돌려주면 잔액이 그대로여야 한다
  await grantPixelPack(db, uid, crypto.randomUUID());
  const 전 = await pixelBalance(db, uid);
  const id = await spendPixelShot(db, uid, "motion test", PIXEL_COST.motion);
  if (id && !sabotage) await refundPixelShot(db, uid, id);
  check("쓰고 돌려주면 잔액 그대로", (await pixelBalance(db, uid)) === 전 && !!id, { 전, 후: await pixelBalance(db, uid), id });
} finally {
  await db.from("dot_purchases").delete().eq("user_id", uid);
  await db.auth.admin.deleteUser(uid);
}
console.log(`\n${pass}/${n}${sabotage ? " (심은 고장)" : ""}`);
