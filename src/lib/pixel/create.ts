import { readFileSync } from "node:fs";
import sharp from "sharp";
import { realDot } from "./realdot";
import { cutFrames, findFrames } from "./frames";
import { profileOf, snapToPalette, styleDistance, type StyleProfile } from "./style";

/**
 * **글로 캐릭터 만들기** (11-25 사장님: "픽셀랩 같은 거 만들고 싶어").
 *
 * 글 → 그림 AI 가 도트풍으로 그린다 → 진짜 도트(realDot) → 배경 잘라 내기(findFrames) → **정한 캔버스(32·48·64·96px)** 에 앉힌다.
 * AI 는 만들고 기계가 맞춘다. 기계 검사(잠금 — 11-25, 돌리기 전에 적음):
 *   ① 도트 격자를 찾았다  ② 캐릭터 덩어리가 정확히 1개  ③ 캔버스에 앉힌 키가 캔버스의 35% 이상
 *   하나라도 어기면 실패 → 라우트가 장을 돌려준다. **다시 그리지 않는다**(사장님 11-25 "진짜 아껴써라" — 한 번 = 한 장 값).
 * AI 가 캔버스보다 크게 그리면 nearest 로 줄인다(정수배가 아니면 칸이 조금 뭉개진다 — 그 사실을 facts 에 적는다).
 * 시험용 목: PIXEL_CREATE_MOCK=<png> 면 AI 를 안 부른다(돈 0).
 */
export const SIZES = [32, 48, 64, 96] as const;
export type CanvasSize = (typeof SIZES)[number];
const BG = "#B0C4DE";

export type CreateResult =
  | { ok: true; png: Buffer; big: Buffer; raw: Buffer; drawn: [number, number]; size: number; usd: number; facts: string[] }
  | { ok: false; reason: string; usd: number; facts: string[] };

/** 손님 글을 프롬프트에 넣기 전에: 한 줄 · 200자 · 제어문자 없음 */
export const cleanDesc = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

/**
 * 게임 그림체로 만들 때(11-25 "게임 추가"): 그림 AI 에 게임 그림 묶음을 참조로 준다.
 * 일관성은 **만드는 방식으로 강제**한다 — 키는 게임 캐릭터 키(칸)로 맞추고, 원하면 색을 게임 팔레트로 스냅한다.
 * 기계 숫자로 "같은 그림체인가"를 판정하지는 않는다: 보정표(engine/work/realdot/style/calibrate.tsv)에서
 * 색 거리·외곽선 밝기·색 분포 셋 다 두근도트 ↔ 거짓말의 온도를 못 갈랐다(새 캐릭터는 원래 새 색을 쓴다). 색만 돌린 그림만 갈렸다.
 * 그래서 팔레트 거리는 **보여 주기만** 한다(문 아님).
 */
export function stylePrompt(desc: string, height: number): string {
  return [
    "The reference image shows character sprites from ONE video game.",
    `Draw ONE NEW character for the same game in exactly the same pixel-art style: same pixel size (the new character is about ${height} pixels tall, like the sprites in the reference), same head-to-body proportions, same outline style and thickness, same shading style, same color palette, same camera view.`,
    `The new character: ${desc}.`,
    "Exactly ONE character, full body, standing, centered, nothing else in the picture — do NOT copy the reference characters.",
    `Flat solid background color ${BG} everywhere — no shadow, no ground, no text, no border.`,
  ].join(" ");
}

/** 게임 그림(최대 4장)을 한 장의 참조판으로: 2×2 칸에 nearest 로 키워 한 색 배경에 */
export async function refBoard(imgs: Buffer[]): Promise<Buffer> {
  const tiles = await Promise.all(imgs.slice(0, 4).map(async (b) => {
    const m = await sharp(b).metadata(); const long = Math.max(m.width ?? 1, m.height ?? 1);
    const k = long < 480 ? Math.max(1, Math.floor(480 / long)) : 480 / long;
    return sharp(b).flatten({ background: BG }).resize({ width: Math.max(1, Math.round((m.width ?? 1) * k)), kernel: "nearest" }).png().toBuffer();
  }));
  const comp = await Promise.all(tiles.map(async (t, i) => { const m = await sharp(t).metadata(); return { input: t, left: (i % 2) * 512 + Math.floor((512 - (m.width ?? 0)) / 2), top: Math.floor(i / 2) * 512 + Math.floor((512 - (m.height ?? 0)) / 2) }; }));
  return sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } }).composite(comp).png().toBuffer();
}

