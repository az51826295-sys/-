import { createHmac, timingSafeEqual } from "node:crypto";
import { SKUS, type Sku } from "./plans";
import type { GrantPlan } from "./paddle";

/**
 * Dodo Payments (167회차 2026-09-18). 사장님: "좋은 소식 하나 — 우리 결제 된대, dodo." → "테스트 모드로 붙여 봐."
 *
 * Paddle 이 여덟 번 거절한 뒤 찾은 판매 대행사(merchant of record)다 — 사업자등록 없이 받고, 세금·영수증은 Dodo 가 낸다.
 * Paddle 코드는 그대로 두고 옆에 붙인다(`plans.ts` 의 `billingProvider()` 가 고른다). 원장(`ledger.ts`)은 같다.
 *
 * Paddle 과 다른 점 셋:
 *  1. **결제창은 서버가 만든다.** Paddle 은 브라우저가 가격 id 와 회사 id 를 들고 창을 열었다(그래서 웹훅이 화면이 보낸 값을
 *     안 믿었다). Dodo 는 우리 서버가 비밀 키로 `POST /checkouts` 를 불러 링크를 받는다 — `metadata` 는 우리가 쓴 것이다.
 *  2. **서명은 Standard Webhooks.** 헤더 `webhook-id`·`webhook-timestamp`·`webhook-signature`("v1,<base64>" 가 빈칸으로 여러 개),
 *     서명 대상은 `${id}.${timestamp}.${원문}`, 열쇠는 `whsec_` 뒤의 base64 를 푼 바이트.
 *  3. **구독 결제에는 상품 목록이 비어 올 수 있다**(`product_cart: null`). 그래서 상품은 ① 목록 ② 우리가 넣은 metadata.sku
 *     ③ 그래도 없으면 구독을 Dodo 에 물어서 안다. 어느 쪽이든 **양은 우리 상품표**가 정한다.
 *
 * 돈이 들어오는 이벤트는 `payment.succeeded` 하나만 센다 — 첫 결제에도, 매달 갱신에도 난다(갱신 때 `subscription.renewed` 가
 * 같이 오지만 그건 세지 않는다. 둘 다 세면 한 달에 두 번 채운다). 같은 결제가 두 번 와도 원장의 unique(ref) 가 한 번만 쌓는다.
 */

export const DODO_TOLERANCE_SEC = 300;

export const dodoBase = (env: Record<string, string | undefined> = process.env) =>
  env.DODO_ENV === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";

function keyBytes(secret: string): Buffer[] {
  const s = secret.trim();
  const b64 = s.startsWith("whsec_") ? s.slice(6) : s;
  // 표준은 base64 를 푼 바이트다. 접두사 없는 생 글자 비밀을 주는 대시보드도 있어 그 경우만 글자 그대로도 본다.
  const out = [Buffer.from(b64, "base64")];
  if (!s.startsWith("whsec_")) out.push(Buffer.from(s, "utf8"));
  return out.filter((b) => b.length > 0);
}

export function verifyDodoSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec: number = DODO_TOLERANCE_SEC,
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "웹훅 비밀이 설정되지 않음" };
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "서명 헤더 없음" };
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "서명 형식이 틀림" };
  if (Math.abs(nowSec - ts) > toleranceSec) return { ok: false, reason: "서명 시각이 너무 오래됨" };
  const signed = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const given = headers.signature.split(" ").map((p) => p.trim()).filter((p) => p.startsWith("v1,")).map((p) => Buffer.from(p.slice(3), "base64"));
  if (!given.length) return { ok: false, reason: "서명 형식이 틀림" };
  for (const key of keyBytes(secret)) {
    const want = createHmac("sha256", key).update(signed).digest();
    if (given.some((g) => g.length === want.length && timingSafeEqual(g, want))) return { ok: true };
  }
  return { ok: false, reason: "서명이 맞지 않음" };
}

/** 시험·자가점검용: 같은 규칙으로 서명을 만든다. */
export function signDodo(rawBody: string, id: string, timestampSec: number, secret: string): string {
  return "v1," + createHmac("sha256", keyBytes(secret)[0]).update(`${id}.${timestampSec}.${rawBody}`).digest("base64");
}

export type DodoEvent = {
  business_id?: string;
  type?: string;
  timestamp?: string;
  data?: {
    payload_type?: string;
    payment_id?: string;
    subscription_id?: string | null;
    status?: string | null;
    total_amount?: number;
    currency?: string;
    metadata?: Record<string, unknown> | null;
    product_cart?: { product_id?: string; quantity?: number }[] | null;
  };
};

const productEnv = (s: Sku) => s.priceEnv.replace(/^PADDLE_PRICE_/, "DODO_PRODUCT_");

