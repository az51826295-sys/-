import { cookies } from "next/headers";
import { userIdFrom } from "@/lib/dot/auth";
import { createHeartCheckout, polarOpen, POLAR_COOKIE } from "@/lib/dot/polar";

/** 웹에서 하트 묶음을 누르면 Polar 결제창 주소를 돌려준다(11-22). 하트는 여기서 안 준다 — 돌아올 때 확인하고 준다. */
export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "대화방에 한 번 들어갔다 와 주세요." }, { status: 401 });
  if (!polarOpen()) return Response.json({ error: "결제는 곧 열려요. 지금은 출석과 광고로 받아 주세요." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { pack?: string };
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const r = await createHeartCheckout({ userId, pack: body.pack ?? "", origin: new URL(request.url).origin, ip });
  if (!r.ok) return Response.json({ error: r.error, note: "note" in r ? r.note : undefined }, { status: 502 });
  /* 탭을 닫고 안 돌아와도 하트 가게에 다시 오면 확인할 수 있게 적어 둔다. */
  (await cookies()).set(POLAR_COOKIE, r.id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 3 });
  return Response.json({ ok: true, url: r.url });
}
