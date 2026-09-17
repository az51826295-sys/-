/**
 * 요금제와 크레딧 환산 (100회차 09-13, 월 구독으로 바꿈).
 *
 * 사업자등록이 없어서 결제는 Paddle 이 **판매자(merchant of record)** 로 대신 받는다 — 세금·영수증도 Paddle 이 낸다.
 * 처음엔 "크레딧 묶음"을 1회 판매했는데 Paddle 사이트 심사가 세 번 거절했다. Paddle 이용 정책은
 * "virtual currency or stored value (store credit, gift cards, vouchers)" 판매를 금지하고, 크레딧 묶음은 그렇게 읽힌다.
 * 그래서 **월 구독**(소프트웨어 이용료 + 매달 사용량 한도)으로 바꿨다. 남은 크레딧은 다음 달로 넘어가지 않는다(충전금이 아니다).
 * 가격(원)과 크레딧 양은 사장님이 정한다(09-13 "해" — 월 9,900원 / 월 29,000원). 근거: 실측 원가 업무당 평균 약 $0.34.
 *
 * 규칙: 원장은 원가 달러로 쌓고(비용 장부 `model_usage` 와 같은 단위), 사람에게는 크레딧으로 보여 준다.
 * 가격 id(pri_…, 월 반복 가격)는 Paddle 대시보드에서 만들고 환경변수로 준다.
 */

/** 원가 $1 = 100 크레딧. 업무 하나 평균 약 34 크레딧. */
export const CREDITS_PER_USD = 100;

/** 새 회사에 한 번 주는 체험 크레딧(원가 $1 ≈ 업무 3개). 구독을 시작하면 새 달이 시작되며 체험 잔량은 사라진다. */
export const TRIAL_USD = 1;

export type Sku = {
  id: string;
  name: string;
  /** 화면에 보이는 가격(한국어). 실제 청구 금액은 Paddle 가격(pri_…)이 정한다 — 둘은 사장님이 같이 맞춘다. */
  priceLabel: string;
  /** 영어 화면(정문 페이지)용 가격. */
  priceLabelEn: string;
  /** 한 달에 원장에 넣는 원가 달러(= 매달 크레딧 한도). */
  usd: number;
  /** Paddle 월 반복 가격 id 가 들어 있는 환경변수 이름. */
  priceEnv: string;
  note?: string;
};

export const SKUS: Sku[] = [
  { id: "starter_monthly", name: "Starter", priceLabel: "월 9,900원", priceLabelEn: "9,900 KRW / month", usd: 3, priceEnv: "PADDLE_PRICE_STARTER", note: "매달 300 크레딧 · 업무 약 9개" },
  { id: "pro_monthly", name: "Pro", priceLabel: "월 29,000원", priceLabelEn: "29,000 KRW / month", usd: 10, priceEnv: "PADDLE_PRICE_PRO", note: "매달 1,000 크레딧 · 업무 약 30개 · 가장 많이 골라요" },
];

export const toCredits = (usd: number) => Math.floor(usd * CREDITS_PER_USD);

/** 결제를 받을 준비가 됐는가. 꺼져 있으면 모든 회사가 옛 한도 방식 그대로 돈다. */
export const billingOpen = () => process.env.BILLING_OPEN === "1";

/**
 * **결제창을 열어도 되는가** (140회차 09-16). `billingOpen` 과 다르다 —
 * 그쪽은 "충전식으로 굴린다(체험 크레딧을 준다)" 이고, 이쪽은 "돈을 실제로 받는다" 다.
 *
 * 09-15 에 Paddle 이 우리를 거절했는데(창작 AI 결과물은 셀프서브로 못 받는다) 화면의 '크레딧 사기' 는
 * 조건 없이 떠 있었다. 친구에게 링크를 건네면 **우리가 못 받는 결제창**을 누르게 된다.
 * 대행사를 새로 구하면 `CHECKOUT_OPEN=1` 로 다시 연다. 기본은 닫힘 — 못 받는 돈을 받는 척하지 않는다.
 */
export const checkoutOpen = () => process.env.CHECKOUT_OPEN === "1";

/**
 * 어느 판매 대행사로 받는가 (167회차 09-18). Paddle 은 여덟 번 거절했고 Dodo Payments 가 받아 줬다.
 * `BILLING_PROVIDER` 로 고르고, 안 적었으면 Dodo 키가 있을 때 Dodo. Paddle 코드는 지우지 않는다(값만 안 넣으면 잠잔다).
 */
export function billingProvider(env: Record<string, string | undefined> = process.env): "dodo" | "paddle" {
  if (env.BILLING_PROVIDER === "dodo" || env.BILLING_PROVIDER === "paddle") return env.BILLING_PROVIDER;
  return env.DODO_API_KEY ? "dodo" : "paddle";
}

/**
 * **이 사람에게 결제창을 열어도 되는가** (167회차 09-18).
 * 라이브면 `CHECKOUT_OPEN=1` 일 때 모두에게. **시험 모드면 명단에 있는 사람만** — 시험 카드 번호는 공개돼 있어서,
 * 시험 결제창을 모두에게 열면 아무나 공짜로 크레딧을 채우고 그 크레딧은 진짜 모델 값을 쓴다.
 * 명단: `OWNER_EMAIL` + `BILLING_TEST_EMAILS`(쉼표). 시험 모드에서는 `CHECKOUT_OPEN` 을 안 본다(명단이 곧 문이다).
 */
export function canCheckout(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const live = billingProvider(env) === "dodo" ? env.DODO_ENV === "live" : env.PADDLE_ENV === "production";
  if (live) return env.CHECKOUT_OPEN === "1";
  const list = [env.OWNER_EMAIL, ...(env.BILLING_TEST_EMAILS ?? "").split(",")].map((e) => (e ?? "").trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

/** 설정된 가격 id 가 있는 요금제만 판다. */
export function sellableSkus(env: Record<string, string | undefined> = process.env) {
  return SKUS.map((s) => ({ ...s, priceId: env[s.priceEnv] ?? null })).filter((s) => !!s.priceId) as (Sku & { priceId: string })[];
}

/** 웹훅이 받은 가격 id → 요금제. 모르는 가격이면 null(돈은 받았는데 줄 게 없다 → 기록하고 사람이 본다). */
export function skuForPrice(priceId: string, env: Record<string, string | undefined> = process.env): Sku | null {
  return SKUS.find((s) => env[s.priceEnv] && env[s.priceEnv] === priceId) ?? null;
}
