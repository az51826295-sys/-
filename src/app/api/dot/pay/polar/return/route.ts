import { NextResponse } from "next/server";
import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { claimCheckout, POLAR_COOKIE } from "@/lib/dot/polar";

/** Polar 결제창에서 돌아오는 자리(11-22). Polar 에 직접 물어 다 냈으면 하트를 주고 하트 가게로 보낸다. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const go = (q: string) => {
    const res = NextResponse.redirect(new URL(`/dot/pay?${q}`, url.origin), 303);
    return res;
  };
  const userId = await userIdFrom(request);
  if (!userId) return go("paid=login");
  const id = url.searchParams.get("checkout_id") ?? "";
  const r = await claimCheckout(createServiceClient(), userId, id);
  if (r.ok) {
    const res = go(`paid=${r.hearts}`);
    res.cookies.delete(POLAR_COOKIE);
    return res;
  }
  return go(`paid=${r.reason === "아직" ? "wait" : "fail"}`);
}
