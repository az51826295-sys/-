import { cookies } from "next/headers";
import { clientAs } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { grantPixelFree, pixelBalance } from "@/lib/pixel/credits";
import { claimPixelCheckout, pixelPayOpen } from "@/lib/dot/polar";

/** 남은 장수. 결제창을 열고 안 돌아온 사람은 여기서 한 번 더 Polar 에 묻는다(몇 번 물어도 한 번만 준다). */
export async function GET(request: Request) {
  const { user } = await clientAs(request);
  const userId = user?.id ?? null;
  if (!userId) return Response.json({ shots: 0, signedIn: false, linked: false, payOpen: pixelPayOpen(), build: (process.env.RAILWAY_GIT_COMMIT_SHA ?? "").slice(0, 7) }); // 11-25: 사이트가 어느 커밋으로 도는지(Railway 가 GitHub 배포에 넣어 주는 값)
  const linked = !user!.is_anonymous; // 11-25: AI 그림·결제는 연결한 계정만
  const db = createServiceClient();
  const jar = await cookies();
  const 열어둔 = jar.get("pixel_polar_co")?.value;
  if (열어둔 && pixelPayOpen()) {
    const r = await claimPixelCheckout(db, userId, 열어둔).catch(() => null);
    if (r?.ok) jar.delete("pixel_polar_co");
  }
  // 11-26 체험 1번: 연결한 계정이 처음 들어오면 만들기 1번 몫을 넣는다(사람마다 한 번)
  if (linked) await grantPixelFree(db, userId).catch((e) => console.log(`[pixel/me] free grant fail ${String(e).slice(0, 120)}`));
  return Response.json({ shots: await pixelBalance(db, userId), signedIn: true, linked, payOpen: pixelPayOpen(), build: (process.env.RAILWAY_GIT_COMMIT_SHA ?? "").slice(0, 7) });
}
