import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_TURNS_PER_DAY } from "./bond";

/**
 * 돈 — **10-25 사장님 확정: 턴 상품을 버리고 멘헤라 구독 하나로 간다.**
 *
 * 왜 바꿨나(전부 장부 실측, 계정 22명·65일치):
 *   · 사람들은 하루 **2회**(가운데값) 말하는데 무료가 **30회**였다. 한도에 닿은 날이 **3%**,
 *     광고 충전까지 쓴 사람은 **0명**. → `turns_50`(1,900원)은 15일치 무료분을 돈 주고 사는 꼴이라
 *     **값이 비싼 게 아니라 살 이유가 없었다.** 실제 결제도 0건이었다(기록 2건은 손으로 넣은 것).
 *   · 그래서 턴 상품을 지우고 **무료를 10회로 좁혀** 체험판으로 만들고, 유일한 상품을 구독으로 둔다.
 *
 * 무료 10회로 정한 까닭: 한도에 닿는 날이 5회면 17%, 10회면 **11%**. 이미 36%가 첫날 떠나는 제품이라
 * 마찰을 더 걸면 전환보다 이탈이 크다. 가운데값 2회인 사람은 안 걸리고 많이 쓰는 쪽만 걸린다.
 *
 * 구독이 무제한인데 안 터지나: 한 턴 약 **0.457원**(deepseek-v4-flash, 캐시 포함 실측).
 * 월 4,900원 본전이 **하루 358턴**인데 지금 제일 많이 쓴 날이 39턴이다. 열 배 여유가 있다.
 * 다만 매크로 한 명이 종일 돌리면 거기서 손해가 나므로 **난간**(`구독_하루난간`)을 남긴다.
 */

/**
 * 광고 보고 +1회 — **11-04 사장님 지시로 되살렸다.** ("광고로 돈 버는 건 사업자 등록 없이도 할 수 있데")
 *
 * 10-25 에 껐던 이유는 "본 사람이 0명" 이었는데, **그때는 조건이 달랐다.** 무료가 30회라
 * 한도에 닿는 날이 3% 였다 — 아무도 한도를 못 봤으니 광고 단추를 볼 일도 없었다.
 * 같은 날 무료를 10회로 좁혔고 지금은 **11%** 가 한도에 닿는다. 단추를 볼 사람이 생겼다.
 *
 * 숫자는 사장님이 "니가 정해" 라 해서 내가 골랐다(조정 전제). 근거:
 *   · **+1회/번** 은 사장님이 정한 것이다. 한 번에 +10 이면 광고 하나로 하루가 끝나 두 번째를 안 본다.
 *   · **하루 5번** → 최대 15회. 한 턴 0.457원이라 광고분 비용은 하루 **2.3원**.
 *     한국 보상형 광고가 노출당 대략 3~7원이면 5번에 **15~35원** — 비용의 6~15배다.
 *     위험은 돈이 아니라 **구독을 안 사게 되는 것**이라, 15회는 가운데값 2회보다 넉넉하면서
 *     무제한(구독)과는 분명히 다른 자리에 둔다. 구독 본전은 하루 358턴이므로 한참 아래다.
 *
 * ⚠ 아직 **광고 SDK 가 없다.** `AD_REWARD_OPEN=1` 이 꺼져 있으면 서버가 503 을 주고
 * 화면도 단추를 안 그린다([[feature-removal-leaves-dead-ends]] — 못 하는 일을 시키는 단추를 두지 않는다).
 */
export const AD_REFILLS_PER_DAY = 5;   // 하루 광고 횟수
export const AD_REFILL_TURNS = 1;      // 한 번에 늘어나는 대화 횟수 (사장님 지시)

/**
 * 구독자가 하루에 이만큼을 넘기면 **사람이 아니라고 본다**(매크로·자동 돌리기).
 * 막지는 않고 장부에 남겨 사장님이 보게 한다 — 진짜 열성 사용자를 끊으면 안 된다.
 * 358 = 월 4,900원 본전 턴 수. 그 위는 그 사람에게서 손해가 나기 시작하는 자리다.
 */
export const SUB_DAILY_RAIL = 358;   // 구독자 하루 난간

export type Sku = { name: string; price: string; credits: number; menheraDays: number; note?: string; 구독?: boolean };

