/**
 * **출석체크 주소를 그대로 부른다** (11-06 — 자동 지급을 0 으로 내린 날).
 *
 *   npx tsx engine/tools/dot_checkin_test.mts
 *
 * 왜 이걸 꼭 재나: 자동 지급이 사라져서 **이 주소가 말을 걸 수 있게 되는 유일한 문**이다.
 * 그리고 받았다고 적는 칸이 없어 "이미 받았나" 를 **덜어서** 센다(보너스 − 광고분).
 * 그 셈과 두 번 눌림 막기(compare-and-swap)는 DB 함수가 아니라 **라우트 안**에 있으니
 * 라우트를 직접 불러야 잰 것이다([[unrun-code-is-unmeasured]]).
 *
 * 재는 것: ① 처음엔 하트 0·출석 안 함 ② 한 번 누르면 +5 ③ **두 번째는 429**
 * ④ 광고를 본 뒤에도 "이미 출석함" 이 안 흔들린다(덜어 세기가 맞나) ⑤ 가짜 토큰 401.
 * 못 재는 것: 토큰 없이 부르는 길(쿠키는 Next 요청 안에서만 읽힌다 — `dot_ad_route_test` 와 같다).
 */
import { readFileSync } from "node:fs";

const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
process.env.NEXT_PUBLIC_SUPABASE_URL = vars.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = vars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.SUPABASE_SECRET_KEY = vars.SUPABASE_SECRET_KEY;

const { createClient } = await import("@supabase/supabase-js");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { balanceFor, AD_REFILLS_PER_DAY, AD_REFILL_TURNS } = await import("../../src/lib/dot/money");
const { CHECKIN_HEARTS, AUTO_HEARTS_PER_DAY, todayKST } = await import("../../src/lib/dot/bond");

const db = createServiceClient();
const email = `checkin-${Date.now()}@dugeun.local`, pw = "checkin-pass-1";
const { data: made, error: eu } = await db.auth.admin.createUser({ email, password: pw, email_confirm: true });
if (eu) throw eu;
const uid = made.user.id;

const anon = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signed, error: es } = await anon.auth.signInWithPassword({ email, password: pw });
if (es) throw es;
const token = signed.session!.access_token;
const day = todayKST();

const 부르기 = async (bearer?: string) => {
  const { POST } = await import("../../src/app/api/dot/checkin/route");
  const res = await POST(new Request("http://x/api/dot/checkin", {
    method: "POST", headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  }));
  return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown> };
};
const 광고 = async () => {
  process.env.AD_REWARD_OPEN = "1";
  const { POST } = await import("../../src/app/api/dot/ad/route");
  return (await POST(new Request("http://x/api/dot/ad", { method: "POST", headers: { authorization: `Bearer ${token}` } }))).status;
};

