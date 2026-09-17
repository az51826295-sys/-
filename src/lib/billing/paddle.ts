import { createHmac, timingSafeEqual } from "node:crypto";
import { skuForPrice, type Sku } from "./plans";

/**
 * Paddle 웹훅 (100회차 09-13).
 *
 * 서명: 헤더 `Paddle-Signature: ts=<unix>;h1=<hex>` — h1 = HMAC-SHA256(웹훅 비밀, `${ts}:${원문}`).
 * **원문을 그대로** 써야 한다(JSON 을 다시 풀었다 묶으면 공백이 바뀌어 서명이 깨진다).
 * 시각 허용: Paddle SDK 기본은 5초. 여기서는 5분 — 같은 거래를 두 번 받아도 원장의 unique(ref) 가 한 번만 쌓으니
 * 재전송 공격이 돈을 두 번 만들 수 없고, 서버 시계가 조금 틀려서 진짜 결제를 버리는 쪽이 더 나쁘다.
 */
export const SIGNATURE_TOLERANCE_SEC = 300;

export function verifyPaddleSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec: number = SIGNATURE_TOLERANCE_SEC,
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "웹훅 비밀이 설정되지 않음" };
  if (!header) return { ok: false, reason: "서명 헤더 없음" };
  const parts = Object.fromEntries(header.split(";").map((p) => { const i = p.indexOf("="); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  const ts = Number(parts.ts);
  const h1 = parts.h1 ?? "";
  if (!Number.isFinite(ts) || !/^[0-9a-f]{64}$/i.test(h1)) return { ok: false, reason: "서명 형식이 틀림" };
  if (Math.abs(nowSec - ts) > toleranceSec) return { ok: false, reason: "서명 시각이 너무 오래됨" };
  const want = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest();
  const got = Buffer.from(h1, "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: "서명이 맞지 않음" };
  return { ok: true };
}

export type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: {
    id?: string;
    status?: string;
    /** 구독에서 나온 결제(첫 결제·매달 갱신)면 구독 id. 한 번 사는 결제면 null. */
    subscription_id?: string | null;
    origin?: string;
    custom_data?: Record<string, unknown> | null;
    currency_code?: string;
    items?: { price?: { id?: string }; quantity?: number }[];
    details?: { totals?: { total?: string } };
  };
};

export type GrantPlan = {
  companyId: string;
  sku: Sku;
  quantity: number;
  deltaUsd: number;
  ref: string;
  /** 구독 결제면 구독 id — 원장이 새 달(기간)을 연다. */
  subscriptionId: string | null;
  amountPaid: string | null;
  currency: string | null;
  /** 어느 대행사로 들어온 돈인가(167회차). 안 적으면 paddle — 원장에 그대로 적힌다. */
  provider?: "paddle" | "dodo";
};

/**
 * 완료된 거래 → 원장에 넣을 한 줄. 돈의 양은 **우리 상품표**에서 정한다 — 화면이 보낸 값이나 금액을 믿지 않는다.
 * 넣을 게 아니면 이유를 돌려준다(웹훅은 그래도 200 을 준다 — 안 그러면 Paddle 이 며칠 동안 다시 보낸다).
 */
export function planGrant(event: PaddleEvent, env: Record<string, string | undefined> = process.env): GrantPlan | { skip: string } {
  if (event.event_type !== "transaction.completed") return { skip: `다루지 않는 이벤트: ${event.event_type ?? "?"}` };
  const d = event.data ?? {};
  if (!d.id) return { skip: "거래 번호 없음" };
  const companyId = typeof d.custom_data?.company_id === "string" ? d.custom_data.company_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return { skip: `회사 표시 없음(${d.id})` };
  const items = d.items ?? [];
  if (items.length !== 1) return { skip: `상품이 1개가 아님: ${items.length}(${d.id})` };
  const priceId = items[0].price?.id ?? "";
  const sku = skuForPrice(priceId, env);
  if (!sku) return { skip: `모르는 가격 ${priceId}(${d.id})` };
  const quantity = Math.max(1, Math.floor(Number(items[0].quantity ?? 1)));
  return {
    companyId,
    sku,
    quantity,
    deltaUsd: sku.usd * quantity,
    ref: d.id,
    subscriptionId: typeof d.subscription_id === "string" && d.subscription_id ? d.subscription_id : null,
    amountPaid: d.details?.totals?.total ?? null,
    currency: d.currency_code ?? null,
  };
}