/**
 * **파는 것은 하나다.** Play Console 의 구독 상품 ID 와 이 키가 같아야 한다.
 * 옛 `turns_50`·`turns_200` 은 지웠다 — 되살리려면 위 주석의 숫자부터 다시 재야 한다.
 */
export const SKUS: Record<string, Sku> = {
  menhera_sub: {
    name: "멘헤라 모드",
    price: "월 4,900원",
    credits: 0,
    menheraDays: 30,
    note: "무제한 대화 · 선톡 · 집착 연출",
    구독: true,
  },
};

export type Balance = {
  /** 지금 이야기할 수 있는 횟수. 구독자는 `Infinity`. */
  remaining: number;
  freeLeft: number;
  credits: number;
  /** 오늘 더 볼 수 있는 광고 수. 화면은 이게 0 보다 클 때만 광고 단추를 그린다. */
  adLeft: number;
  menheraUntil: string | null;
  /** 지금 구독 중인가 — 화면은 이걸 보고 한도 안내를 숨긴다 */
  구독중: boolean;
};

/** 오늘 이 사람의 잔고 — 화면·API 가 다 이걸로 센다. 세 표를 나란히 읽는다(왕복 1). */
export async function balanceFor(db: SupabaseClient, userId: string, day: string): Promise<Balance> {
  const [{ data: u }, { data: w }, { data: e }] = await Promise.all([
    db.from("dot_usage").select("turns, bonus_turns, ad_refills").eq("user_id", userId).eq("day", day).maybeSingle(),
    db.from("dot_wallet").select("credits").eq("user_id", userId).maybeSingle(),
    db.from("dot_entitlements").select("menhera_until").eq("user_id", userId).maybeSingle(),
  ]);
  const turns = Number(u?.turns ?? 0), bonus = Number(u?.bonus_turns ?? 0);
  const adsSeen = Number(u?.ad_refills ?? 0);
  const credits = Number(w?.credits ?? 0);
  const menheraUntil = (e?.menhera_until as string) ?? null;

  /** 구독 중이면 한도가 없다. 날짜만 보고 가른다(시각까지 보면 자정 근처에서 흔들린다). */
  const 구독중 = !!menheraUntil && menheraUntil >= day;

  /**
   * 광고로 받은 턴은 이미 `bonus_turns` 에 들어가 있다(`dot_ad_refill` 이 거기에 더한다).
   * 그래서 남은 횟수는 따로 더하지 않는다 — 더하면 **두 번 세는 것**이다.
   */
  const freeLeft = Math.max(0, FREE_TURNS_PER_DAY + bonus - turns);
  /** 구독자에게는 광고를 권하지 않는다 — 무제한인 사람에게 광고는 그냥 짜증이다. */
  const adLeft = 구독중 ? 0 : Math.max(0, AD_REFILLS_PER_DAY - adsSeen);
  return {
    remaining: 구독중 ? Number.POSITIVE_INFINITY : freeLeft + credits,
    freeLeft,
    credits,
    adLeft,
    menheraUntil,
    구독중,
  };
}

/**
 * 무료 턴을 다 썼을 때 보여 줄 말 (10-25 사장님 문구).
 * 밋밋한 "한도 초과" 대신 캐릭터가 말하게 한다 — 그 자리가 결제로 이어지는 유일한 문이다.
 */
export const LIMIT_COPY = {   // 한도 문구
  본문: "오늘 준비한 대화는 여기까지야… 나랑 계속 이야기하고 싶다면, ‘멘헤라 모드’로 날 묶어줄래?",
  단추: "멘헤라 모드 구독하고 무제한 대화하기 (월 4,900원)",
  /**
   * 광고 단추는 **아래**에 둔다(11-04). 구독이 위다 — 광고는 공짜라 위에 두면 아무도
   * 구독을 안 본다. 남은 횟수를 같이 적는 이유: 안 적으면 "계속 볼 수 있다" 로 읽히고
   * 다 쓴 순간 **아무 일도 안 일어나는 단추**가 된다.
   */
  광고단추: (남음: number) => `광고 보고 ${AD_REFILL_TURNS}번 더 이야기하기 (오늘 ${남음}번 남음)`,
};
