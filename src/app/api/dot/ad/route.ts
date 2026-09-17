import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST } from "@/lib/dot/bond";
import { AD_REFILLS_PER_DAY, AD_REFILL_TURNS, balanceFor } from "@/lib/dot/money";

/**
 * 광고 보고 충전 — 하루 2번, 한 번에 +10 (09-11 사장님 "30번 다 쓰고 2번은 광고로 충전").
 *
 * 지금은 광고 SDK 가 없다. `AD_REWARD_OPEN=1` 이 아니면 "곧 열려요" 를 돌려준다 — 화면·표·함수는 그대로고,
 * 앱에 AdMob 보상형 광고가 붙는 날 이 자리에 **서버 검증(SSV)** 한 줄이 들어온다. 검증 없이 열면 단추가 곧 공짜 20번이다.
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
