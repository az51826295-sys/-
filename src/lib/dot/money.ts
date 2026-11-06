import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTO_HEARTS_PER_DAY, CHECKIN_HEARTS } from "./bond";

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
 * 11-07: **광고를 띄우는 코드가 들어왔다**(`adbreak.ts`, AdSense H5). 그래도 단추는
 * 스위치 하나로 안 켜진다 — 아래 `adConfFromEnv()` 가 **광고주 번호까지** 봐야 켜진다.
 */
export const AD_REFILLS_PER_DAY = 5;   // 하루 광고 횟수
export const AD_REFILL_TURNS = 1;      // 한 번에 늘어나는 하트 (사장님 지시)

/** 광고를 띄우려면 **둘 다** 있어야 한다: 스위치와 광고주 번호. */
export type AdConf = { client: string; test: boolean };

/**
 * **광고 창구를 여는 조건** — 서버에서만 부른다(화면에서 부르면 `process.env` 가 비어 null 이다).
 *
 * 스위치 하나로 켜지 않는 까닭: `AD_REWARD_OPEN=1` 만 켜면 광고주 번호가 없어도 단추가 그려지고,
 * 누르면 **광고 없이 하트가 찬다**(11-06 까지 실제로 그런 상태였다). 번호 모양까지 보고
 * 아니면 **단추 자체를 안 그린다** — 못 하는 일을 시키는 자리를 안 남긴다
 * ([[feature-removal-leaves-dead-ends]]).
 *
 *   `AD_REWARD_OPEN=1`  · `ADSENSE_CLIENT=ca-pub-…`  · (`ADSENSE_TEST=1` 이면 가짜 광고)
 *
 * `NEXT_PUBLIC_` 를 **안 쓴다**: 그 이름은 빌드할 때 코드에 박혀서, 번호를 바꾸려면 다시 빌드해야 한다.
 * 서버가 읽어 화면으로 넘기면 Railway 변수만 고치고 다시 띄우면 된다.
 */
export function adConfFromEnv(): AdConf | null {
  if (process.env.AD_REWARD_OPEN !== "1") return null;
  const client = (process.env.ADSENSE_CLIENT ?? "").trim();
  if (!/^ca-pub-\d{10,22}$/.test(client)) return null;
  return { client, test: process.env.ADSENSE_TEST === "1" };
}

/**
 * **하트가 이만큼 아래로 내려가면 광고 단추를 미리 보여 준다** (11-06 사장님: "광고로 주로 벌 거고").
 *
 * 이 값이 왜 생겼나: 광고 단추는 **한도 카드 안에만** 있었다. 그런데 11-06 에 장부를 세 보니
 * 최근 30일 **한도에 닿은 날이 0일**이다(사람 16명·쓴 날 17일·턴 51회, `dot_ad_peek`).
 * 쓰는 날 평균이 3턴이라 10개를 다 쓰는 사람이 없다 — 즉 단추는 **아무도 갈 수 없는 자리**에
 * 있었고, `AD_REWARD_OPEN` 을 켜도 노출이 0 이다. 자리를 벽 앞으로 당긴다.
 *
 * 3 으로 정한 근거: 쓰는 날 평균 3턴이라 **3개 남은 자리는 쓰는 사람이 실제로 지나는 자리**다
 * (10개 중 7개를 쓴 날). 5 로 하면 첫 몇 마디부터 광고가 보이고, 1 로 하면 벽과 다를 바 없다.
 * 광고망이 붙은 뒤 **노출 수를 재서 다시 정할 값**이다 — 지금은 재 본 적 없는 추정이다.
 */
export const AD_NUDGE_AT = 3;

/**
 * **파는 것이 없다** — 11-06 사장님: *"무제한 대화를 없애고 광고제로 가자"*,
 * *"멘헤라 구독 없애고 하트로 가자"*. 여기 있던 `SKUS`(`menhera_sub` 월 4,900원)와
 * 구독자 난간(`SUB_DAILY_RAIL`)을 지웠다.
 *
 * 지울 때 확인한 것: **지금 살아 있는 구독 0건**(`dot_entitlements`), 결제 기록 표 없음.
 * 그래서 **돈을 낸 사람에게서 빼앗는 일은 없다.** 되살리려면 이 커밋을 되돌린다.
 *
 * 왜 없앴나(사장님 뜻 + 숫자): 수입을 광고로 가져가는데 무제한 대화는 그 반대편이다 —
 * 하트를 안 쓰는 사람이 늘수록 광고는 안 보인다. 게다가 60일 동안 구독은 0건이었다.
 * 멘헤라 **연출**은 지우지 않았다. 자격은 `engine/tools/dot_grant.mts` 로만 들어온다.
 */

