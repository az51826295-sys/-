/**
 * 4방향 키 맞추기(11-26): 그림 AI 가 4방향을 기본 그림보다 작게 그린다(10종 중 8종, 8~19% — 기사 54→47, 사제 74→60).
 * 걷기는 이제 기본 그림과 같은 키라 4방향만 작으면 게임에서 방향을 틀 때 캐릭터가 줄어든다.
 *   - 정면 칸 = 기본 그림 그대로(같은 캐릭터를 두 번 그릴 이유가 없다)
 *   - 옆·뒤 칸 = 기본 그림 키에 맞춰 nearest 로 키우고(같은 배율), 발을 바닥선에, 가로 가운데에
 * 대가: 정수배가 아니라 몇 줄·몇 칸이 두 번 찍힌다(1.1~1.24배). 돈 0.
 */
import sharp from "sharp";

export async function fitTurn(basePng: Buffer, turnSheet: Buffer, n = 4): Promise<{ frames: Buffer[]; cellW: number; cellH: number; facts: string[] }> {
  const b = await sharp(basePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = b.info.width, H = b.info.height;
  const box = (d: Buffer, w: number, x0: number, x1: number, h: number) => { let t = -1, bt = -1, l = 1e9, r = -1; for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) if (d[(y * w + x) * 4 + 3]) { if (t < 0) t = y; bt = y; l = Math.min(l, x); r = Math.max(r, x); } return { t, b: bt, l, r }; };
  const bb = box(b.data, W, 0, W, H), bh = bb.b - bb.t + 1;
  const s = await sharp(turnSheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cw = Math.floor(s.info.width / n), sh = s.info.height;
  const boxes = [...Array(n).keys()].map((f) => box(s.data, s.info.width, f * cw, (f + 1) * cw, sh));
  const th = Math.max(...boxes.map((x) => x.b - x.t + 1));
  const r = bh / th;
  const frames: Buffer[] = [Buffer.from(b.data)];
  for (let f = 1; f < n; f++) {
    const x = boxes[f]; const w0 = x.r - x.l + 1, h0 = x.b - x.t + 1;
    const nw = Math.round(w0 * r), nh = Math.round(h0 * r);
    const o = Buffer.alloc(W * H * 4);
    const left = Math.round((bb.l + bb.r) / 2 - nw / 2), top = bb.b - nh + 1;
    for (let y = 0; y < nh; y++) for (let xx = 0; xx < nw; xx++) {
      const sy = x.t + Math.min(h0 - 1, Math.floor(y / r)), sx = x.l + Math.min(w0 - 1, Math.floor(xx / r));
      const i = (sy * s.info.width + sx) * 4; if (!s.data[i + 3]) continue;
      const X = left + xx, Y = top + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      s.data.copy(o, (Y * W + X) * 4, i, i + 4);
    }
    frames.push(o);
  }
  return { frames, cellW: W, cellH: H, facts: [`4방향 키 ${th}칸 → 기본 ${bh}칸 (${r.toFixed(2)}배) · 정면 = 기본 그림`] };
}
