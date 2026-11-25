import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * **진짜 도트 변환 — 장수 장부** (11-24, 사장님: 4,900원 = 10장).
 *
 * 새 표를 안 만든다(이 기계엔 DDL 열쇠가 없다). 두근도트 결제 장부 `dot_purchases` 에 줄로 적는다:
 *   산 것  sku `pixel_10`  credits +10  source `polar`  ref = Polar checkout id  (번호표 — 몇 번 불러도 한 번만)
 *   쓴 것  sku `pixel_use` credits −1   source `pixel`  ref = 받은 시각·크기
 * 남은 장수 = 두 sku 의 credits 합. **하트 지갑(`dot_wallet`)은 건드리지 않는다** — 하트와 장수는 다른 돈이다.
 */
/**
 * 11-25 사장님 "토큰으로 가자 · 실패는 고치고 비싸게 받자": 4,900원 = 100토큰, 기능마다 값이 다르다.
 * 원가(11-25 실측): 변환·자르기 0원(서버 계산만) · 만들기 약 9원 · 4방향·동작 약 15원(실패해도 나간다).
 * 키 이름 `pixel_10` 은 Polar 상품표(POLAR_DOT_PRODUCTS)와 묶여 있어 그대로 둔다 — 산 줄에 적히는 숫자만 100.
 * 바꾸기 전 장부에 pixel 줄은 0개였다(산 사람 0명) — 옮길 것이 없었다.
 */
export const PIXEL_PACK = { key: "pixel_10", shots: 100, krw: 4900 } as const;
/** 기능별 토큰 값 — 값은 사장님이 정한다. 바꾸려면 여기 한 곳. */
export const PIXEL_COST = { convert: 2, split: 2, create: 10, turn: 15, motion: 15 } as const;

export async function pixelBalance(db: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await db
    .from("dot_purchases").select("credits").eq("user_id", userId).in("sku", [PIXEL_PACK.key, "pixel_use"]);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.credits ?? 0), 0);
}

/** 토큰 n 개를 쓴다. 쓴 줄의 id(참)를 돌려준다 — 모자라면 false. 동시에 두 번 눌러 음수가 되면 내 줄을 지우고 false. */
export async function spendPixelShot(db: SupabaseClient, userId: string, note: string, n = 1): Promise<number | false> {
  if ((await pixelBalance(db, userId)) < n) return false;
  const { data, error } = await db
    .from("dot_purchases")
    .insert({ user_id: userId, sku: "pixel_use", credits: -n, menhera_days: 0, source: "pixel", ref: note.slice(0, 120) })
    .select("id").single();
  if (error) throw new Error(error.message);
  if ((await pixelBalance(db, userId)) < 0) {
    await db.from("dot_purchases").delete().eq("id", data.id);
    return false;
  }
  return data.id as number;
}

/** 쓴 장을 돌려준다(AI 동작 생성이 끝내 실패했을 때) — 쓴 줄을 지운다. 그 사람의 pixel_use 줄만. */
export async function refundPixelShot(db: SupabaseClient, userId: string, spentId: number): Promise<void> {
  await db.from("dot_purchases").delete().eq("id", spentId).eq("user_id", userId).eq("sku", "pixel_use");
}

/** 산 10장을 넣는다. 번호표(ref=checkout id)가 이미 있으면 아무것도 안 한다. */
export async function grantPixelPack(db: SupabaseClient, userId: string, checkoutId: string): Promise<{ already: boolean }> {
  const 있던 = await db.from("dot_purchases").select("id").eq("ref", checkoutId).eq("source", "polar").eq("sku", PIXEL_PACK.key);
  if ((있던.data?.length ?? 0) > 0) return { already: true };
  const { data, error } = await db
    .from("dot_purchases")
    .insert({ user_id: userId, sku: PIXEL_PACK.key, credits: PIXEL_PACK.shots, menhera_days: 0, source: "polar", ref: checkoutId })
    .select("id").single();
  if (error) throw new Error(error.message);
  // 두 탭이 동시에 돌아와 두 줄이 생겼으면 늦은 줄을 지운다(UNIQUE 를 못 건 대신)
  const 뒤 = await db.from("dot_purchases").select("id").eq("ref", checkoutId).eq("source", "polar").eq("sku", PIXEL_PACK.key).order("id");
  const ids = (뒤.data ?? []).map((r) => r.id as number);
  if (ids.length > 1 && ids[0] !== data.id) { await db.from("dot_purchases").delete().eq("id", data.id); return { already: true }; }
  return { already: false };
}
