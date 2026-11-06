import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST } from "@/lib/dot/bond";
import { AD_REFILLS_PER_DAY, AD_REFILL_TURNS, balanceFor } from "@/lib/dot/money";

/**
 * 광고 보고 충전 — **하루 5번, 한 번에 +1** (11-04 사장님 "광고 보면 1개 늘려주는 식으로").
 * 숫자와 그 근거는 `money.ts` 에 한 곳으로 적어 뒀다.
 *
 * ## 11-07: 광고는 붙었다. 증거는 여전히 없다.
 *
 * `adbreak.ts`(AdSense H5)가 광고를 **실제로 띄우고**, 끝까지 본 것만(`adViewed`) 이 주소를
 * 부른다 — 닫은 광고는 화면에서 걸러진다(`dot_ad_show_test` 6/6, 심은 고장에 ❌).
 *
 * 그래도 **서버가 받는 증거는 없다.** H5 에는 AdMob 보상형의 SSV 콜백(구글이 우리 서버를 직접
 * 두드리는 길)이 없다. 즉 이 주소는 끝까지 **브라우저의 말을 믿는다.**
 * 난간은 둘뿐이다:
 *   · `AD_REWARD_OPEN=1` + `ADSENSE_CLIENT` 가 둘 다 있어야 열린다(`adConfFromEnv`)
 *   · **하루 상한 5번** — 거짓으로 끝까지 새도 하루 5하트(2.3원)다. 상한이 돈을 막고 있다.
 * AdMob 보상형(앱을 WebView 로 다시 쓰는 길)로 가는 날엔 충전을 **SSV 콜백**이 하고
 * 이 주소는 지워진다 [[dot-web-payment]].
 */
export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (process.env.AD_REWARD_OPEN !== "1") return Response.json({ error: "광고는 곧 열려요. 조금만 기다려 주세요." }, { status: 503 });

  const db = createServiceClient();
  const day = todayKST();
  const { data, error } = await db.rpc("dot_ad_refill", { p_user: userId, p_day: day, p_max: AD_REFILLS_PER_DAY, p_turns: AD_REFILL_TURNS });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (Number(data) < 0) return Response.json({ error: "오늘 광고는 다 봤어요. 내일 또 볼 수 있어요." }, { status: 429 });
  return Response.json({ ok: true, balance: await balanceFor(db, userId, day) });
}
