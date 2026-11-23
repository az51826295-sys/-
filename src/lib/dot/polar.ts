import type { SupabaseClient } from "@supabase/supabase-js";
import { HEART_PACKS } from "@/lib/dot/money";
import { grantHearts } from "@/lib/dot/grant-hearts";
import { PIXEL_PACK, grantPixelPack } from "@/lib/pixel/credits";

/**
 * **웹 결제 — Polar** (11-22 사장님 "도도 말고" → Polar, "건전하자나 그냥해").
 *
 * 앱 안은 Play 결제(구글 정책), 앱 밖 웹은 이 길. 둘 다 `grantHearts` 한 자리로 모인다.
 *
 * 흐름: 하트 묶음 누름 → 서버가 Polar 결제창을 만든다(`metadata.user`·`metadata.pack`) →
 * 돈 내고 돌아오면 `/api/dot/pay/polar/return?checkout_id=…` 가 **Polar 에 직접 물어** `succeeded`
 * 이고 주인이 같을 때만 하트를 준다. 화면이 하는 말은 믿지 않는다.
 * 탭을 닫고 안 돌아온 사람은 하트 가게에 다시 오면 쿠키(`dot_polar_co`)로 같은 확인을 한 번 더 한다.
 *
 * 설정(Railway dot-web):
 *   POLAR_DOT_TOKEN     — Polar 조직 열쇠(checkouts:read·write). **비밀, 사장님 손으로 넣는다.**
 *   POLAR_DOT_PRODUCTS  — `hearts_10=<상품id>,hearts_30=<id>,hearts_60=<id>` (비밀 아님)
 * 둘 다 있어야 웹 결제가 열린다.
 */
const API = "https://api.polar.sh/v1";
export const POLAR_COOKIE = "dot_polar_co";

function 상품표(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of (process.env.POLAR_DOT_PRODUCTS ?? "").split(",")) {
    const [k, v] = kv.split("=").map((x) => x?.trim());
    if (k && v) out[k] = v;
  }
  return out;
}

export const polarOpen = () => !!(process.env.POLAR_DOT_TOKEN ?? "").trim() && HEART_PACKS.every((p) => 상품표()[p.key]);

async function polar(path: string, init?: RequestInit) {
  const res = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${(process.env.POLAR_DOT_TOKEN ?? "").trim()}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> };
}

export async function createHeartCheckout(a: { userId: string; pack: string; origin: string; ip?: string | null }) {
  const pack = HEART_PACKS.find((p) => p.key === a.pack);
  const product = 상품표()[a.pack];
  if (!pack || !product) return { ok: false as const, error: "그런 묶음이 없어요." };
  const r = await polar("/checkouts/", {
    method: "POST",
    body: JSON.stringify({
      products: [product],
      external_customer_id: a.userId,
      metadata: { user: a.userId, pack: pack.key },
      success_url: `${a.origin}/api/dot/pay/polar/return?checkout_id={CHECKOUT_ID}`,
      ...(a.ip ? { customer_ip_address: a.ip } : {}),
      locale: "ko",
    }),
  });
  const url = typeof r.body.url === "string" ? r.body.url : "";
  const id = typeof r.body.id === "string" ? r.body.id : "";
  if (!r.ok || !url || !id) return { ok: false as const, error: "결제창을 못 열었어요. 잠시 뒤 다시 눌러 주세요.", note: `${r.status} ${JSON.stringify(r.body.detail ?? r.body.error ?? "").slice(0, 200)}` };
  return { ok: true as const, url, id };
}

export type ClaimResult =
  | { ok: true; hearts: number; already: boolean }
  | { ok: false; reason: "아직" | "남의것" | "없음" | "못물어봄" | "못줌"; note?: string };