/**
 * **하트 묶음** — 11-06 사장님 "하트 누르면 광고보기, 하트 결제창으로 넘어가자".
 * 구독 대신 **쓰는 만큼 사는** 쪽이다.
 *
 * ⚠ **아직 돈을 받을 길이 없다.** Play 는 열쇠(`PLAY_VERIFY_KEY`)와 은행 계좌 인증이 남았고
 * (금융이라 내가 안 누른다), 웹 결제도 승인 대기다. 사장님이 *"결제창까지 보이고 준비 중"*
 * 으로 정하셔서 **화면에는 내밀되 누르면 "곧 열려요"** 로 답한다. 파는 스위치는
 * `HEART_BILLING_OPEN=1` 이고 지금은 꺼져 있다 — 받는 쪽이 생기는 날 켠다([[dot-web-payment]]).
 *
 * 값은 **내가 고른 자리표다**(조정 전제). 근거:
 *   · 한 턴 원가 **0.578원**(실측, deepseek-v4-flash 캐시 포함) — 값의 몸통은 원가가 아니다.
 *   · 광고 1회가 대략 **10원**(바깥 벤치마크) 에 하트 1개다. 돈으로 사는 하트를 그보다
 *     **열 배쯤 비싸게** 두면 "시간을 내면 공짜, 급하면 돈" 이 성립한다.
 *   · 옛 구독이 월 4,900원 무제한이었다. 제일 큰 묶음을 그 아래(3,900원)에 둬서
 *     나중에 구독이 돌아와도 값이 안 꼬이게 한다.
 *   · 묶음이 셋인 까닭: 하나면 비싸 보이고, 넷이면 고르다 지친다.
 */
export type HeartPack = { key: string; hearts: number; price: string; won: number; note?: string };
export const HEART_PACKS: HeartPack[] = [
  { key: "hearts_10", hearts: 10, price: "1,200원", won: 1200 },
  { key: "hearts_30", hearts: 30, price: "2,900원", won: 2900, note: "제일 많이 고르는 값" },
  { key: "hearts_60", hearts: 60, price: "3,900원", won: 3900, note: "하트당 제일 쌈" },
];

/** 파는 길이 열렸나 — 꺼져 있으면 화면은 "준비 중" 으로 답한다(틀은 그대로 둔다). */
export const heartBillingOpen = () => process.env.HEART_BILLING_OPEN === "1";

export type Balance = {
  /** 지금 이야기할 수 있는 횟수. 구독자는 `Infinity`. */
  remaining: number;
  freeLeft: number;
  credits: number;
  /** 오늘 더 볼 수 있는 광고 수. 화면은 이게 0 보다 클 때만 광고 단추를 그린다. */
  adLeft: number;
  menheraUntil: string | null;
  /** 오늘 출석체크를 했나 — 안 했으면 하트가 0 이고, 카드가 받는 문이 된다(11-06). */
  출석함: boolean;
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

  /**
   * **오늘 출석했나** — 따로 적는 칸이 없어서 **덜어서** 센다(11-06).
   *
   * 하루치 보너스 하트(`bonus_turns`)에 들어오는 길은 둘뿐이다: 출석 `CHECKIN_HEARTS` 개,
   * 광고 `ad_refills × AD_REFILL_TURNS` 개. 그래서 광고분을 덜면 출석분이 남는다.
   * 칸을 새로 만들지 않은 까닭은 이 기계에 DDL 열쇠(PAT)가 없어서다 —
   * 열쇠가 생기면 `checked_in_at` 칸으로 옮기는 쪽이 곧다(`dot_grant` 가 보너스를 손으로
   * 넣으면 이 셈이 틀어진다). 그때까지는 이 식이 **유일한 눈**이다.
   */
  const 출석함 = bonus - adsSeen * AD_REFILL_TURNS >= CHECKIN_HEARTS;

  /**
   * 광고로 받은 턴은 이미 `bonus_turns` 에 들어가 있다(`dot_ad_refill` 이 거기에 더한다).
   * 그래서 남은 횟수는 따로 더하지 않는다 — 더하면 **두 번 세는 것**이다.
   * 11-06: 자동 지급(`AUTO_HEARTS_PER_DAY`)은 0 이다. 하트는 출석·광고로만 들어온다.
   */
  const freeLeft = Math.max(0, AUTO_HEARTS_PER_DAY + bonus - turns);
  const adLeft = Math.max(0, AD_REFILLS_PER_DAY - adsSeen);
  return {
    remaining: freeLeft + credits,
    freeLeft,
    credits,
    adLeft,
    menheraUntil,
    출석함,
  };
}

/**
 * 하트가 0 일 때 보여 줄 말. 밋밋한 "한도 초과" 대신 **캐릭터가 말한다**(10-25 사장님).
 *
 * 11-06: 구독을 없애서 옛 본문(*"‘멘헤라 모드’로 날 묶어줄래?"*)과 구독 단추를 뺐다 —
 * 없는 상품을 조르는 말이 된다. 사장님이 *"니가 해"* 라 하셔서 아래 두 문장은 내가 정했다.
 *
 * 쓸 때 지킨 것(옛 문구에서 그대로 가져온 결): **반말·말줄임표·조르지 않고 아쉬워하기.**
 * 구독 문구가 통했던 자리는 "사 줘" 가 아니라 *"날 묶어줄래?"* 처럼 **부탁**이었다.
 * 그래서 광고도 "보세요" 가 아니라 "보고 와 줄래?" 로 둔다. 출석 쪽은 기다렸다는 말투 —
 * 매일 와야 하는 화면이라 그 자리에서 반가워야 한다.
 */
export const LIMIT_COPY = {   // 한도 문구
  본문: "오늘은 여기까지야… 더 듣고 싶은데. 광고 하나만 보고 와 줄래?",
  출석본문: "왔구나. 기다렸어 — 하트부터 받아 가, 그래야 너랑 얘기할 수 있어.",
  /**
   * 남은 횟수를 같이 적는 이유: 안 적으면 "계속 볼 수 있다" 로 읽히고
   * 다 쓴 순간 **아무 일도 안 일어나는 단추**가 된다.
   */
  광고단추: (남음: number) => `광고 보고 하트 ${AD_REFILL_TURNS}개 받기 (오늘 ${남음}번 남음)`,
};
