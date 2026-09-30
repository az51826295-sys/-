/**
 * **선물·멀어지기를 실제 서버에서** (227회차 09-30). 대화 몇 번의 모델 값만 든다.
 *
 *   npx tsx engine/tools/dot_gift_test.mts
 *
 * 순수 함수는 `bond.ts` 를 직접 불러 쟀다. 여기서는 **사람이 받는 것**을 잰다 — 배포된 `dot-web`
 * 의 채팅 API 를 Bearer 로(안드로이드 앱과 같은 길). 선물은 **유료**(09-30 사장님 "선물은 돈내고 하는 거야").
 *
 *  ① 유나에게 소금빵(좋아하는 것) → 점수 **+17**(턴 1 + 좋아함 16), 크레딧 **−10**, 대화 턴은 **안 씀**
 *  ② 같은 날 또 선물 → **된다**(09-30 "3번 풀어"), 또 빠짐; 크레딧이 모자라면 402, 안 빠짐
 *  ③ 서하에게 두쫀쿠(좋아하는 것 아님) → **+9**, 크레딧 **−15**
 *  ④ 일주일 안 온 사람이 오늘 말 걸기 → **안 깎인다**(규칙이 오늘 생겼으니 소급 없음)
 *  ⑤ 실제 persona 에서 캐릭터별 좋아하는 선물이 하나씩만 잡히나("놀라면" 에 라면이 걸렸던 것)
 *  ⑥ 크레딧 없는 사람 → **402 no_credits**, 점수 그대로, 오늘 선물 칸을 안 막음
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { todayKST, GIFTS, giftPoints } = await import("../../src/lib/dot/bond");

const BASE = "https://dot-web-production-7e03.up.railway.app";
const svc = createServiceClient();
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
let 틀림 = 0;
const 재 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 틀림++; console.log(`${ok ? "맞음  " : "어긋남"} ${n}${ok ? "" : "  → " + JSON.stringify(본)}`); };
const NL = String.fromCharCode(10);

const { data: cs } = await svc.from("dot_characters").select("id, slug, name, persona").in("slug", ["yuna", "seoha", "rin", "doyun"]);
const 캐 = new Map(((cs ?? []) as { id: string; slug: string; name: string; persona: string }[]).map((c) => [c.slug, c]));

console.log("── ⑤ 캐릭터별 좋아하는 선물(실제 persona) ──");
for (const [slug, 기대] of [["yuna", "saltbread"], ["seoha", "strawmilk"], ["rin", "cancoffee"], ["doyun", "ramen"]] as [string, string][]) {
  const c = 캐.get(slug); if (!c) continue;
  const 좋아함 = GIFTS.filter((g) => giftPoints(g, c.persona ?? "").liked).map((g) => g.key);
  재(`${c.name}: ${기대} 하나만 좋아한다`, 좋아함.length === 1 && 좋아함[0] === 기대, 좋아함);
}

async function 계정(slug: string, points: number, stage: number, lastTalkedOn: string, 크레딧수 = 0) {
  const c = 캐.get(slug)!;
  const email = `gift-${slug}-${Date.now().toString(36)}@dot.test`, password = randomBytes(18).toString("base64url");
  const { data: made, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !made.user) throw new Error("계정: " + error?.message);
  const uid = made.user.id;
  await svc.from("dot_follows").upsert({ user_id: uid, character_id: c.id }, { onConflict: "user_id,character_id" });
  const { error: be } = await svc.from("dot_bonds").upsert({ user_id: uid, character_id: c.id, points, stage, streak_days: 1, last_talked_on: lastTalkedOn }, { onConflict: "user_id,character_id" });
  if (be) throw new Error("사이: " + be.message);
  if (크레딧수 > 0) {
    // 시험용 충전 — 실제 충전과 같은 함수(dot_grant)로, 원장에 source 'manual' 로 남는다.
    const { error: ge } = await svc.rpc("dot_grant", { p_user: uid, p_sku: "test_grant", p_credits: 크레딧수, p_menhera_days: 0, p_source: "manual", p_ref: null });
    if (ge) throw new Error("충전: " + ge.message);
  }
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  return { uid, cid: c.id, token: s.session!.access_token };
}
type 응답 = { ok?: boolean; reply?: string; reason?: string; message?: string; remaining?: number; bond?: { points: number; stage: number; reasons: string[] } };
async function 말(t: { token: string; cid: string }, message: string, gift?: string): Promise<{ status: number; j: 응답 }> {
  const r = await fetch(`${BASE}/api/dot/chat`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
    body: JSON.stringify({ characterId: t.cid, message, gift: gift ?? null }),
  });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as 응답 };
}
async function 크레딧(uid: string): Promise<number> {
  const { data } = await svc.from("dot_wallet").select("credits").eq("user_id", uid).maybeSingle();
  return Number(data?.credits ?? 0);
}
async function 점수(uid: string) {
  return (await svc.from("dot_bonds").select("points, last_gift_on").eq("user_id", uid).maybeSingle()).data as { points: number; last_gift_on: string | null };
}
async function 치우기(uid: string) {
  for (const t of ["dot_messages", "dot_bonds", "dot_follows", "dot_usage", "dot_wallet", "dot_purchases"]) await svc.from(t).delete().eq("user_id", uid);
  await svc.auth.admin.deleteUser(uid);
}

const 오늘 = todayKST();
const 한주전 = new Date(Date.parse(오늘 + "T00:00:00Z") - 7 * 86_400_000).toISOString().slice(0, 10);

console.log(NL + "── ①② 유나에게 소금빵 (크레딧 30) ──");
{
  const t = await 계정("yuna", 10, 1, 오늘, 30);
  try {
    const 첫 = await 말(t, "안녕");                                   // 기준점: 남은 횟수
    const 점수전 = (await 점수(t.uid)).points;
    const a = await 말(t, "🎁 소금빵", "saltbread");
    재("선물이 된다", a.status === 200 && !!a.j.ok, a);
    재(`점수 ${점수전} → +17 (턴 1 + 좋아함 16)`, a.j.bond?.points === 점수전 + 17, { 전: 점수전, 후: a.j.bond });
    재("이유에 '좋아하는 거' 가 붙는다", !!a.j.bond?.reasons.some((r) => r.includes("좋아하는 거")), a.j.bond?.reasons);
    재("크레딧 30 → 20", (await 크레딧(t.uid)) === 20, await 크레딧(t.uid));
    // 남은 횟수 = 공짜 + 크레딧. 선물이 공짜 턴을 안 썼다면 크레딧 10 만큼만 준다.
    재("**대화 턴은 안 썼다** (남은 횟수가 크레딧 10 만큼만 준다)", a.j.remaining === (첫.j.remaining ?? 0) - 10, { 첫: 첫.j.remaining, 선물뒤: a.j.remaining });
    console.log(`       유나의 답: "${(a.j.reply ?? "").replace(/\n/g, " / ")}"`);
    // 09-30 "3번 풀어" — 하루 한 번 제한을 뗐다. 같은 날 두 번째도 되고, 값도 또 빠진다.
    const 두번째전 = a.j.bond?.points ?? 0;
    const b = await 말(t, "🎁 두쫀쿠", "dzk");
    재("같은 날 두 번째 선물도 된다", b.status === 200 && !!b.j.ok, b);
    재("점수 +9 (턴 1 + 두쫀쿠 8)", b.j.bond?.points === 두번째전 + 9, b.j.bond);
    재("크레딧 20 → 5 (두쫀쿠 15)", (await 크레딧(t.uid)) === 5, await 크레딧(t.uid));
    const c = await 말(t, "🎁 소금빵", "saltbread");
    재("세 번째는 크레딧이 모자라 402 (5 < 10)", c.status === 402 && c.j.reason === "no_credits", c);
    재("모자라서 막힌 선물은 크레딧을 안 뺀다 (5 그대로)", (await 크레딧(t.uid)) === 5, await 크레딧(t.uid));
  } finally { await 치우기(t.uid); }
}

console.log(NL + "── ③ 서하에게 두쫀쿠 (크레딧 20) ──");
{
  const t = await 계정("seoha", 50, 2, 오늘, 20);
  try {
    const a = await 말(t, "🎁 두쫀쿠", "dzk");
    재("점수 50 → 59 (턴 1 + 두쫀쿠 8)", a.j.bond?.points === 59, a.j.bond);
    재("'좋아하는 거' 는 안 붙는다", !a.j.bond?.reasons.some((r) => r.includes("좋아하는 거")), a.j.bond?.reasons);
    재("크레딧 20 → 5 (두쫀쿠 15)", (await 크레딧(t.uid)) === 5, await 크레딧(t.uid));
    console.log(`       서하의 답: "${(a.j.reply ?? "").replace(/\n/g, " / ")}"`);
  } finally { await 치우기(t.uid); }
}

console.log(NL + "── ④ 일주일 안 온 사람이 오늘 오면 ──");
{
  const t = await 계정("rin", 22, 2, 한주전);
  try {
    const a = await 말(t, "오랜만");
    재(`마지막 ${한주전} · 오늘 ${오늘} → **안 깎인다**(규칙은 오늘부터)`, !a.j.bond?.reasons.some((r) => r.includes("만이에요")), a.j.bond?.reasons);
    재("2단계 그대로 (22 + 첫 대화 6 = 28)", a.j.bond?.stage === 2 && a.j.bond?.points === 28, a.j.bond);
  } finally { await 치우기(t.uid); }
}

console.log(NL + "── ⑥ 크레딧 없는 사람 ──");
{
  const t = await 계정("rin", 30, 2, 오늘, 0);
  try {
    const a = await 말(t, "🎁 캔커피", "cancoffee");
    재("402 no_credits", a.status === 402 && a.j.reason === "no_credits", a);
    재("값을 알려 준다", (a.j.message ?? "").includes("10크레딧"), a.j.message);
    const p = await 점수(t.uid);
    재("점수 그대로, 선물한 날로 안 찍힘", p.points === 30 && !p.last_gift_on, p);
    const b = await 말(t, "안녕");
    재("**못 산 선물이 대화를 막지 않는다**", b.status === 200 && !!b.j.ok, b.status);
  } finally { await 치우기(t.uid); }
}

console.log(틀림 ? `${NL}**어긋남 ${틀림}**` : `${NL}**전부 맞음**`);
