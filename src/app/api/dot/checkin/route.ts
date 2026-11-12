import { userIdFrom } from "@/lib/dot/auth";
import { devFromRequest } from "@/lib/dot/dev";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST, CHECKIN_HEARTS } from "@/lib/dot/bond";
import { AD_REFILL_TURNS, balanceFor } from "@/lib/dot/money";

/**
 * **출석체크 — 하루 한 번, 하트 5개** (11-06 사장님 "매일 5개 출석체크 하면 줘").
 *
 * 자동 지급을 0 으로 내렸으니 이 주소가 **말을 걸 수 있게 되는 유일한 문**이다(광고 빼고).
 *
 * ## 두 번 눌러도 한 번만 준다 — 칸 없이 하는 법
 *
 * 받았다고 적을 칸(`checked_in_at`)을 만들려면 DDL 이 필요한데 이 기계에 열쇠(PAT)가 없다.
 * 그래서 **있는 칸으로** 센다: 하루치 보너스(`bonus_turns`)에 들어오는 길은 출석과 광고뿐이라
 * `bonus_turns − ad_refills × AD_REFILL_TURNS ≥ CHECKIN_HEARTS` 면 이미 받은 것이다.
 *
 * 두 번 눌리는 것(손가락·새로고침·두 창)은 **읽고 쓰기 사이**에서 난다. 그래서 쓸 때
 * `bonus_turns` 가 **읽은 값 그대로일 때만** 바꾼다(compare-and-swap) — 그 사이 누가 바꿨으면
 * 0 줄이 돌아오고 우리는 "이미 받았다" 로 답한다. 이 비교는 Postgres 안에서 일어나므로
 * 두 요청이 같이 들어와도 한쪽만 이긴다([[two-writers-need-a-decided-id]] 와 같은 자리).
 *
 * 열쇠가 생기면 `dot_check_in` RPC 로 옮긴다. 그때까지 **`dot_grant` 로 보너스를 손으로
 * 넣으면 이 셈이 틀어진다**(출석한 것으로 읽힌다) — 손으로 줄 때는 크레딧 쪽을 쓸 것.
 */
export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  const db = createServiceClient();
  const day = todayKST();

  /* 오늘 줄이 없으면 만든다. 이미 있으면 건드리지 않는다(만든 값으로 덮으면 턴 수가 날아간다). */
  const { error: 만들기 } = await db.from("dot_usage")
    .upsert({ user_id: userId, day, turns: 0, bonus_turns: 0, ad_refills: 0 }, { onConflict: "user_id,day", ignoreDuplicates: true });
  if (만들기) return Response.json({ error: 만들기.message }, { status: 500 });

  const { data: 지금, error: 읽기 } = await db.from("dot_usage")
    .select("bonus_turns, ad_refills").eq("user_id", userId).eq("day", day).maybeSingle();
  if (읽기 || !지금) return Response.json({ error: 읽기?.message ?? "오늘 기록을 못 읽었어요." }, { status: 500 });

  const bonus = Number(지금.bonus_turns ?? 0), ads = Number(지금.ad_refills ?? 0);
  if (bonus - ads * AD_REFILL_TURNS >= CHECKIN_HEARTS) {
    return Response.json({ error: "오늘은 이미 받았어요. 내일 또 와요." }, { status: 429 });
  }

  const { data: 바뀜, error: 쓰기 } = await db.from("dot_usage")
    .update({ bonus_turns: bonus + CHECKIN_HEARTS })
    .eq("user_id", userId).eq("day", day).eq("bonus_turns", bonus)   // ← 읽은 값 그대로일 때만
    .select("bonus_turns");
  if (쓰기) return Response.json({ error: 쓰기.message }, { status: 500 });
  if (!바뀜 || 바뀜.length === 0) {
    return Response.json({ error: "오늘은 이미 받았어요. 내일 또 와요." }, { status: 429 });
  }

  return Response.json({ ok: true, hearts: CHECKIN_HEARTS, balance: await balanceFor(db, userId, day, devFromRequest(request)) });
}
