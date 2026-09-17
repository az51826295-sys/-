import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { billingOpen, billingProvider, canCheckout, sellableSkus, toCredits } from "@/lib/billing/plans";
import { dodoSellableSkus } from "@/lib/billing/dodo";
import { creditBalance } from "@/lib/billing/ledger";

/**
 * 충전 화면이 읽는 것 (100회차 09-13): 잔고, 파는 상품, Paddle 켜는 값, 그리고 **앱 안인지**.
 *
 * 구글 플레이 정책: 앱 안에서 디지털 상품을 팔면 구글 결제를 써야 한다. 그래서 안드로이드 앱(TWA)으로 들어온
 * 사람에게는 상품을 아예 안 준다(`inApp`). 앱인지는 proxy 가 남긴 쿠키 `rk_app=android` 로 안다.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const inApp = (await cookies()).get("rk_app")?.value === "android";

  if (!billingOpen()) return Response.json({ open: false, inApp });

  const { data: co } = await supabase.from("companies").select("id, billing_mode, credits_started_at").eq("owner_id", user.id).maybeSingle();
  const prepaid = co?.billing_mode === "prepaid";
  const provider = billingProvider();
  const balance = co && prepaid ? await creditBalance(supabase, co.id as string, (co.credits_started_at as string | null) ?? null) : null;

  return Response.json({
    open: true,
    inApp,
    prepaid,
    companyId: co?.id ?? null,
    email: user.email ?? null,
    balance: balance ? { credits: balance.credits, readable: balance.readable } : null,
    // 167회차: 대행사가 둘이다. Dodo 는 결제창을 서버가 만들어서(`/api/billing/dodo/checkout`) 화면에 줄 값이 없다 — 상품 id 도 안 내보낸다.
    provider,
    // 이 사람에게 구독 단추를 보여도 되는가. 시험 모드에서는 명단에 있는 사람만 참이다.
    canCheckout: !inApp && canCheckout(user.email),
    skus: inApp || !canCheckout(user.email) ? [] : provider === "dodo"
      ? dodoSellableSkus().map((s) => ({ id: s.id, name: s.name, priceLabel: s.priceLabel, credits: toCredits(s.usd), note: s.note ?? null, priceId: "" }))
      : sellableSkus().map((s) => ({ id: s.id, name: s.name, priceLabel: s.priceLabel, credits: toCredits(s.usd), note: s.note ?? null, priceId: s.priceId })),
    paddle: inApp || provider !== "paddle" ? null : { env: process.env.PADDLE_ENV === "production" ? "production" : "sandbox", clientToken: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? null },
    testMode: provider === "dodo" ? process.env.DODO_ENV !== "live" : process.env.PADDLE_ENV !== "production",
  });
}
