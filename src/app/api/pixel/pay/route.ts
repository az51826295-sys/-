import { cookies } from "next/headers";
import { userIdFrom } from "@/lib/dot/auth";
import { publicOrigin } from "@/lib/http/origin";
import { createPixelCheckout, pixelPayOpen } from "@/lib/dot/polar";
import { langFromCookie } from "@/lib/dot/langServer";

/** 10장 4,900원 결제창 주소. 장수는 여기서 안 준다 — 돌아올 때 Polar 에 물어보고 준다. */
export async function POST(request: Request) {
  const en = (await langFromCookie()) === "en";
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: en ? "Refresh the page and try again." : "새로고침 후 다시 눌러 주세요." }, { status: 401 });
  if (!pixelPayOpen()) return Response.json({ error: en ? "Payments are not open yet." : "결제가 아직 안 열렸어요." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const r = await createPixelCheckout({ userId, origin: publicOrigin(request), ip, en });
  if (!r.ok) return Response.json({ error: r.error, note: "note" in r ? r.note : undefined }, { status: 502 });
  (await cookies()).set("pixel_polar_co", r.id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 3 });
  return Response.json({ ok: true, url: r.url });
}
