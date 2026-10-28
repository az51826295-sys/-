import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST } from "@/lib/dot/bond";
import { SKUS, balanceFor } from "@/lib/dot/money";
import { 구독확인, 구독승인, 확인할수있나 } from "@/lib/dot/playVerify";

/**
 * 안드로이드 앱의 패키지 이름. 구글에 구독을 물을 때 이 이름으로 묻는다.
 * `Desktop/dot-android/app/build.gradle` 의 `applicationId` 와 **같아야 한다** —
 * 다르면 구글이 404 를 주고 우리는 그걸 "안 샀다" 로 읽는다.
 */
const 패키지이름 = process.env.DOT_PACKAGE ?? "azcom.example.myapp";

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

  /**
   * **검증이 없으면 주지 않는다** (10-24).
   *
   * 여기는 `BILLING_OPEN=1` 만 켜면 **아무나 이 주소로 POST 해서 크레딧을 받아 가는** 자리였다.
   * 구매 토큰 확인이 TODO 로 남아 있었기 때문이다 — 스위치 하나가 지갑을 여는 구조는 안 된다.
   * 그래서 **확인할 열쇠가 없으면 막는다.** 손으로 주는 길(`engine/tools/dot_grant.mts`)은 그대로 있다.
   */
  if (!확인할수있나()) {
    return Response.json({ error: "결제 확인이 아직 준비되지 않았어요. 조금만 기다려 주세요." }, { status: 503 });
  }
  if (!body.purchaseToken) {
    return Response.json({ error: "결제 정보가 없어요." }, { status: 400 });
  }

  const db = createServiceClient();

  /* **같은 토큰은 한 번만.** 먼저 본다 — 구글에 묻기 전에 걸러야 쓸데없는 왕복이 안 생긴다. */
  const { data: dup } = await db.from("dot_purchases").select("id").eq("ref", body.purchaseToken).maybeSingle();
  if (dup) return Response.json({ error: "이미 처리된 결제예요." }, { status: 409 });

  /**
   * **구글에 진짜 샀는지 묻는다** (10-25). 여기가 없으면 토큰을 아무거나 지어내도 통과한다.
   * `안삼`(가짜 토큰)과 `거절`·`못물어봄`(우리 쪽 문제)을 **가른다** — 사람에게 할 말이 다르고,
   * 뒤의 둘은 우리가 고칠 거리라 장부에 남아야 한다.
   */
  const 확인 = await 구독확인(패키지이름, body.sku!, body.purchaseToken);
  if (!확인.ok) {
    if (확인.까닭 === "안삼") return Response.json({ error: "결제를 확인하지 못했어요." }, { status: 400 });
    console.error("[dot/buy] 구독 확인 실패", { 까닭: 확인.까닭, 글: 확인.글, sku: body.sku });
    return Response.json({ error: "결제 확인 중에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요." }, { status: 503 });
  }

  /**
   * **구글이 말한 만료일을 그대로 쓴다.** 우리가 30일을 더하면 안 된다 —
   * 자동 갱신·환불·결제 보류로 날짜가 바뀌는데 그걸 우리가 알 길이 없다.
   */
  const 남은날 = Math.max(1, Math.ceil((Date.parse(확인.만료) - Date.now()) / 864e5));
  const { error } = await db.rpc("dot_grant", {
    p_user: userId, p_sku: body.sku, p_credits: sku.credits,
    p_menhera_days: 남은날, p_source: "play", p_ref: body.purchaseToken,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  /**
   * **승인한다.** 사흘 안에 승인 안 하면 구글이 돈을 돌려주고 구독을 거둬 간다 —
   * 그러면 우리는 돈을 못 받고 혜택만 30일 준 셈이 된다. 주고 나서 바로 한다.
   * 실패해도 준 것은 안 거둔다(사람 탓이 아니다). 장부에만 남긴다 — 구글이 사흘 동안
   * 다시 받아 주므로 그 사이에 손으로 다시 부를 수 있다.
   */
  if (!확인.승인됨) {
    const ack = await 구독승인(패키지이름, body.sku!, body.purchaseToken);
    if (!ack.ok) console.error("[dot/buy] 승인 실패 — 사흘 안에 다시 해야 한다", { ref: body.purchaseToken, 글: ack.글 });
  }
  return Response.json({ ok: true, 만료: 확인.만료, balance: await balanceFor(db, userId, todayKST()) });
}