export function createPrompt(desc: string, size: number): string {
  return [
    `Pixel art game sprite: ${desc}.`,
    "Exactly ONE character, full body from head to feet, front view facing the viewer, standing, centered, nothing else in the picture.",
    `Low resolution sprite about ${Math.round(size * 0.85)} pixels tall, drawn with big chunky square pixels (every pixel clearly visible), crisp hard edges, no anti-aliasing, no gradients, limited palette, dark outline.`,
    `Flat solid background color ${BG} everywhere — no shadow, no ground, no text, no border, no frame.`,
  ].join(" ");
}

type Drawer = (prompt: string, ref?: Buffer) => Promise<{ png: Buffer; usd: number }>;
async function openaiDrawer(): Promise<Drawer> {
  const { createImageProvider } = await import("@/lib/providers/images");
  const { costOf } = await import("@/lib/costs/pricing");
  const p = createImageProvider("gpt-image-2.5-flare");
  return async (prompt, ref) => {
    const r = ref ? await p.edit("data:image/png;base64," + ref.toString("base64"), prompt, "1024x1024", "low") : await p.draw(prompt, "low", "1024x1024", "opaque");
    return { png: Buffer.from(r.dataUrl.split(",")[1], "base64"), usd: costOf({ backend: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens }) };
  };
}

export type FitOpts = { colors?: number; height?: number; profile?: StyleProfile; snap?: boolean };

/** 이미 그려 온 그림(raw)을 캔버스에 앉힌다 — AI 를 안 부르는 순수 기계 부분(시험이 이것을 직접 잰다). */
export async function fitToCanvas(raw: Buffer, size: number, o: FitOpts = {}): Promise<{ ok: true; png: Buffer; drawn: [number, number]; facts: string[]; size: number } | { ok: false; reason: string; facts: string[] }> {
  const facts: string[] = [];
  let small: Buffer, period: number;
  try { const rd = await realDot(raw, { colors: o.colors ?? 32 }); small = rd.small; period = rd.period[0]; } catch (e) { return { ok: false, reason: (e as Error).message, facts: ["① 격자 못 찾음"] }; }
  let set;
  try { set = await findFrames(small, { clearBg: true }); } catch (e) { return { ok: false, reason: (e as Error).message, facts: ["② 캐릭터 못 찾음"] }; }
  if (set.frames.length !== 1) return { ok: false, reason: `캐릭터가 ${set.frames.length}개로 그려졌어요`, facts: [`② 덩어리 ${set.frames.length}개(기대 1)`] };
  let [cut] = await cutFrames(small, set);
  let { cellW: w, cellH: h } = set;
  facts.push(`AI 도트 ${w}×${h}칸`);
  // 게임 키가 정해져 있으면: 칸을 늘려 맞추지 않고(정수배가 아니면 칸 크기가 들쭉날쭉) **원본을 게임 키에 맞는 격자로 다시 찍는다**(11-25)
  // 11-25 사장님 "오른쪽 도트 이상한데": 36칸 그림을 58칸 격자로 다시 찍으면 없던 칸을 지어내 선 굵기가 들쭉날쭉해진다.
  // → **차이가 15% 안일 때만** 맞춘다. 크면 AI 가 그린 격자 그대로 두고 숫자로 알린다(지어내지 않는다 — texel-ruler 원칙).
  const close = o.height ? Math.abs(h - o.height) / o.height <= 0.15 : false;
  if (o.height && !close) facts.push(`게임 키 ${o.height}칸 · 이번 그림 ${h}칸 — 차이가 커서 그대로 둠`);
  if (o.height && close && Math.abs(h - o.height) > 1) {
    try {
      const rd2 = await realDot(raw, { colors: o.colors ?? 32, period: (period * h) / o.height });
      const set2 = await findFrames(rd2.small, { clearBg: true });
      if (set2.frames.length === 1) { [cut] = await cutFrames(rd2.small, set2); ({ cellW: w, cellH: h } = set2); facts.push(`게임 키에 맞춰 ${w}×${h}칸 격자로 다시 찍음`); }
    } catch { /* 다시 찍기 실패면 아래에서 nearest 로 맞춘다 */ }
  }
  if (o.profile) { // 스냅 전에 잰다(보여 주기만)
    const px: [number, number, number][] = []; for (let i = 0; i < cut.length; i += 4) if (cut[i + 3]) px.push([cut[i], cut[i + 1], cut[i + 2]]);
    const sd = styleDistance(px, o.profile); facts.push(`게임 팔레트와 색 거리 ${sd.palDist.toFixed(0)}`);
  }
  let img = sharp(cut, { raw: { width: w, height: h, channels: 4 } }).png();
  let fw = w, fh = h;
  if (o.height) size = canvasFor(Math.max(close ? o.height : h, w)); // 게임 그림체: 캔버스는 실제 키에 맞춘다
  const want = o.height && close ? o.height : Math.max(w, h) > size ? Math.floor((size * h) / Math.max(w, h)) : h;
  if (want !== h) {
    const k = want / h; fw = Math.max(1, Math.round(w * k)); fh = want;
    if (fw > size) { const k2 = size / fw; fw = size; fh = Math.max(1, Math.round(fh * k2)); }
    img = sharp(await img.toBuffer()).resize(fw, fh, { kernel: "nearest" }).png();
    facts.push(o.height && close ? `게임 키 ${o.height}칸에 맞춤(${(k * 100).toFixed(0)}%)` : `캔버스보다 커서 ${(k * 100).toFixed(0)}%로 줄임`);
  }
  if (fh < size * 0.35 && !o.height) return { ok: false, reason: `캐릭터가 너무 작게 그려졌어요(${fh}px)`, facts: [...facts, `③ 키 ${fh}px < ${Math.ceil(size * 0.35)}px`] };
  let piece = await img.toBuffer();
  if (o.profile && o.snap) { piece = await snapToPalette(piece, o.profile); facts.push(`게임 팔레트 ${o.profile.palette.length}색으로 맞춤`); }
  const left = Math.floor((size - fw) / 2), top = size - fh - Math.max(0, Math.min(2, size - fh)); // 가운데 · 바닥에서 2px 띄움
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: piece, left, top }]).png().toBuffer();
  facts.push(`캔버스 ${size}×${size} · 키 ${fh}px`);
  return { ok: true, png, drawn: [w, h], facts, size };
}

