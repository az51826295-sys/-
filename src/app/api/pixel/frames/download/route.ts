import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PIXEL_COST, pixelBalance, spendPixelShot } from "@/lib/pixel/credits";
import { convert, dataUrl, readUpload } from "@/lib/pixel/serve";
import { cutFrames, findFrames, gifOf, sheetOf } from "@/lib/pixel/frames";

/** 움직임 받기 — 한 장을 쓴다(변환·자르기가 **성공한 뒤에**). 게임용 1배 프레임 시트 PNG + 움직이는 GIF. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "새로고침 후 다시 눌러 주세요." }, { status: 401 });
  const db = createServiceClient();
  if ((await pixelBalance(db, userId)) < PIXEL_COST.split) return Response.json({ error: "토큰이 모자라요.", need: true }, { status: 402 });
  const u = await readUpload(request);
  if ("error" in u) return Response.json({ error: u.error }, { status: u.status });
  let out;
  try {
    const r = await convert(u.buf, u.period, u.colors);
    const set = await findFrames(r.small, { cols: u.cols, rows: u.rows });
    if (set.frames.length < 2) return Response.json({ error: "프레임이 하나뿐이에요." }, { status: 422 });
    const cuts = await cutFrames(r.small, set, { lockBottom: u.lock });
    const scale = Math.max(1, Math.min(8, Math.floor(512 / Math.max(set.cellW, set.cellH))));
    out = { sheet: await sheetOf(cuts, set), gif: await gifOf(cuts, set, { scale, ms: u.ms }), count: set.frames.length, cell: [set.cellW, set.cellH] };
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
  const ok = await spendPixelShot(db, userId, `frames ${out.count}x ${out.cell.join("x")} ${new Date().toISOString()}`, PIXEL_COST.split);
  if (!ok) return Response.json({ error: "토큰이 모자라요.", need: true }, { status: 402 });
  return Response.json({ ok: true, count: out.count, cell: out.cell, sheet: dataUrl(out.sheet), gif: "data:image/gif;base64," + out.gif.toString("base64"), left: await pixelBalance(db, userId) });
}
