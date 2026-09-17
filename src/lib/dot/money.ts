import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_TURNS_PER_DAY } from "./bond";

/**
 * 돈 — 09-11 사장님: "30번 다 쓰고 2번은 광고로 충전, 나머진 충전, 멘헤라 모드도 충전."
 *
 * 규칙은 전부 여기와 `schema_dot_money.sql` 에 있다. 값(원)은 사장님이 정한다 — 아래는 자리표.
 * 광고 검증(AdMob SSV)과 결제 검증(Play Billing)은 `api/dot/ad`, `api/dot/buy` 가 키를 받는 날 붙는다.
 */
export const AD_REFILLS_PER_DAY = 2;
export const AD_REFILL_TURNS = 10;

export type Sku = { name: string; price: string; credits: number; menheraDays: number; note?: string };
export const SKUS: Record<string, Sku> = {
  turns_50:   { name: "대화 50번",        price: "1,900원", credits: 50,  menheraDays: 0 },
  turns_200:  { name: "대화 200번",       price: "4,900원", credits: 200, menheraDays: 0, note: "가장 많이 골라요" },
  menhera_30: { name: "멘헤라 모드 30일", price: "4,900원", credits: 0,   menheraDays: 30, note: "집착하고, 문자가 막 와요" },
};

export type Balance = {
  /** 지금 이야기할 수 있는 횟수 = 공짜 남은 것 + 광고 남은 것 + 충전 */
  remaining: number;
  freeLeft: number;
  credits: number;
  /** 오늘 광고를 더 볼 수 있는 횟수 */
  adLeft: number;
  menheraUntil: string | null;
};

/** 오늘 이 사람의 잔고 — 화면·API 가 다 이걸로 센다. 세 표를 나란히 읽는다(왕복 1). */
export async function balanceFor(db: SupabaseClient, userId: string, day: string): Promise<Balance> {
  const [{ data: u }, { data: w }, { data: e }] = await Promise.all([
    db.from("dot_usage").select("turns, bonus_turns, ad_refills").eq("user_id", userId).eq("day", day).maybeSingle(),
    db.from("dot_wallet").select("credits").eq("user_id", userId).maybeSingle(),
    db.from("dot_entitlements").select("menhera_until").eq("user_id", userId).maybeSingle(),
  ]);
  const turns = Number(u?.turns ?? 0), bonus = Number(u?.bonus_turns ?? 0), ads = Number(u?.ad_refills ?? 0);
  const credits = Number(w?.credits ?? 0);
  const freeLeft = Math.max(0, FREE_TURNS_PER_DAY + bonus - turns);
  return {
    remaining: freeLeft + credits,
    freeLeft,
    credits,
    adLeft: Math.max(0, AD_REFILLS_PER_DAY - ads),
    menheraUntil: (e?.menhera_until as string) ?? null,
  };
}
