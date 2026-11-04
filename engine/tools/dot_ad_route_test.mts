/**
 * `/api/dot/ad` **주소를 그대로 부른다** (11-04). 화면 없이, 서버 없이 — 라우트 함수를 직접.
 *
 *   npx tsx engine/tools/dot_ad_route_test.mts
 *
 * 왜 따로 재나: `dot_ad_test.mts` 는 DB 함수와 잔고 셈을 쟀다. 그런데 사용자가 누르는 것은
 * **주소**고, 그 길에는 DB 가 모르는 문 셋이 더 있다 — 로그인 검사 · `AD_REWARD_OPEN` 스위치 ·
 * 429(오늘 다 봤음). 돌려 보지 않은 코드는 안 잰 것이다([[unrun-code-is-unmeasured]]).
 *
 * 토큰으로 부른다(앱이 쓰는 길). 쿠키 클라이언트는 이 자리에서 쓸 수 없다.
 */
import { readFileSync } from "node:fs";

const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
process.env.NEXT_PUBLIC_SUPABASE_URL = vars.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = vars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.SUPABASE_SECRET_KEY = vars.SUPABASE_SECRET_KEY;

const { createClient } = await import("@supabase/supabase-js");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { AD_REFILLS_PER_DAY, AD_REFILL_TURNS } = await import("../../src/lib/dot/money");
const { FREE_TURNS_PER_DAY, todayKST } = await import("../../src/lib/dot/bond");

const db = createServiceClient();
const email = `adroute-${Date.now()}@dugeun.local`, pw = "ad-route-pass-1";
const { data: made, error: eu } = await db.auth.admin.createUser({ email, password: pw, email_confirm: true });
if (eu) throw eu;
const uid = made.user.id;

const anon = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signed, error: es } = await anon.auth.signInWithPassword({ email, password: pw });
if (es) throw es;
const token = signed.session!.access_token;

/** 라우트는 오늘 날짜로 센다(`todayKST`) — 자도 같은 날을 봐야 한다. */
const day = todayKST();
const 부르기 = async (bearer?: string) => {
  const { POST } = await import("../../src/app/api/dot/ad/route");
  const res = await POST(new Request("http://x/api/dot/ad", {
    method: "POST", headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  }));
  return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown> };
};

const 줄: [boolean, string][] = [];
try {
  // (1) 스위치가 꺼져 있으면 아무도 못 받는다 — **지금 운영 상태가 이것이다**
  delete process.env.AD_REWARD_OPEN;
  const 꺼짐 = await 부르기(token);
  줄.push([꺼짐.status === 503, `스위치 꺼짐 → ${꺼짐.status} (503) "${꺼짐.body.error ?? ""}"`]);

  /* (2) 남의 토큰으로 부르면 막힌다.
     **토큰을 아예 안 보내는 경우는 여기서 못 잰다** — 그 길은 쿠키 클라이언트로 가고,
     쿠키는 Next 요청 안에서만 읽힌다(이 자를 처음 돌렸을 때 바로 거기서 터졌다,
     [[db-constraint-errors-must-be-read]] 와 같은 종류: 못 재는 것을 통과로 적지 않는다).
     그래서 토큰 길의 401 만 잰다. */
  process.env.AD_REWARD_OPEN = "1";
  const 가짜 = await 부르기("not-a-real-token");
  줄.push([가짜.status === 401, `가짜 토큰 → ${가짜.status} (401) "${가짜.body.error ?? ""}"`]);

  // (3) 켜면 한 번에 +1 이 들어온다
  for (let i = 0; i < FREE_TURNS_PER_DAY; i++) await db.rpc("dot_take_turn", { p_user: uid, p_day: day, p_limit: FREE_TURNS_PER_DAY });
  const 한번 = await 부르기(token);
  const b = (한번.body.balance ?? {}) as Record<string, number>;
  줄.push([한번.status === 200 && b.remaining === AD_REFILL_TURNS && b.adLeft === AD_REFILLS_PER_DAY - 1,
    `광고 1번 → ${한번.status} (200), 남은 대화 ${b.remaining}(${AD_REFILL_TURNS}), 남은 광고 ${b.adLeft}(${AD_REFILLS_PER_DAY - 1})`]);

  // (4) 하루 상한에 닿으면 429 — 화면이 단추를 숨겨도 주소는 따로 막아야 한다
  for (let i = 1; i < AD_REFILLS_PER_DAY; i++) await 부르기(token);
  const 넘김 = await 부르기(token);
  줄.push([넘김.status === 429, `${AD_REFILLS_PER_DAY + 1}번째 → ${넘김.status} (429) "${넘김.body.error ?? ""}"`]);
} finally {
  await db.from("dot_usage").delete().eq("user_id", uid);
  await db.from("dot_purchases").delete().eq("user_id", uid);
  await db.auth.admin.deleteUser(uid).catch(() => {});
}

for (const [ok, s] of 줄) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
const 모두 = 줄.every(([ok]) => ok);
console.log(모두 ? "모두 통과" : "떨어진 줄 있음");
process.exit(모두 ? 0 : 1);
