import { verifyDodoSignature, dodoBase, type DodoEvent } from "@/lib/billing/dodo";
import { SKUS } from "./money";

/**
 * **두근도트 결제** (10-28 사장님 "결제창 만들고 결제 구현해놔").
 *
 * 파는 것은 하나다 — 멘헤라 구독 월 4,900원(`money.ts` 의 `menhera_sub`).
 *
 * ## 왜 Play Billing 이 아니라 웹 결제인가
 *
 * 둘 다 필요하고, **지금 돈을 받을 수 있는 쪽은 웹뿐이다.** Play Billing 은 앱 안에서
 * 구매 토큰을 만들어야 하는데 그 코드를 붙이려면 **새 APK** 가 필요하고,
 * 업로드 열쇠 비밀번호를 모른다(10-19). 그래서 Play 길(`/api/dot/buy`)은 그대로 두고
 * 열쇠가 풀리는 날 켜고, 그때까지는 이 길로 받는다. **두 길은 같은 `dot_grant` 로 모인다** —
 * 주는 자리가 둘이면 언젠가 서로 다른 날짜를 준다.
 *
 * ## 받는 곳이 아직 없다 — **Dodo 로는 못 받는다**
 *
 * 10-28 에 내가 Dodo 에 붙여 놨다가 사장님이 바로잡으셨다. **09-18 에 내가 직접 읽고
 * 적어 둔 것**이 있다: Dodo 판매자 정책은 *"AI-generated relationship companions"* 를
 * 금지하고, 그때 "두근도트는 Dodo 로 못 받는다(계정에 넣지 말 것)" 라고 써 뒀다.
 * 그런데 10-16 자 문서가 그 줄 없이 "Dodo 로 붙일 수 있다" 고만 적어 뒀고, 오늘 그걸
 * 읽고 움직였다. 금지된 상품을 **심사 중인 계정에** 만들어 둔 셈이라 지웠다.
 *
 * 그래서 이 파일의 Dodo 부분은 **잠들어 있다.** 지우지 않는 이유는 받는 곳이 바뀌어도
 * 바뀌는 것은 `createDotCheckout`·`planDotGrant` 둘뿐이기 때문이다 — 결제창·계정 연결·
 * 주는 자리(`dot_grant`)·자는 그대로 쓴다. 서명 검사·HMAC 은 `lib/billing/dodo.ts` 것을
 * 그대로 가져다 쓴다(암호 코드를 두 벌 두면 한쪽만 고쳐진다).
 *
 * **다음 대행사를 고르기 전에 그쪽 금지 업종 목록부터 읽는다.** 그게 09-18 에 한 일이고,
 * 오늘 안 한 일이다.
 *
 * ## 이 파일이 안 하는 것
 *
 * - **구독 취소를 즉시 끊지 않는다.** `menhera_until` 이 날짜라서 낸 기간이 끝나면 저절로 꺼진다.
 *   취소했다고 당장 거둬들이면 이미 낸 돈을 빼앗는 것이다.
 * - **만료일을 우리가 계산하지 않는다.** 가능하면 Dodo 가 말한 다음 결제일을 쓴다.
 *   우리가 30일을 더하면 환불·결제 보류·요금제 변경이 생겼을 때 어긋난다(Play 길도 같은 규칙).
 */

/** Dodo 상품 id. 없으면 **팔지 않는다** — 없는 상품으로 결제창을 열면 사람이 빈 창을 본다. */
export const dotProductId = (env: Record<string, string | undefined> = process.env) =>
  env.DOT_DODO_PRODUCT_MENHERA ?? null;

/**
 * **웹훅 열쇠도 있어야 연다.**
 *
 * 10-28 에 내가 만든 구멍: 처음엔 API 열쇠와 상품만 봤다. 그러면 웹훅 비밀이 없어도
 * 단추가 살아나는데, 웹훅 길은 서명이 안 맞아 **전부 401 로 버린다** — 즉 사람은 돈을
 * 내고 구독은 안 켜진다. 결제에서 제일 나쁜 상태다.
 *
 * 받는 쪽이 준비되기 전에는 **파는 쪽을 열지 않는다.**
 */
export const 결제켜짐 = (env: Record<string, string | undefined> = process.env) =>
  Boolean(env.DOT_DODO_API_KEY && dotProductId(env) && env.DOT_DODO_WEBHOOK_SECRET);

/** 다음 결제일을 모르면 이만큼 준다. 한 달 + 이틀 — 결제가 하루 늦어도 끊기지 않게. */
export const FALLBACK_DAYS = 32;

export type 결제상태 = {
  열림: boolean;
  상품: { name: string; price: string; note?: string };
  막는것: string[];
};

