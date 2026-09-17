/**
 * 돈 자 — 30번 → 광고 2번(+10씩) → 충전 → 되돌리기, 전부 DB 함수로 결정적으로 (77회차 09-11). 모델 없음.
 *
 *   (1) 30번 쓰면 31번째는 0        (2) 광고 1 → 남은 광고 1, 더 이야기 됨   (3) 광고 2 → 남은 0, 세 번째는 -1
 *   (4) 광고 턴 다 쓰면 다시 0       (5) 충전 50 → 다음 턴은 충전에서(49)     (6) 되돌리기 → 충전 50 복구
 *   (7) 멘헤라 30일 → 자격 생김      (8) 잔고 계산(balanceFor) 이 표와 같다
 * 시험 계정은 만들었다 지운다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { balanceFor, AD_REFILLS_PER_DAY, AD_REFILL_TURNS, SKUS } = await import("../../src/lib/dot/money");
const { FREE_TURNS_PER_DAY } = await import("../../src/lib/dot/bond");

const db = createServiceClient();
const day = "2026-01-01"; // 오늘과 안 겹치는 날 — 다른 자와 섞이지 않게
const { data: made, error: eu } = await db.auth.admin.createUser({ email: `money-test-${Date.now()}@dugeun.local`, password: "money-test-pass-1", email_confirm: true });
if (eu) throw eu;
const uid = made.user.id;
const take = async () => Number((await db.rpc("dot_take_turn", { p_user: uid, p_day: day, p_limit: FREE_TURNS_PER_DAY })).data ?? 0);
const ad = async () => Number((await db.rpc("dot_ad_refill", { p_user: uid, p_day: day, p_max: AD_REFILLS_PER_DAY, p_turns: AD_REFILL_TURNS })).data);
const usage = async () => (await db.from("dot_usage").select("turns, bonus_turns, ad_refills, paid_turns").eq("user_id", uid).eq("day", day).maybeSingle()).data!;
const credits = async () => Number((await db.from("dot_wallet").select("credits").eq("user_id", uid).maybeSingle()).data?.credits ?? 0);
const lines: [boolean, string][] = [];
try {
  for (let i = 0; i < FREE_TURNS_PER_DAY; i++) await take();
  const over = await take();
  lines.push([over === 0, `30번 뒤 31번째 = ${over} (0)`]);

  const left1 = await ad(); const t1 = await take();
  lines.push([left1 === 1 && t1 === 31, `광고 1 → 남은 광고 ${left1}(1), 다음 턴 ${t1}(31)`]);
  const left2 = await ad(); const left3 = await ad();
  lines.push([left2 === 0 && left3 === -1, `광고 2 → 남은 ${left2}(0), 세 번째 ${left3}(-1)`]);

  for (let i = 0; i < AD_REFILL_TURNS * 2 - 1; i++) await take();
  const over2 = await take();
  lines.push([over2 === 0, `광고 턴 다 쓰면 다시 ${over2} (0)`]);

  await db.rpc("dot_grant", { p_user: uid, p_sku: "turns_50", p_credits: SKUS.turns_50.credits, p_menhera_days: 0, p_source: "manual", p_ref: null });
  const paidTurn = await take(); const c1 = await credits(); const u1 = await usage();
  lines.push([paidTurn === 51 && c1 === 49 && u1.paid_turns === 1, `충전 50 → 턴 ${paidTurn}(51), 충전 ${c1}(49), 충전으로 쓴 턴 ${u1.paid_turns}(1)`]);

  await db.rpc("dot_give_back_turn", { p_user: uid, p_day: day, p_limit: FREE_TURNS_PER_DAY });
  const c2 = await credits(); const u2 = await usage();
  lines.push([c2 === 50 && u2.paid_turns === 0 && u2.turns === 50, `되돌리기 → 충전 ${c2}(50), 턴 ${u2.turns}(50)`]);

  await db.rpc("dot_grant", { p_user: uid, p_sku: "menhera_30", p_credits: 0, p_menhera_days: 30, p_source: "manual", p_ref: null });
  const bal = await balanceFor(db, uid, day);
  const until = bal.menheraUntil ? (Date.parse(bal.menheraUntil) - Date.now()) / 86_400_000 : 0;
  lines.push([until > 29 && until <= 30, `멘헤라 30일 → 자격 ${until.toFixed(1)}일`]);
  lines.push([bal.remaining === 50 && bal.freeLeft === 0 && bal.adLeft === 0 && bal.credits === 50, `잔고 계산 남은 ${bal.remaining}(50) 공짜 ${bal.freeLeft}(0) 광고 ${bal.adLeft}(0) 충전 ${bal.credits}(50)`]);
} finally {
  await db.auth.admin.deleteUser(uid).catch(() => {});
}
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
