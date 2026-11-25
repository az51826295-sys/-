import { NextResponse } from "next/server";
import { userIdFrom } from "@/lib/dot/auth";
import { publicOrigin } from "@/lib/http/origin";
import { createServiceClient } from "@/lib/supabase/service";
import { claimPixelCheckout } from "@/lib/dot/polar";

/** Polar 에서 돌아오는 자리. Polar 에 직접 물어 다 냈고 주인이 같을 때만 10장을 넣는다. */
export async function GET(request: Request) {
  const go = (q: string) => NextResponse.redirect(new URL(`/pixel?${q}`, publicOrigin(request)), 303);
  const userId = await userIdFrom(request);
  if (!userId) return go("paid=login");
  const id = new URL(request.url).searchParams.get("checkout_id") ?? "";
  const r = await claimPixelCheckout(createServiceClient(), userId, id);
  if (r.ok) {
    const res = go("paid=100");
    res.cookies.delete("pixel_polar_co");
    return res;
  }
  return go(`paid=${r.reason === "아직" ? "wait" : "fail"}`);
}
