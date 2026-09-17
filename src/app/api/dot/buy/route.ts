import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST } from "@/lib/dot/bond";
import { SKUS, balanceFor } from "@/lib/dot/money";

/**
 * 충전 — 대화 묶음·멘헤라 30일 (09-11 사장님 "나머진 충전, 멘헤라 모드도 충전").
 *
 * 지금은 결제가 없다. `BILLING_OPEN=1` 이 아니면 "곧 열려요". Play Billing 이 붙는 날 여기서 **구매 토큰을 구글에 확인**하고
 * `dot_grant` 를 부른다(원장 `dot_purchases` 에 토큰을 남겨 두 번 주지 않는다). 그 전엔 `engine/tools/dot_grant.mts` 로 손으로 준다.
 */
export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { sku?: string; purchaseToken?: string };
  const sku = SKUS[body.sku ?? ""];
  if (!sku) return Response.json({ error: "그런 상품은 없어요." }, { status: 400 });
  if (process.env.BILLING_OPEN !== "1") return Response.json({ error: "결제는 곧 열려요. 조금만 기다려 주세요." }, { status: 503 });

  // TODO(스토어): body.purchaseToken 을 Google Play Developer API 로 확인. 같은 토큰이 원장에 있으면 다시 주지 않는다.
  const db = createServiceClient();
  if (body.purchaseToken) {
    const { data: dup } = await db.from("dot_purchases").select("id").eq("ref", body.purchaseToken).maybeSingle();
    if (dup) return Response.json({ error: "이미 처리된 결제예요." }, { status: 409 });
  }
  const { error } = await db.rpc("dot_grant", { p_user: userId, p_sku: body.sku, p_credits: sku.credits, p_menhera_days: sku.menheraDays, p_source: "play", p_ref: body.purchaseToken ?? null });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, balance: await balanceFor(db, userId, todayKST()) });
}
