import sharp from "sharp";

/**
 * 화면의 **사실**을 잰다 (133회차 09-16). 판정은 안 한다.
 *
 * 사장님: "재는 자는 의미없다 ... 심판자 ai를 만들어라" → 그래서 132회차에 심판자를 만들었다.
 * 그런데 첫 판에 심판자가 이렇게 말했다: *"얇은 연한 회색 글자가 짙은 회색 배경과 대비가 약해 가독성이 떨어진다"*.
 * 맞는 말인데 **눈대중**이다. 대비는 눈대중할 것이 아니라 **재는 것**이다(명암비는 숫자로 정의돼 있다).
 *
 * 그래서 자를 되살리는 것이 아니라 **자리를 나눈다**:
 *   · 기계는 **사실**을 댄다 — 명암비 4.7:1, 글자가 아래 42%에 하나도 없다, 오른쪽 여백 12px.
 *   · 심판자는 그 사실을 **읽고 판정한다** — 이 주문에서 그게 흠인가, 되돌릴 만한가.
 * 여기엔 **문턱도 통과/실패도 없다.** 숫자만 낸다. 문턱을 여기 두는 순간 132회차 이전으로 돌아간다.
 *
 * 09-16 에 찾아본 것과 맞다: 지금 영상 품질 평가는 **잰 값 + LLM 심판**을 같이 쓰고,
 * 미학과 기술을 **따로** 점수 낸다(VGA-Bench 계열). 우리도 그 모양으로 간다.
 */

export type FrameStyle = {
  /** 잉크(배경과 다른 픽셀)가 놓인 세로 범위. 0=맨 위, 1=맨 아래. 글자가 없으면 null. */
  inkTop: number | null;
  inkBottom: number | null;
  /** 아래쪽에 아무것도 없는 비율. 0.42 면 아래 42%가 비었다는 뜻. */
  deadBottom: number;
  /** 잉크가 가장자리 안전 여백(바깥 5%)을 침범했나. 잘려 나갈 **위험**. */
  touchesEdge: boolean;
  /**
   * 잉크가 **맨 끝 줄**(바깥 2px)에 닿았나 — 위험이 아니라 **이미 잘린 것**이다.
   * 133회차에 이 둘을 안 갈라서, 글자가 실제로 잘린 화면을 심판자가 "가장자리에 가깝다" 로 읽고 통과시켰다.
   * 읽을 수 없는 글자는 없는 글자다. 가른 값을 줘야 심판자가 제대로 판단한다.
   */
  clipped: boolean;
  /** 밝은 글자와 바탕의 명암비(WCAG 식, 1~21). 본문은 보통 4.5 이상을 권한다. */
  contrast: number | null;
  /** 바탕색(가장 많은 색) 16진. */
  background: string;
  /** 눈에 띄는 색 가짓수(대충 — 16단계로 뭉쳐 센다). */
  colorCount: number;
};

const REL = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = (r: number, g: number, b: number) => 0.2126 * REL(r) + 0.7152 * REL(g) + 0.0722 * REL(b);

/** 한 장을 잰다. 문턱 없음 — 숫자만. */
export async function frameStyle(png: Buffer | Uint8Array): Promise<FrameStyle> {
  const img = sharp(Buffer.from(png)).removeAlpha();
  const { width: W = 0, height: H = 0 } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]] as const; };

  // 바탕색 = 가장 많이 나온 색(16단계로 뭉쳐서)
  const bins = new Map<number, number>();
  const key = (r: number, g: number, b: number) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const [r, g, b] = at(x, y); const k = key(r, g, b); bins.set(k, (bins.get(k) ?? 0) + 1); }
  let bgKey = 0, best = -1;
  for (const [k, n] of bins) if (n > best) { best = n; bgKey = k; }
  const bgR = ((bgKey >> 8) & 15) * 17, bgG = ((bgKey >> 4) & 15) * 17, bgB = (bgKey & 15) * 17;
  const bgLum = lum(bgR, bgG, bgB);

  // 잉크 = 바탕에서 충분히 떨어진 픽셀. 세로 범위와 가장자리 침범, 그리고 가장 밝은(=글자) 명암비.
  const FAR = 40; // 채널 합 차이
  let top: number | null = null, bottom: number | null = null, edge = false, clip = false, inkLum = bgLum, inkN = 0;
  const mx = Math.round(W * 0.05), my = Math.round(H * 0.05);
  const EDGE = 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = at(x, y);
      if (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) < FAR) continue;
      inkN++;
      if (top === null) top = y;
      bottom = y;
      if (x < mx || x >= W - mx || y < my || y >= H - my) edge = true;
      if (x < EDGE || x >= W - EDGE || y < EDGE || y >= H - EDGE) clip = true;
      const l = lum(r, g, b);
      if (Math.abs(l - bgLum) > Math.abs(inkLum - bgLum)) inkLum = l;
    }
  }
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const hex = `#${[bgR, bgG, bgB].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return {
    inkTop: top === null ? null : Number((top / H).toFixed(3)),
    inkBottom: bottom === null ? null : Number((bottom / H).toFixed(3)),
    deadBottom: bottom === null ? 1 : Number((1 - bottom / H).toFixed(3)),
    touchesEdge: edge,
    clipped: clip,
    contrast: inkN === 0 ? null : Number(ratio(inkLum, bgLum).toFixed(2)),
    background: hex,
    colorCount: bins.size,
  };
}

/** 심판자가 읽을 한 줄. **판정하지 않는다** — 잰 값만 적는다. */
export function styleLine(label: string, s: FrameStyle, seconds?: number): string {
  const bits = [
    s.contrast === null ? "글자로 볼 만한 픽셀 없음" : `글자-바탕 명암비 ${s.contrast}:1`,
    s.inkTop === null ? null : `내용이 세로 ${Math.round(s.inkTop * 100)}%~${Math.round((s.inkBottom ?? 0) * 100)}% 에 있다(아래 ${Math.round(s.deadBottom * 100)}% 비었다)`,
    s.clipped ? "**글자가 화면 맨 끝에 닿아 잘려 나갔다 — 일부를 읽을 수 없다**"
      : s.touchesEdge ? "바깥 5% 안전 여백을 침범한다(아직 잘리지는 않았다)" : "안전 여백 안",
    `바탕 ${s.background} · 색 ${s.colorCount}가지`,
    seconds === undefined ? null : `${seconds.toFixed(1)}초`,
  ].filter(Boolean);
  return `${label}: ${bits.join(" · ")}`;
}
