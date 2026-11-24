import sharp from "sharp";
import { realDot } from "./realdot";
import { cutFrames, findFrames } from "./frames";

/**
 * **게임 그림체(스타일 프로필)** — 11-25 사장님: "게임 추가하면 게임에 일관성 맞는 캐릭터가 생성돼".
 *
 * 손님이 자기 게임 그림(스프라이트·시트) 몇 장을 올리면 **기계가** 그 게임의 그림체를 숫자로 뽑는다($0):
 *   팔레트(쓰인 색) · 캐릭터 키(진짜 도트 칸 수) · 색 분포.
 * 새 캐릭터는 이 프로필로 ① 그림 AI 에 게임 그림을 참조로 주고 ② 결과를 **게임 팔레트로 스냅**하고 ③ **게임 키로 맞춘다.**
 * ②③은 만드는 방식이라 늘 맞는다. 그래서 일관성 검사는 **스냅 전** 그림이 게임 팔레트에서 얼마나 멀었나(팔레트 거리)와
 * 색 분포 겹침으로 잰다 — 멀면 AI 가 다른 그림체로 그린 것이다.
 */
export type Rgb = [number, number, number];
export type StyleProfile = { palette: Rgb[]; weights: number[]; height: number; heights: number[]; hist: number[]; figures: number; edgeLuma: number };

const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const L = 5;
export function histOf(px: Rgb[]): number[] {
  const h = new Array(L ** 3).fill(0);
  for (const p of px) h[Math.min(L - 1, (p[0] * L) >> 8) * L * L + Math.min(L - 1, (p[1] * L) >> 8) * L + Math.min(L - 1, (p[2] * L) >> 8)]++;
  const n = px.length || 1; return h.map((v) => v / n);
}
export const overlap = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.min(v, b[i]), 0);

/**
 * 게임 그림을 "한 칸 = 1px" 로. 게임 개발자는 **이미 1배 스프라이트**를 올리는 일이 많다 — 작고(긴 변 ≤ 256) 색이 적으면(≤ 256) 그대로 쓴다.
 * 아니면 AI 도트풍 그림으로 보고 realDot.
 */
export async function logicalOf(img: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (Math.max(info.width, info.height) <= 256) {
    const u = new Set<number>(); for (let i = 0; i < data.length && u.size <= 256; i += 4) if (data[i + 3] >= 128) u.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (u.size <= 256) return sharp(img).png().toBuffer();
  }
  return (await realDot(img, { colors: 32 })).small;
}

/** 그림 한 장 → 캐릭터 조각들(배경 뺀 픽셀·키). 시트면 여러 명. */
export type Figure = { px: Rgb[]; edge: Rgb[]; height: number };
const luma = (p: Rgb) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
export const meanLuma = (px: Rgb[]) => px.reduce((s, p) => s + luma(p), 0) / (px.length || 1);
export async function figuresOf(img: Buffer): Promise<Figure[]> {
  const small = await logicalOf(img);
  const set = await findFrames(small, { clearBg: true });
  const cuts = await cutFrames(small, set);
  return cuts.map((c) => {
    const px: Rgb[] = [], edge: Rgb[] = []; let top = -1, bot = -1;
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < set.cellW && y < set.cellH && c[(y * set.cellW + x) * 4 + 3] > 0;
    for (let y = 0; y < set.cellH; y++) for (let x = 0; x < set.cellW; x++) {
      const i = (y * set.cellW + x) * 4; if (!c[i + 3]) continue;
      const q: Rgb = [c[i], c[i + 1], c[i + 2]]; px.push(q); if (top < 0) top = y; bot = y;
      if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) edge.push(q); // 실루엣 가장자리 = 외곽선 자리
    }
    return { px, edge, height: bot - top + 1 };
  }).filter((f) => f.px.length > 20);
}

/** 게임 그림 여러 장 → 프로필. 팔레트는 쓰인 색을 가까운 것끼리(거리 < 14) 묶고, 전체의 0.2% 넘게 쓰인 색만(최대 48). */
export async function profileOf(imgs: Buffer[]): Promise<StyleProfile> {
  const figs = (await Promise.all(imgs.map((b) => figuresOf(b).catch(() => [])))).flat();
  if (!figs.length) throw new Error("게임 그림에서 캐릭터를 못 찾았어요 — 배경이 한 색이거나 투명한 스프라이트를 올려 주세요.");
  const all = figs.flatMap((f) => f.px);
  const cnt = new Map<number, number>();
  for (const p of all) { const k = (p[0] << 16) | (p[1] << 8) | p[2]; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  const cols = [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ c: [(k >> 16) & 255, (k >> 8) & 255, k & 255] as Rgb, n }));
  const pal: { c: Rgb; n: number }[] = [];
  for (const x of cols) { const near = pal.find((p) => dist(p.c, x.c) < 14); if (near) near.n += x.n; else pal.push({ ...x }); }
  const keep = pal.filter((p) => p.n >= all.length * 0.002).slice(0, 48);
  const hs = figs.map((f) => f.height).sort((a, b) => a - b);
  return { palette: keep.map((p) => p.c), weights: keep.map((p) => p.n / all.length), height: hs[hs.length >> 1], heights: hs, hist: histOf(all), figures: figs.length, edgeLuma: meanLuma(figs.flatMap((f) => f.edge)) };
}

/** 캐릭터 픽셀이 게임 그림체에서 얼마나 먼가(스냅 전에 잰다). */
export function styleDistance(px: Rgb[], p: StyleProfile, edge: Rgb[] = []): { palDist: number; within: number; histOv: number; edgeDiff: number } {
  let s = 0, w = 0;
  for (const q of px) { let m = Infinity; for (const c of p.palette) m = Math.min(m, dist(q, c)); s += m; if (m <= 24) w++; }
  const n = px.length || 1;
  return { palDist: s / n, within: w / n, histOv: overlap(histOf(px), p.hist), edgeDiff: edge.length ? Math.abs(meanLuma(edge) - p.edgeLuma) : NaN };
}

/** RGBA 그림을 게임 팔레트로 스냅(투명은 그대로). */
export async function snapToPalette(png: Buffer, p: StyleProfile): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) { data[i + 3] = 0; continue; }
    let best = p.palette[0], bd = Infinity;
    for (const c of p.palette) { const d = dist([data[i], data[i + 1], data[i + 2]], c); if (d < bd) { bd = d; best = c; } }
    data[i] = best[0]; data[i + 1] = best[1]; data[i + 2] = best[2]; data[i + 3] = 255;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}
