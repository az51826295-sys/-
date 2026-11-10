/**
 * # 선물 값이 **하트로** 나가는가  (11-10 사장님: *"선물의 단위를 하트로 바꿔"*)
 *
 *   npx tsx engine/tools/dot_gift_hearts.mts
 *
 * 코드를 고쳤다는 것은 재지 않았다는 뜻이다. 실제로 돌려 **네 가지**를 본다:
 *
 * 1. 선물 한 번에 하트가 **값만큼** 준다 (두쫀쿠 3 · 나머지 2).
 * 2. 친밀도가 그만큼 오른다 (좋아하는 것이면 두 배).
 * 3. **하트가 모자라면 막힌다**(`no_hearts`) — 그리고 **걸친 하트는 돌려받는다**(1개만 남을 때 3짜리를 사면 0이 아니라 1이어야 한다).
 * 4. 크레딧은 **안 건드린다** (전에는 여기서 나갔다).
 *
 * 시험 계정은 그때그때 만들고 지운다(`--keep` 이면 남긴다).
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runDotTurn } = await import("../../src/lib/dot/turn");
const { GIFTS, todayKST, giftPoints, likesLine } = await import("../../src/lib/dot/bond");

const db = createServiceClient();
const 오늘 = todayKST();
const 남길까 = process.argv.includes("--keep");

const 메일 = `gift-${Date.now()}@dugeun.local`;
const { data: 만든것, error: 만들다실패 } = await db.auth.admin.createUser({ email: 메일, password: `t-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
if (만들다실패 || !만든것?.user) { console.error(`시험 계정을 못 만들었다: ${만들다실패?.message}`); process.exit(1); }
const USER = 만든것.user.id;

const { data: chars } = await db.from("dot_characters").select("id, slug, name, persona").eq("is_public", true).order("slug");
/* 유나는 소금빵을 좋아한다고 적혀 있다 — **좋아하는 것 두 배**를 같이 보려고 고른다. */
const 그사람 = (chars as any[]).find((c) => likesLine(c.persona ?? "").includes("소금빵")) ?? (chars as any[])[0];
const 소금빵 = GIFTS.find((g) => g.key === "saltbread")!;
const 두쫀쿠 = GIFTS.find((g) => g.key === "dzk")!;
console.log(`시험 계정 ${USER}\n상대 ${그사람.name}(${그사람.slug}) · 좋아하는 것 줄: ${likesLine(그사람.persona ?? "").trim() || "(없음)"}\n`);

/** 지금 하트 몇 개 남았나 — `balanceFor` 가 보는 것과 같은 칸에서 센다. */
async function 하트(): Promise<{ 받은: number; 쓴: number; 남음: number }> {
  const { data } = await db.from("dot_usage").select("turns, bonus_turns").eq("user_id", USER).eq("day", 오늘).maybeSingle();
  const 받은 = Number((data as any)?.bonus_turns ?? 0), 쓴 = Number((data as any)?.turns ?? 0);
  return { 받은, 쓴, 남음: Math.max(0, 받은 - 쓴) };
}
async function 크레딧(): Promise<number> {
  const { data } = await db.from("dot_wallet").select("credits").eq("user_id", USER).maybeSingle();
  return Number((data as any)?.credits ?? 0);
}
async function 친밀도(): Promise<number> {
  const { data } = await db.from("dot_bonds").select("points").eq("user_id", USER).eq("character_id", 그사람.id).maybeSingle();
  return Number((data as any)?.points ?? 0);
}
/** 하트를 N 개 쥐여 준다(출석·광고 흉내). 크레딧은 **0 으로 둔다** — 거기서 새면 바로 보이게. */
async function 하트채우기(n: number) {
  await db.from("dot_usage").upsert({ user_id: USER, day: 오늘, turns: 0, bonus_turns: n, ad_refills: 0 }, { onConflict: "user_id,day" });
  await db.from("dot_wallet").upsert({ user_id: USER, credits: 0 }, { onConflict: "user_id" });
}

const 결과: { 무엇: string; 맞음: boolean; 본것: string }[] = [];
const 재기 = (무엇: string, 맞음: boolean, 본것: string) => { 결과.push({ 무엇, 맞음, 본것 }); console.log(`${맞음 ? "맞음" : "틀림"}  ${무엇} — ${본것}`); };

/* ── 1·2·4. 선물 한 번 ─────────────────────────────────────────── */
await 하트채우기(8);
const 전하트 = await 하트(), 전점 = await 친밀도(), 전크 = await 크레딧();
const r1: any = await runDotTurn(db, USER, 그사람.id, `🎁 ${소금빵.name}`, { gift: 소금빵.key });
const 후하트 = await 하트(), 후점 = await 친밀도(), 후크 = await 크레딧();
if (!r1.ok) { console.error(`선물이 아예 안 됐다: ${r1.reason} ${r1.message ?? ""}`); }
const 쓴하트 = 후하트.쓴 - 전하트.쓴;
재기(`선물 한 번에 하트 ${소금빵.하트}개`, 쓴하트 === 소금빵.하트, `${쓴하트}개 (남음 ${전하트.남음}→${후하트.남음})`);
const 기대점 = giftPoints(소금빵, 그사람.persona ?? "");
재기(`친밀도 +${기대점.points}${기대점.liked ? "(좋아하는 것 두 배)" : ""} 이상`, 후점 - 전점 >= 기대점.points, `${전점}→${후점} (+${후점 - 전점})`);
재기("크레딧은 안 건드린다", 후크 === 전크, `${전크}→${후크}`);
재기("서버가 말한 남은 하트가 DB 와 같다", r1.ok ? r1.remaining === 후하트.남음 : false, `서버 ${r1.ok ? r1.remaining : "-"} · DB ${후하트.남음}`);

/* ── 3. 모자랄 때 ─────────────────────────────────────────────── */
await 하트채우기(1);                       // 두쫀쿠(3)를 못 사는 상태
const 모자람전 = await 하트(), 모자람전점 = await 친밀도();
const r2: any = await runDotTurn(db, USER, 그사람.id, `🎁 ${두쫀쿠.name}`, { gift: 두쫀쿠.key });
const 모자람후 = await 하트(), 모자람후점 = await 친밀도();
재기("하트가 모자라면 막는다", r2.ok === false && r2.reason === "no_hearts", `${r2.ok ? "통과해 버렸다" : `${r2.reason} — ${r2.message ?? ""}`}`);
재기("걸친 하트는 돌려준다", 모자람후.남음 === 모자람전.남음, `${모자람전.남음}→${모자람후.남음} (1개가 남아 있어야 한다)`);
재기("막혔으면 친밀도도 안 오른다", 모자람후점 === 모자람전점, `${모자람전점}→${모자람후점}`);

if (!남길까) {
  for (const t of ["dot_messages", "dot_bonds", "dot_usage", "dot_wallet"]) await db.from(t).delete().eq("user_id", USER);
  await db.auth.admin.deleteUser(USER);
}
const 틀린 = 결과.filter((r) => !r.맞음);
console.log(`\n${결과.length - 틀린.length}/${결과.length} 맞음`);
process.exit(틀린.length ? 1 : 0);
