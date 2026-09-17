import { verifyDodoSignature, planDodoGrant, type DodoEvent } from "@/lib/billing/dodo";
import { recordGrant } from "@/lib/billing/ledger";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Dodo Payments 웹훅 (167회차 09-18). 결제 성공 → 서명 확인 → 우리 상품표로 양을 정해 → 원장에 한 줄.
 * Paddle 문(`../paddle/route.ts`)과 같은 규칙이다: 서명이 유일한 자물쇠(틀리면 401), 서명은 맞는데 줄 게 없으면 200 + 기록,
 * 원장에 못 넣었으면 500(Dodo 가 다시 보낸다). 같은 결제가 두 번 와도 unique(ref) 가 한 번만 쌓는다.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const v = verifyDodoSignature(raw, {
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
  }, process.env.DODO_WEBHOOK_SECRET ?? "");
  if (!v.ok) {
    console.warn("[billing] Dodo 웹훅 서명 거부:", v.reason);
    return Response.json({ error: v.reason }, { status: 401 });
  }
  let event: DodoEvent;
  try { event = JSON.parse(raw) as DodoEvent; } catch { return Response.json({ error: "JSON 이 아님" }, { status: 400 }); }

  const plan = await planDodoGrant(event);
  if ("skip" in plan) {
    if (event.type === "payment.succeeded") console.error("[billing] 결제는 됐는데 줄 게 없음 — 사람이 볼 것:", plan.skip);
    return Response.json({ ok: true, skipped: plan.skip });
  }

  const result = await recordGrant(createServiceClient(), plan);
  if (result === "error") return Response.json({ error: "원장 기록 실패" }, { status: 500 });
  if (result === "no-company") console.error("[billing] 결제는 됐는데 회사가 없음 — 사람이 볼 것:", plan.ref, plan.companyId);
  return Response.json({ ok: true, result });
}
