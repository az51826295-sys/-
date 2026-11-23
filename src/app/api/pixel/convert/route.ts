import { convert, dataUrl, previewOf, readUpload } from "@/lib/pixel/serve";

/** 미리보기(무료). 장수를 안 쓴다. 결과는 줄무늬를 덮어서 돌려준다. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const u = await readUpload(request);
  if ("error" in u) return Response.json({ error: u.error }, { status: u.status });
  try {
    const r = await convert(u.buf, u.period, u.colors);
    return Response.json({ ok: true, period: r.period[0], logical: r.logical, colors: r.colors, preview: dataUrl(await previewOf(r)) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}