/** 게임 키에 맞는 캔버스: 키 + 4 이상인 가장 작은 기본 크기, 없으면 키 + 4 */
export const canvasFor = (height: number) => SIZES.find((z) => z >= height + 4) ?? height + 4;

export async function makeCharacter(desc: string, size: CanvasSize, o: { colors?: number; game?: Buffer[]; snap?: boolean } = {}): Promise<CreateResult> {
  const draw: Drawer = process.env.PIXEL_CREATE_MOCK ? async () => ({ png: readFileSync(process.env.PIXEL_CREATE_MOCK!), usd: 0 }) : await openaiDrawer();
  let profile: StyleProfile | undefined, board: Buffer | undefined;
  if (o.game?.length) {
    try { profile = await profileOf(o.game); } catch (e) { return { ok: false, reason: (e as Error).message, usd: 0, facts: ["게임 그림 분석 실패"] }; }
    board = await refBoard(o.game);
  }
  const canvas = profile ? canvasFor(profile.height) : size;
  let d: { png: Buffer; usd: number };
  try { d = await draw(profile ? stylePrompt(cleanDesc(desc), profile.height) : createPrompt(cleanDesc(desc), size), board); }
  catch (e) { return { ok: false, reason: `그림 AI 가 거절했어요 (${(e as Error).message.slice(0, 80)})`, usd: 0, facts: [] }; }
  const f = await fitToCanvas(d.png, canvas, { colors: o.colors ?? 32, height: profile?.height, profile, snap: o.snap });
  if (!f.ok) return { ok: false, reason: f.reason, usd: d.usd, facts: f.facts };
  const scale = Math.max(2, Math.floor(768 / f.size));
  const big = await sharp(f.png).resize(f.size * scale, f.size * scale, { kernel: "nearest" }).png().toBuffer();
  return { ok: true, png: f.png, big, raw: d.png, drawn: f.drawn, size: f.size, usd: d.usd, facts: f.facts };
}

