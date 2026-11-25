import { cookies } from "next/headers";
import { clientAs } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { pixelBalance } from "@/lib/pixel/credits";
import { claimPixelCheckout, pixelPayOpen } from "@/lib/dot/polar";

/** 남은 장수. 결제창을 열고 안 돌아온 사람은 여기서 한 번 더 Polar 에 묻는다(몇 번 물어도 한 번만 준다). */
export async function GET(request: Request) {
  const { user } = await clientAs(request);
  const userId = user?.id ?? null;
  if (!userId) return Response.json({ shots: 0, signedIn: false, linked: false, payOpen: pixelPayOpen() });
  const linked = !user!.is_anonymous; // 11-25: AI 그림·결제는 연결한 계정만
  const db = createServiceClient();
  const jar = await cookies();
  const 열어둔 = jar.get("pixel_polar_co")?.value;
  if (열어둔 && pixelPayOpen()) {
    const r = await claimPixelCheckout(db, userId, 열어둔).catch(() => null);
    if (r?.ok) jar.delete("pixel_polar_co");
  }
  return Response.json({ shots: await pixelBalance(db, userId), signedIn: true, linked, payOpen: pixelPayOpen() });
}
