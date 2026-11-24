import { gameImages } from "@/lib/pixel/serve";
import { profileOf } from "@/lib/pixel/style";

/**
 * 게임 그림 분석(무료 · 기계만, 11-25 "게임 추가"). 올린 게임 그림에서 팔레트와 캐릭터 키를 뽑아 보여 준다.
 * 저장하지 않는다 — 게임 그림은 손님 브라우저에 남고, 만들 때마다 같이 보낸다.
 */
export const maxDuration = 60;

const hex = (c: number[]) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const g = await gameImages(form);
  if ("error" in g) return Response.json({ error: g.error }, { status: 400 });
  if (!g.bufs.length) return Response.json({ error: "게임 그림을 1장 이상 올려 주세요." }, { status: 400 });
  try {
    const p = await profileOf(g.bufs);
    return Response.json({ palette: p.palette.map(hex), height: p.height, heights: p.heights, figures: p.figures });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}