/** 화면이 "왜 못 사는지"를 사람 말로 보여 줄 수 있게, 막는 것을 **세어서** 돌려준다. */
export function payState(
  o: { signedIn: boolean },
  env: Record<string, string | undefined> = process.env,
): 결제상태 {
  const 막는것: string[] = [];
  /* **왜 못 사는지를 사실대로 적는다.** "열쇠가 없어요" 는 곧 생긴다는 뜻으로 읽히는데,
     지금은 받아 줄 대행사 자체가 없다. 곧 될 것처럼 적으면 사람이 기다린다. */
  if (!env.DOT_DODO_API_KEY || !dotProductId(env)) {
    막는것.push("아직 결제를 받아 줄 곳을 못 구했어요");
  } else if (!env.DOT_DODO_WEBHOOK_SECRET) {
    /* 돈을 받고도 못 켜는 상태를 막는다 — 위 `결제켜짐` 주석 참고. */
    막는것.push("결제 확인 통로가 아직 안 열렸어요");
  }
  if (!o.signedIn) 막는것.push("계정이 있어야 결제한 걸 폰을 바꿔도 이어 쓸 수 있어요");
  const s = SKUS.menhera_sub;
  return {
    열림: 막는것.length === 0,
    상품: { name: s.name, price: s.price, note: s.note },
    막는것,
  };
}

/**
 * 결제창 링크를 만든다. **누가 샀는지는 서버가 넣는다** — 화면이 보낸 값을 웹훅이 믿으면
 * 아무나 남의 id 를 적어 보내서 남에게 구독을 선물(또는 떠넘기기)할 수 있다.
 */
export async function createDotCheckout(
  o: { userId: string; email: string | null; returnUrl: string },
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const product = dotProductId(env);
  if (!env.DOT_DODO_API_KEY || !product) return { ok: false, error: "결제 준비가 아직 안 됐어요." };
  const r = await fetchImpl(`${dodoBase({ DODO_ENV: env.DOT_DODO_ENV })}/subscriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.DOT_DODO_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      product_id: product,
      quantity: 1,
      payment_link: true,
      return_url: o.returnUrl,
      ...(o.email ? { customer: { email: o.email, name: o.email.split("@")[0] } } : {}),
      /* `dot_user` 가 이 결제의 주인이다. 웹훅은 **이것만** 믿는다. */
      metadata: { dot_user: o.userId, sku: "menhera_sub" },
      billing: { country: "KR", state: "", city: "", street: "", zipcode: "" },
    }),
  });
  const text = await r.text();
  if (!r.ok) {
    console.error("[dot/pay] 결제창을 못 만들었다:", r.status, text.slice(0, 300));
    return { ok: false, error: "결제 창을 열지 못했어요. 잠시 뒤에 다시 해 주세요." };
  }
  let j: { payment_link?: string | null; checkout_url?: string | null };
  try { j = JSON.parse(text) as typeof j; } catch { return { ok: false, error: "결제 창 주소를 못 읽었어요." }; }
  const url = j.payment_link ?? j.checkout_url ?? null;
  if (!url) return { ok: false, error: "결제 창 주소를 못 받았어요." };
  return { ok: true, url };
}

export type 줄계획 =
  | { ok: true; userId: string; days: number; ref: string; 만료: string | null }
  | { ok: false; 건너뜀: string };

/**
 * 성공한 결제 하나 → `dot_grant` 에 넣을 한 줄.
 *
 * **`payment.succeeded` 만 센다.** 첫 결제에도 갱신에도 난다. `subscription.renewed` 를 같이 세면
 * 한 달에 두 번 채운다(로키가 같은 자리에서 먼저 배웠다).
 */
export function planDotGrant(
  event: DodoEvent & { data?: { next_billing_date?: string | null } },
  now: number = Date.now(),
): 줄계획 {
  if (event.type !== "payment.succeeded") return { ok: false, 건너뜀: `다루지 않는 이벤트: ${event.type ?? "?"}` };
  const d = event.data ?? {};
  if (!d.payment_id) return { ok: false, 건너뜀: "결제 번호 없음" };
  if (d.status && d.status !== "succeeded") return { ok: false, 건너뜀: `성공이 아님: ${d.status}` };
  const userId = typeof d.metadata?.dot_user === "string" ? d.metadata.dot_user : "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, 건너뜀: `누구 것인지 없음(${d.payment_id})` };
  if (typeof d.metadata?.sku === "string" && d.metadata.sku !== "menhera_sub") {
    return { ok: false, 건너뜀: `모르는 상품: ${d.metadata.sku}` };
  }

  /* **만료일은 Dodo 가 말한 다음 결제일을 쓴다.** 없을 때만 우리가 센다.
     지나간 날짜가 오면 안 쓴다 — 그걸 그대로 믿으면 산 사람이 0일을 받는다. */
  const next = d.next_billing_date ? Date.parse(d.next_billing_date) : NaN;
  const 쓸만한다음 = Number.isFinite(next) && next > now;
  const days = 쓸만한다음
    ? Math.max(1, Math.ceil((next - now) / 864e5))
    : FALLBACK_DAYS;
  return {
    ok: true, userId, days, ref: d.payment_id,
    만료: 쓸만한다음 ? new Date(next).toISOString() : null,
  };
}

/** 웹훅 서명 — 로키와 **같은 코드**를 쓴다. 두 벌이면 한쪽만 고쳐진다. */
export function 서명확인(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  env: Record<string, string | undefined> = process.env,
  nowSec?: number,
) {
  return verifyDodoSignature(rawBody, headers, env.DOT_DODO_WEBHOOK_SECRET ?? "", nowSec);
}
