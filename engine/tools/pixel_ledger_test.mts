/** 진짜 도트 장수 장부 자 (11-24): 10장 넣기·같은 번호표 두 번·11번 쓰기·동시 쓰기. 시험 손님은 끝에 지운다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");
const { grantPixelPack, pixelBalance, spendPixelShot } = await import("../../src/lib/pixel/credits");
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
  check("잔액 10", (await pixelBalance(db, uid)) === 10, await pixelBalance(db, uid));
  let 쓴 = 0;
  for (let i = 0; i < 11; i++) if (await spendPixelShot(db, uid, `test ${i}`)) 쓴++;
  check("11번 눌러 10번만", 쓴 === 10, 쓴);
  check("잔액 0", (await pixelBalance(db, uid)) === 0, await pixelBalance(db, uid));
  await grantPixelPack(db, uid, crypto.randomUUID());
  const 동시 = await Promise.all(Array.from({ length: 14 }, (_, i) => spendPixelShot(db, uid, `race ${i}`)));
  const 잔 = await pixelBalance(db, uid);
  check("동시 14번: 음수 안 됨", 잔 >= 0, { 성공: 동시.filter(Boolean).length, 잔 });
  check("동시 14번: 성공 ≤ 10", 동시.filter(Boolean).length <= 10, 동시.filter(Boolean).length);
} finally {
  await db.from("dot_purchases").delete().eq("user_id", uid);
  await db.auth.admin.deleteUser(uid);
}
console.log(`\n${pass}/${n}${sabotage ? " (심은 고장)" : ""}`);
