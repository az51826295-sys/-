import sharp from "sharp";

/**
 * 한 장에 여러 각도가 그려진 **회전 시트를 칸으로 자른다.**
 *
 * 09-09: gpt-image-2 는 "은색 판금 투구" 같은 주문에 앞·옆·뒤를 **한 장에** 그린다.
 * 여섯 판을 문구로 말려 봤지만 안 됐다(전부 회전 시트 + 어두운 배경).
 * 사장님 결정: **싸우지 말고 쓴다.** 우리가 원하던 세 각도가 이미 거기 있다.
 *
 * 덤으로 배경 문제도 같이 끝난다 — 칸을 잘라 **흰 바탕에 얹기** 때문이다.
 * (Meshy 는 그림에서 형태를 떼어 내므로 어두운 배경·후광이 경계를 흐리고 빛을 텍스처에 굽는다.)
 *
 * 방법은 결정적이다: 밝은 픽셀을 물체로 보고 **세로/가로로 투영**해서 빈 띠로 칸을 가른다.
 * 1×3 도 2×2 도 같은 방법으로 갈린다.
 */
export type Panel = { dataUrl: string; x: number; y: number; w: number; h: number };

type Band = { start: number; end: number };

/** 값이 임계 위인 구간을 띠로 묶는다. 너무 얇은 띠(잡티)는 버린다. */
function bands(hits: boolean[], minLen: number): Band[] {
  const out: Band[] = [];
  let s = -1;
  for (let i = 0; i < hits.length; i++) {
    if (hits[i] && s < 0) s = i;
    if ((!hits[i] || i === hits.length - 1) && s >= 0) {
      const end = hits[i] ? i : i - 1;
      if (end - s + 1 >= minLen) out.push({ start: s, end });
      s = -1;
    }
  }
  return out;
}

/**
 * 칸을 찾아 각각을 **흰 바탕 위의 정사각형**으로 만들어 돌려준다.
 * 칸이 하나뿐이면 그 하나만 돌려준다(회전 시트가 아니었다는 뜻).
 */
export async function splitPanels(dataUrl: string, maxPanels = 4): Promise<Panel[]> {
  const buf = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
  const meta = await sharp(buf).metadata();
  const W = meta.width ?? 0, H = meta.height ?? 0;
  if (!W || !H) return [];

  // 09-09: 덩어리 찾기(연결 성분)도, 픽셀 세기 투영도 **후광 때문에** 칸을 못 갈랐다.
  // 되는 방법은 단순했다 — 가운데 띠에서 **열마다 가장 밝은 값**만 본다.
  // 금속은 거의 흰색(1.0)이고 칸 사이 빈 곳은 후광이어도 그보다 뚜렷이 어둡다.
  // (실측: 최소 0.00 / 최대 1.00 / 경계 0.50 → 칸 셋이 1~32%, 32~67%, 68~99% 로 깨끗이 갈렸다.)
  const SW = 256;
  const SH = Math.max(1, Math.round((H / W) * SW));
  const g = await sharp(buf).removeAlpha().greyscale().resize(SW, SH, { fit: "fill" }).raw().toBuffer();
  const at = (x: number, y: number) => g[y * SW + x] / 255;

  const scan = (a: number, b: number, len: number, other: number, pick: (i: number, j: number) => number) => {
    const prof: number[] = [];
    for (let i = 0; i < len; i++) {
      let m = 0;
      for (let j = a; j < b; j++) m = Math.max(m, pick(i, j));
      prof.push(m);
    }
    const lo = Math.min(...prof), hi = Math.max(...prof);
    const thr = (lo + hi) / 2;
    const out: Band[] = [];
    let s0 = -1;
    for (let i = 0; i <= len; i++) {
      const on = i < len && prof[i] > thr;
      if (on && s0 < 0) s0 = i;
      if (!on && s0 >= 0) { if (i - s0 > other * 0.06) out.push({ start: s0, end: i - 1 }); s0 = -1; }
    }
    return out;
  };

  const cols = scan(Math.round(SH * 0.25), Math.round(SH * 0.75), SW, SW, (x, y) => at(x, y));
  if (cols.length === 0) return [];

  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const c of cols) {
    const rows = scan(c.start, c.end + 1, SH, SH, (y, x) => at(x, y));
    for (const r of rows) boxes.push({ x0: c.start, y0: r.start, x1: c.end, y1: r.end });
  }

  const area = (b: { x0: number; y0: number; x1: number; y1: number }) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
  const biggest = Math.max(...boxes.map(area));
  const keep = boxes.filter((b) => area(b) > biggest * 0.25).slice(0, maxPanels);
  keep.sort((a, b) => (Math.abs(a.y0 - b.y0) > SH * 0.15 ? a.y0 - b.y0 : a.x0 - b.x0));

  const sx = W / SW, sy = H / SH;
  const out: Panel[] = [];
  for (const b of keep) {
    const bx = Math.round(b.x0 * sx), by = Math.round(b.y0 * sy);
    const bw = Math.round((b.x1 - b.x0 + 1) * sx), bh = Math.round((b.y1 - b.y0 + 1) * sy);
    // 09-09 2판: 정사각형으로 자르니 여백이 **옆 칸을 물어** 왔다(잘린 그림마다 이웃 투구가 조금씩 붙었다).
    // 그 칸만 정확히 자르고, 정사각형은 **흰 여백을 붙여서** 만든다.
    const pad = Math.round(Math.min(bw, bh) * 0.06);
    const left = Math.max(0, bx - pad);
    const top = Math.max(0, by - pad);
    const cw = Math.min(W - left, bw + pad * 2);
    const chh = Math.min(H - top, bh + pad * 2);
    const cut = await sharp(buf)
      .extract({ left, top, width: cw, height: chh })
      .resize(1024, 1024, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png().toBuffer();
    out.push({ dataUrl: `data:image/png;base64,${cut.toString("base64")}`, x: bx, y: by, w: bw, h: bh });
  }
  return out;
}
