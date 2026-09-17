import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { billingOpen, billingProvider, canCheckout } from "@/lib/billing/plans";
import { createDodoCheckout } from "@/lib/billing/dodo";
import { publicOrigin } from "@/lib/http/origin";

/**
 * 결제창 링크 만들기 (167회차 09-18). 로그인한 회사 주인만. 회사 id 는 **세션에서** 읽는다 — 화면이 보낸 값을 안 쓴다.
 * 안드로이드 앱 안에서는 안 연다(구글 플레이 결제 정책).
 */
export async function POST(request: Request) {
  if (!billingOpen() || billingProvider() !== "dodo") return Response.json({ error: "지금은 결제를 받지 않아요." }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  // 시험 모드에서는 명단에 있는 사람만(plans.ts `canCheckout`) — 시험 카드는 공개돼 있다.
  if (!canCheckout(user.email)) return Response.json({ error: "지금은 결제를 받지 않아요." }, { status: 403 });
  if ((await cookies()).get("rk_app")?.value === "android") return Response.json({ error: "앱 안에서는 구독할 수 없어요." }, { status: 403 });
  const { data: co } = await supabase.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
  if (!co) return Response.json({ error: "회사가 없어요." }, { status: 404 });
  let body: { sku?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "JSON 이 아님" }, { status: 400 }); }
  const origin = publicOrigin(request);   // request.url 은 프록시 뒤에서 localhost:8080 이다(97회차)
  const made = await createDodoCheckout({ skuId: String(body.sku ?? ""), companyId: co.id as string, email: user.email ?? null, returnUrl: `${origin}/ask?paid=1` });
  if (!made.ok) return Response.json({ error: made.error }, { status: 502 });
  return Response.json({ url: made.url });
}