/** Dodo 상품 id 가 설정된 요금제만 판다. */
export function dodoSellableSkus(env: Record<string, string | undefined> = process.env) {
  return SKUS.map((s) => ({ ...s, productId: env[productEnv(s)] ?? null })).filter((s) => !!s.productId) as (Sku & { productId: string })[];
}
const skuForProduct = (productId: string, env: Record<string, string | undefined>) => dodoSellableSkus(env).find((s) => s.productId === productId) ?? null;

/**
 * 성공한 결제 → 원장에 넣을 한 줄. `lookupProduct` 는 구독 결제에 상품 목록이 비어 왔을 때만 부른다(Dodo 에 구독을 묻는다).
 */
export async function planDodoGrant(
  event: DodoEvent,
  env: Record<string, string | undefined> = process.env,
  lookupProduct: (subscriptionId: string) => Promise<string | null> = (id) => subscriptionProduct(id, env),
): Promise<GrantPlan | { skip: string }> {
  if (event.type !== "payment.succeeded") return { skip: `다루지 않는 이벤트: ${event.type ?? "?"}` };
  const d = event.data ?? {};
  if (!d.payment_id) return { skip: "결제 번호 없음" };
  if (d.status && d.status !== "succeeded") return { skip: `성공이 아님: ${d.status}(${d.payment_id})` };
  const companyId = typeof d.metadata?.company_id === "string" ? d.metadata.company_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return { skip: `회사 표시 없음(${d.payment_id})` };

  let sku: Sku | null = null;
  let quantity = 1;
  const cart = d.product_cart ?? [];
  if (cart.length > 1) return { skip: `상품이 1개가 아님: ${cart.length}(${d.payment_id})` };
  if (cart.length === 1) {
    sku = skuForProduct(cart[0].product_id ?? "", env);
    quantity = Math.max(1, Math.floor(Number(cart[0].quantity ?? 1)));
  }
  if (!sku && typeof d.metadata?.sku === "string") sku = dodoSellableSkus(env).find((s) => s.id === d.metadata!.sku) ?? null;
  if (!sku && d.subscription_id) {
    const productId = await lookupProduct(d.subscription_id).catch(() => null);
    if (productId) sku = skuForProduct(productId, env);
  }
  if (!sku) return { skip: `모르는 상품(${d.payment_id})` };

  return {
    companyId, sku, quantity,
    deltaUsd: sku.usd * quantity,
    ref: d.payment_id,
    subscriptionId: d.subscription_id || null,
    amountPaid: typeof d.total_amount === "number" ? String(d.total_amount) : null,
    currency: d.currency ?? null,
    provider: "dodo",
  };
}

async function subscriptionProduct(subscriptionId: string, env: Record<string, string | undefined>): Promise<string | null> {
  if (!env.DODO_API_KEY) return null;
  const r = await fetch(`${dodoBase(env)}/subscriptions/${encodeURIComponent(subscriptionId)}`, { headers: { authorization: `Bearer ${env.DODO_API_KEY}` } });
  if (!r.ok) return null;
  const j = (await r.json()) as { product_id?: string };
  return j.product_id ?? null;
}

/** 결제창 링크를 만든다. 회사·요금제 표시는 **여기서 서버가** 넣는다 — 웹훅은 이 표시를 믿는다. */
export async function createDodoCheckout(
  o: { skuId: string; companyId: string; email: string | null; returnUrl: string },
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true; url: string; sessionId: string } | { ok: false; error: string }> {
  if (!env.DODO_API_KEY) return { ok: false, error: "결제 준비가 아직 안 됐어요." };
  const sku = dodoSellableSkus(env).find((s) => s.id === o.skuId);
  if (!sku) return { ok: false, error: "그 요금제는 지금 팔지 않아요." };
  const r = await fetch(`${dodoBase(env)}/checkouts`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.DODO_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      product_cart: [{ product_id: sku.productId, quantity: 1 }],
      ...(o.email ? { customer: { email: o.email } } : {}),
      metadata: { company_id: o.companyId, sku: sku.id },
      return_url: o.returnUrl,
    }),
  });
  const text = await r.text();
  if (!r.ok) {
    console.error("[billing] Dodo 결제창을 못 만들었다:", r.status, text.slice(0, 300));
    return { ok: false, error: "결제 창을 열지 못했어요. 잠시 뒤에 다시 해 주세요." };
  }
  const j = JSON.parse(text) as { checkout_url?: string | null; session_id?: string };
  if (!j.checkout_url) return { ok: false, error: "결제 창 주소를 못 받았어요." };
  return { ok: true, url: j.checkout_url, sessionId: j.session_id ?? "" };
}
