import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST } from "@/lib/dot/bond";
import { AD_REFILLS_PER_DAY, AD_REFILL_TURNS, balanceFor } from "@/lib/dot/money";

/**
 * 광고 보고 충전 — **하루 5번, 한 번에 +1** (11-04 사장님 "광고 보면 1개 늘려주는 식으로").
 * 숫자와 그 근거는 `money.ts` 에 한 곳으로 적어 뒀다.
 *
 * ## 아직 열려 있지 않다, 그리고 그게 맞다
 *
 * 광고 SDK 가 없다. `AD_REWARD_OPEN=1` 이 아니면 503 "곧 열려요" 를 돌려준다.
 * **이 스위치가 지금 유일한 자물쇠다** — 광고를 봤다는 증거를 아무도 안 보기 때문에,
 * 검증 없이 켜면 이 주소를 아는 사람에게는 그냥 **하루 공짜 5번**이다
 * (10-28 결제에서 배운 것과 같은 자리: 받는 쪽이 없으면 파는 쪽을 안 연다 [[dot-web-payment]]).
 *
 * 그래서 광고망이 붙는 날 **아래 표시한 자리**에 보상 검증이 들어온다:
 *   · AdMob 보상형 → **SSV 콜백**(구글이 우리 서버를 직접 두드린다). 그 길에서는 이 주소가 아니라
 *     콜백 주소가 충전을 하고, 이 주소는 지워진다 — 클라이언트가 부르는 충전은 끝내 못 믿는다.
 *   · AdSense H5(웹) → 서버가 받을 증거가 없다. 그 경우엔 사람당 상한(하루 5)이 유일한 난간이다.
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
