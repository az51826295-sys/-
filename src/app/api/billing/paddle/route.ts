import { verifyPaddleSignature, planGrant, type PaddleEvent } from "@/lib/billing/paddle";
import { recordGrant } from "@/lib/billing/ledger";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Paddle 웹훅 (100회차 09-13). 결제 완료 → 서명 확인 → 우리 상품표로 양을 정해 → 원장에 한 줄.
 *
 * 로그인 없이 들어오는 문이라 **서명이 유일한 자물쇠**다. 서명이 틀리면 401(Paddle 이 다시 보낸다).
 * 서명은 맞는데 우리가 줄 게 없으면(모르는 가격·회사 표시 없음) 200 + 기록 — 계속 다시 받아도 달라질 게 없다.
 * 원장에 못 넣었으면 500 — Paddle 이 다시 보내게 둔다. 같은 거래가 두 번 와도 unique(ref) 가 한 번만 쌓는다.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const v = verifyPaddleSignature(raw, request.headers.get("paddle-signature"), process.env.PADDLE_WEBHOOK_SECRET ?? "");
  if (!v.ok) {
    console.warn("[billing] 웹훅 서명 거부:", v.reason);
    return Response.json({ error: v.reason }, { status: 401 });
  }
  let event: PaddleEvent;
  try { event = JSON.parse(raw) as PaddleEvent; } catch { return Response.json({ error: "JSON 이 아님" }, { status: 400 }); }

  const plan = planGrant(event);
  if ("skip" in plan) {
    if (event.event_type === "transaction.completed") console.error("[billing] 결제는 됐는데 줄 게 없음 — 사람이 볼 것:", plan.skip);
    return Response.json({ ok: true, skipped: plan.skip });
  }

  const result = await recordGrant(createServiceClient(), plan);
  if (result === "error") return Response.json({ error: "원장 기록 실패" }, { status: 500 });
  if (result === "no-company") console.error("[billing] 결제는 됐는데 회사가 없음 — 사람이 볼 것:", plan.ref, plan.companyId);
  return Response.json({ ok: true, result });
}
