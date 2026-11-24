import { convert, readUpload } from "@/lib/pixel/serve";
import { cutFrames, findFrames, gifOf } from "@/lib/pixel/frames";

/** 움직임 만들기 — 미리보기(무료). 프레임을 찾아 줄무늬 덮은 움직이는 GIF 로 돌려준다. 장수를 안 쓴다. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const u = await readUpload(request);
  if ("error" in u) return Response.json({ error: u.error }, { status: u.status });
  try {
    const r = await convert(u.buf, u.period, u.colors);
    const set = await findFrames(r.small, { cols: u.cols, rows: u.rows });
    if (set.frames.length < 2) return Response.json({ error: "프레임이 하나뿐이에요 — 표정·동작이 여러 개 든 시트를 올려 주세요.", count: set.frames.length }, { status: 422 });
    const cuts = await cutFrames(r.small, set, { lockBottom: u.lock });
    const scale = Math.max(1, Math.floor(360 / Math.max(set.cellW, set.cellH)));
    const gif = await gifOf(cuts, set, { scale, ms: u.ms, stripes: true });
    return Response.json({ ok: true, count: set.frames.length, cell: [set.cellW, set.cellH], how: set.how, gif: "data:image/gif;base64," + gif.toString("base64"), period: r.period[0] });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}

