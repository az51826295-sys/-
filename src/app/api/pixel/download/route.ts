import sharp from "sharp";
import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PIXEL_COST, pixelBalance, spendPixelShot } from "@/lib/pixel/credits";
import { convert, dataUrl, readUpload } from "@/lib/pixel/serve";

/** 받기 — 변환이 **성공한 뒤에** 한 장을 쓴다(실패한 변환에 장수를 받지 않는다). */
export const maxDuration = 60;

export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "새로고침 후 다시 눌러 주세요." }, { status: 401 });
  const db = createServiceClient();
  if ((await pixelBalance(db, userId)) < PIXEL_COST.convert) return Response.json({ error: "토큰이 모자라요.", need: true }, { status: 402 });
  const u = await readUpload(request);
  if ("error" in u) return Response.json({ error: u.error }, { status: u.status });
  let r;
  try {
    r = await convert(u.buf, u.period, u.colors);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
  const ok = await spendPixelShot(db, userId, `${r.logical.join("x")} p${r.period[0]} c${r.colors} ${new Date().toISOString()}`, PIXEL_COST.convert);
  if (!ok) return Response.json({ error: "토큰이 모자라요.", need: true }, { status: 402 });
  const [W, H] = r.logical;
  const x8 = await sharp(r.small).resize(W * 8, H * 8, { kernel: "nearest" }).png().toBuffer();
  return Response.json({ ok: true, logical: r.logical, small: dataUrl(r.small), x8: dataUrl(x8), left: await pixelBalance(db, userId) });
}
