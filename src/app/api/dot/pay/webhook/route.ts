import { createServiceClient } from "@/lib/supabase/service";
import { planDotGrant, 서명확인 } from "@/lib/dot/pay";
import { SKUS } from "@/lib/dot/money";
import type { DodoEvent } from "@/lib/billing/dodo";

/**
 * Dodo 가 "돈 들어왔다" 고 알려 오는 자리 (10-28).
 *
 * **서명이 맞아야만 본다.** 이 주소는 공개돼 있고, 서명 검사가 없으면 아무나 POST 해서
 * 구독을 받아 간다 — `/api/dot/buy` 가 10-24 에 바로 그 상태였다(스위치 하나가 지갑을 열었다).
 *
 * 2xx 로 답해야 Dodo 가 다시 안 보낸다. 그런데 **우리가 못 준 것까지 2xx 로 삼키면**
 * 돈은 들어왔는데 구독이 안 켜진 채로 영영 끝난다. 그래서 가른다 —
 *   · 서명 틀림 → 401. 다시 보내 봐야 소용없다.
 *   · 우리가 안 다루는 이벤트 → 200 (건너뜀). 다시 받을 이유가 없다.
 *   · DB 가 거부 → **500**. Dodo 가 다시 보내 준다. 여기를 200 으로 두면 돈만 받는다.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const 검 = 서명확인(raw, {
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
  });
  if (!검.ok) {
    console.error("[dot/pay] 서명 거부:", 검.reason);
    return Response.json({ error: 검.reason }, { status: 401 });
  }

  let event: DodoEvent;
  try { event = JSON.parse(raw) as DodoEvent; } catch { return Response.json({ error: "본문이 JSON 이 아님" }, { status: 400 }); }

  const 계획 = planDotGrant(event);
  if (!계획.ok) return Response.json({ ok: true, 건너뜀: 계획.건너뜀 });

  const db = createServiceClient();
  /* **같은 결제는 한 번만.** 원장의 ref 가 막아 주지만, 먼저 보면 쓸데없는 쓰기가 안 생기고
     무엇보다 **두 번째 호출이 오류로 보이지 않는다**(재전송은 정상이다). */
  const { data: dup } = await db.from("dot_purchases").select("id").eq("ref", 계획.ref).maybeSingle();
  if (dup) return Response.json({ ok: true, 이미: 계획.ref });

  const { error } = await db.rpc("dot_grant", {
    p_user: 계획.userId,
    p_sku: "menhera_sub",
    p_credits: SKUS.menhera_sub.credits,
    p_menhera_days: 계획.days,
    p_source: "dodo",
    p_ref: 계획.ref,
  });
  if (error) {
    /* 23505 = 이미 있음. 경주에서 진 것이고 **성공이다**(09-27 에 같은 함정을 배웠다). */
    if ((error as { code?: string }).code === "23505") return Response.json({ ok: true, 이미: 계획.ref });
    console.error("[dot/pay] 못 줬다:", error.message, 계획.ref);
    return Response.json({ error: error.message }, { status: 500 });
  }
  console.log("[dot/pay] 멘헤라 켬", { ref: 계획.ref, days: 계획.days, 만료: 계획.만료 });
  return Response.json({ ok: true, days: 계획.days });
}