const 줄: [boolean, string][] = [];
try {
  // (1) 들어온 순간 — 하트가 없다. 자동 지급을 없앤 것이 실제로 그런가.
  const b0 = await balanceFor(db, uid, day);
  줄.push([b0.remaining === AUTO_HEARTS_PER_DAY && !b0.출석함,
    `처음: 하트 ${b0.remaining}(${AUTO_HEARTS_PER_DAY}) · 출석함 ${b0.출석함}(false)`]);

  // (2) 가짜 토큰은 못 받는다
  const 가짜 = await 부르기("not-a-real-token");
  줄.push([가짜.status === 401, `가짜 토큰 → ${가짜.status} (401)`]);

  // (3) 한 번 누르면 하트 5개
  const 한번 = await 부르기(token);
  const b1 = await balanceFor(db, uid, day);
  줄.push([한번.status === 200 && b1.remaining === CHECKIN_HEARTS && b1.출석함,
    `출석 → ${한번.status} (200) · 하트 ${b1.remaining}(${CHECKIN_HEARTS}) · 출석함 ${b1.출석함}(true)`]);

  // (4) **두 번째는 안 준다.** 이 줄이 이 자의 몸통이다.
  const 두번 = await 부르기(token);
  const b2 = await balanceFor(db, uid, day);
  줄.push([두번.status === 429 && b2.remaining === CHECKIN_HEARTS,
    `또 누름 → ${두번.status} (429) · 하트 그대로 ${b2.remaining}(${CHECKIN_HEARTS}) "${두번.body.error ?? ""}"`]);

  /**
   * (4-2) **읽기와 쓰기 사이에서 만나면** — 그걸 막는 것이 compare-and-swap 이다.
   *
   * 처음엔 라우트를 `Promise.all` 로 두 번 불러 봤는데, **고장을 심어도(CAS 를 떼어도) 통과했다** —
   * 왕복 지연 때문에 두 번째 읽기가 첫 번째 쓰기 뒤에 와서 경주가 안 났다. 이빨 없는 검사는
   * 안 쓴다([[planted-fault-must-be-well-formed]]). 그래서 **경주 자체를 만들어** 잰다:
   * 둘 다 "보너스 0" 을 읽은 상태로 같이 쓰면 **하나만 바뀌어야** 한다.
   *
   * 정직하게: 이건 라우트가 아니라 **그 안이 기대는 장치**를 잰 것이다. 라우트에서 그 경주가
   * 실제로 얼마나 나는지는 못 잰다.
   */
  {
    const e2 = `checkin2-${Date.now()}@dugeun.local`;
    const { data: m2, error: e2err } = await db.auth.admin.createUser({ email: e2, password: pw, email_confirm: true });
    if (e2err || !m2?.user) throw e2err ?? new Error("둘째 사람을 못 만들었다");
    const uid2 = m2.user.id;
    await db.from("dot_usage").upsert({ user_id: uid2, day, turns: 0, bonus_turns: 0, ad_refills: 0 }, { onConflict: "user_id,day" });
    const 쓰기 = (읽은값: number) => db.from("dot_usage")
      .update({ bonus_turns: 읽은값 + CHECKIN_HEARTS })
      .eq("user_id", uid2).eq("day", day).eq("bonus_turns", 읽은값).select("bonus_turns");
    const [r1, r2] = await Promise.all([쓰기(0), 쓰기(0)]);
    const 이긴수 = [r1, r2].filter((r) => (r.data ?? []).length > 0).length;
    const b2x = await balanceFor(db, uid2, day);
    줄.push([이긴수 === 1 && b2x.remaining === CHECKIN_HEARTS,
      `같은 값을 읽고 둘이 쓰면 하나만 이긴다: 이긴 ${이긴수}개(1) · 하트 ${b2x.remaining}(${CHECKIN_HEARTS})`]);
    await db.from("dot_usage").delete().eq("user_id", uid2);
    await db.auth.admin.deleteUser(uid2).catch(() => {});
  }

  // (5) 광고를 본 뒤에도 "이미 출석함" 이 흔들리지 않는다 — 덜어 세기(보너스 − 광고분)가 맞나
  const 광고상태 = await 광고();
  const b3 = await balanceFor(db, uid, day);
  줄.push([광고상태 === 200 && b3.출석함 && b3.remaining === CHECKIN_HEARTS + AD_REFILL_TURNS,
    `광고 1번 → ${광고상태} (200) · 하트 ${b3.remaining}(${CHECKIN_HEARTS + AD_REFILL_TURNS}) · 출석함 ${b3.출석함}(true)`]);
  const 세번 = await 부르기(token);
  줄.push([세번.status === 429, `광고 뒤 또 출석 → ${세번.status} (429) — 광고분이 출석으로 안 읽힌다`]);

  // (6) 하루 최대 = 출석 5 + 광고 5
  for (let i = 1; i < AD_REFILLS_PER_DAY; i++) await 광고();
  const b4 = await balanceFor(db, uid, day);
  const 최대 = CHECKIN_HEARTS + AD_REFILLS_PER_DAY * AD_REFILL_TURNS;
  줄.push([b4.remaining === 최대 && b4.adLeft === 0,
    `하루 최대 ${b4.remaining}(${최대}) · 남은 광고 ${b4.adLeft}(0)`]);
} finally {
  await db.from("dot_usage").delete().eq("user_id", uid);
  await db.auth.admin.deleteUser(uid).catch(() => {});
}

for (const [ok, s] of 줄) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
const 통과 = 줄.filter(([ok]) => ok).length;
console.log(`\n  ${통과}/${줄.length}`);
process.exit(통과 === 줄.length ? 0 : 1);
