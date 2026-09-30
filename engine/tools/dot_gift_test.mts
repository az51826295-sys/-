/**
 * **선물·멀어지기를 실제 서버에서** (227회차 09-30). 대화 몇 번의 모델 값만 든다.
 *
 *   npx tsx engine/tools/dot_gift_test.mts
 *
 * 순수 함수는 `bond.ts` 를 직접 불러 19개를 쟀다. 여기서는 **사람이 받는 것**을 잰다 — 배포된 `dot-web`
 * 의 채팅 API 를 Bearer 로(안드로이드 앱과 같은 길).
 *
 *  ① 유나에게 소금빵(좋아하는 것) → 점수가 **+16** 오르고 이유에 "좋아하는 거!" 가 붙나
 *  ② 같은 날 또 선물 → **409 gift_limit**, 사람이 읽을 수 있는 말, **대화 횟수는 안 깎였나**
 *  ③ 서하에게 두쫀쿠(좋아하는 것 아님) → **+8**
 *  ④ 일주일 안 온 사람이 오늘 말 걸기 → **안 깎인다**(규칙이 오늘 생겼으니 소급 없음)
 *  ⑤ 실제 persona 에서 캐릭터별 좋아하는 선물이 맞게 잡히나
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

const { data: cs } = await svc.from("dot_characters").select("id, slug, name, persona").in("slug", ["yuna", "seoha", "rin", "doyun"]);
const 캐 = new Map(((cs ?? []) as { id: string; slug: string; name: string; persona: string }[]).map((c) => [c.slug, c]));

// ⑤ 실제 persona
console.log("── ⑤ 캐릭터별 좋아하는 선물(실제 persona) ──");
for (const [slug, 기대] of [["yuna", "saltbread"], ["seoha", "strawmilk"], ["rin", "cancoffee"], ["doyun", "ramen"]] as [string, string][]) {
  const c = 캐.get(slug); if (!c) continue;
  const 좋아함 = GIFTS.filter((g) => giftPoints(g, c.persona ?? "").liked).map((g) => g.key);
  재(`${c.name}: ${기대} 를 좋아한다(다른 건 안 걸린다)`, 좋아함.length === 1 && 좋아함[0] === 기대, 좋아함);
}

async function 계정(slug: string, points: number, stage: number, lastTalkedOn: string) {
  const c = 캐.get(slug)!;
  const email = `gift-${slug}-${Date.now().toString(36)}@dot.test`, password = randomBytes(18).toString("base64url");
  const { data: made, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !made.user) throw new Error("계정: " + error?.message);
  const uid = made.user.id;
  await svc.from("dot_follows").upsert({ user_id: uid, character_id: c.id }, { onConflict: "user_id,character_id" });
  const { error: be } = await svc.from("dot_bonds").upsert({ user_id: uid, character_id: c.id, points, stage, streak_days: 1, last_talked_on: lastTalkedOn }, { onConflict: "user_id,character_id" });
  if (be) throw new Error("사이: " + be.message);
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  return { uid, cid: c.id, token: s.session!.access_token };
}
async function 말(t: { token: string; cid: string }, message: string, gift?: string) {
  const r = await fetch(`${BASE}/api/dot/chat`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
    body: JSON.stringify({ characterId: t.cid, message, gift: gift ?? null }),
  });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as { ok?: boolean; reply?: string; reason?: string; message?: string; remaining?: number; bond?: { points: number; stage: number; reasons: string[] } } };
}
async function 치우기(uid: string) {
  for (const t of ["dot_messages", "dot_bonds", "dot_follows", "dot_usage"]) await svc.from(t).delete().eq("user_id", uid);
  await svc.auth.admin.deleteUser(uid);
}

const 오늘 = todayKST();
const 한주전 = new Date(Date.parse(오늘 + "T00:00:00Z") - 7 * 86_400_000).toISOString().slice(0, 10);

// ① ② 유나 소금빵
console.log("\n── ①② 유나에게 소금빵 ──");
{
  const t = await 계정("yuna", 10, 1, 오늘);
  try {
    const a = await 말(t, "🎁 소금빵", "saltbread");
    재("선물이 된다", a.status === 200 && !!a.j.ok, a);
    재("점수 10 → 27 (턴 +1, 소금빵 좋아함 +16)", a.j.bond?.points === 27, a.j.bond);
    재("1단계 → 2단계", a.j.bond?.stage === 2, a.j.bond?.stage);
    재("이유에 '좋아하는 거' 가 붙는다", !!a.j.bond?.reasons.some((r) => r.includes("좋아하는 거")), a.j.bond?.reasons);
    console.log(`       유나의 답: "${a.j.reply ?? ""}"`);
    const 남기전 = a.j.remaining;
    const b = await 말(t, "🎁 두쫀쿠", "dzk");
    재("같은 날 두 번째 선물 → 409", b.status === 409 && b.j.reason === "gift_limit", b);
    재("사람이 읽을 수 있는 말", (b.j.message ?? "").includes("오늘은 이미 선물했어요"), b.j.message);
    const c = await 말(t, "응 고마워");
    재("막힌 선물은 대화 횟수를 안 깎는다(남은 횟수가 한 번만 준다)", typeof 남기전 === "number" && c.j.remaining === 남기전 - 1, { 선물뒤: 남기전, 한마디뒤: c.j.remaining });
  } finally { await 치우기(t.uid); }
}

// ③ 서하 두쫀쿠
console.log("\n── ③ 서하에게 두쫀쿠 ──");
{
  const t = await 계정("seoha", 50, 2, 오늘);
  try {
    const a = await 말(t, "🎁 두쫀쿠", "dzk");
    재("점수 50 → 59 (턴 +1, 두쫀쿠 +8)", a.j.bond?.points === 59, a.j.bond);
    재("'좋아하는 거' 는 안 붙는다", !a.j.bond?.reasons.some((r) => r.includes("좋아하는 거")), a.j.bond?.reasons);
    console.log(`       서하의 답: "${a.j.reply ?? ""}"`);
  } finally { await 치우기(t.uid); }
}

// ④ 일주일 안 온 사람 — 오늘은 안 깎인다
console.log("\n── ④ 일주일 안 온 사람이 오늘 오면 ──");
{
  const t = await 계정("rin", 22, 2, 한주전);
  try {
    const a = await 말(t, "오랜만");
    재(`마지막 ${한주전} · 오늘 ${오늘} → **안 깎인다**(규칙은 오늘부터)`, !a.j.bond?.reasons.some((r) => r.includes("만이에요")), a.j.bond?.reasons);
    재("2단계 그대로 (22 + 첫 대화 6 = 28)", a.j.bond?.stage === 2 && a.j.bond?.points === 28, a.j.bond);
  } finally { await 치우기(t.uid); }
}

console.log(틀림 ? `\n**어긋남 ${틀림}**` : "\n**전부 맞음**");