/** 결제창 하나를 확인하고, 다 냈으면 하트를 준다. 몇 번 불러도 한 번만 준다(번호표 = checkout id). */
export async function claimCheckout(db: SupabaseClient, userId: string, checkoutId: string): Promise<ClaimResult> {
  if (!/^[0-9a-f-]{36}$/i.test(checkoutId)) return { ok: false, reason: "없음" };
  const r = await polar(`/checkouts/${checkoutId}`);
  if (r.status === 404) return { ok: false, reason: "없음" };
  if (!r.ok) return { ok: false, reason: "못물어봄", note: String(r.status) };
  const meta = (r.body.metadata ?? {}) as Record<string, string>;
  if (meta.user !== userId) return { ok: false, reason: "남의것" };
  if (r.body.status !== "succeeded") return { ok: false, reason: "아직", note: String(r.body.status) };
  const pack = HEART_PACKS.find((p) => p.key === meta.pack);
  if (!pack) return { ok: false, reason: "없음", note: `pack ${meta.pack}` };
  const 줌 = await grantHearts(db, { userId, hearts: pack.hearts, sku: pack.key, source: "polar", ref: checkoutId });
  if (!줌.ok) return { ok: false, reason: "못줌", note: 줌.error };
  return { ok: true, hearts: pack.hearts, already: 줌.already };
}

/* ── 진짜 도트 변환 10장(11-24) — 같은 Polar 조직·같은 확인 방식, 주는 자리만 다르다(하트 지갑 말고 장수 장부). ── */

export const pixelPayOpen = () => !!(process.env.POLAR_DOT_TOKEN ?? "").trim() && !!상품표()[PIXEL_PACK.key];

export async function createPixelCheckout(a: { userId: string; origin: string; ip?: string | null; en: boolean }) {
  const product = 상품표()[PIXEL_PACK.key];
  if (!product) return { ok: false as const, error: a.en ? "Payments aren't open yet." : "결제가 아직 안 열렸어요." };
  const r = await polar("/checkouts/", {
    method: "POST",
    body: JSON.stringify({
      products: [product],
      external_customer_id: a.userId,
      metadata: { user: a.userId, pack: PIXEL_PACK.key },
      success_url: `${a.origin}/api/pixel/pay/return?checkout_id={CHECKOUT_ID}`,
      ...(a.ip ? { customer_ip_address: a.ip } : {}),
      locale: a.en ? "en" : "ko",
    }),
  });
  const url = typeof r.body.url === "string" ? r.body.url : "";
  const id = typeof r.body.id === "string" ? r.body.id : "";
  if (!r.ok || !url || !id) return { ok: false as const, error: a.en ? "Couldn't open checkout. Try again." : "결제창을 못 열었어요. 잠시 뒤 다시 눌러 주세요.", note: `${r.status} ${JSON.stringify(r.body.detail ?? r.body.error ?? "").slice(0, 200)}` };
  return { ok: true as const, url, id };
}

export async function claimPixelCheckout(db: SupabaseClient, userId: string, checkoutId: string):
  Promise<{ ok: true; already: boolean } | { ok: false; reason: "아직" | "남의것" | "없음" | "못물어봄" | "못줌"; note?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(checkoutId)) return { ok: false, reason: "없음" };
  const r = await polar(`/checkouts/${checkoutId}`);
  if (r.status === 404) return { ok: false, reason: "없음" };
  if (!r.ok) return { ok: false, reason: "못물어봄", note: String(r.status) };
  const meta = (r.body.metadata ?? {}) as Record<string, string>;
  if (meta.user !== userId) return { ok: false, reason: "남의것" };
  if (meta.pack !== PIXEL_PACK.key) return { ok: false, reason: "없음", note: `pack ${meta.pack}` };
  if (r.body.status !== "succeeded") return { ok: false, reason: "아직", note: String(r.body.status) };
  try { return { ok: true, ...(await grantPixelPack(db, userId, checkoutId)) }; }
  catch (e) { return { ok: false, reason: "못줌", note: (e as Error).message }; }
}
