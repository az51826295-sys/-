import { readFileSync } from "node:fs";
import sharp from "sharp";
import { realDot } from "./realdot";
import { cutFrames, findFrames } from "./frames";

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

export function createPrompt(desc: string, size: number): string {
  return [
    `Pixel art game sprite: ${desc}.`,
    "Exactly ONE character, full body from head to feet, front view facing the viewer, standing, centered, nothing else in the picture.",
    `Low resolution sprite about ${Math.round(size * 0.85)} pixels tall, drawn with big chunky square pixels (every pixel clearly visible), crisp hard edges, no anti-aliasing, no gradients, limited palette, dark outline.`,
    `Flat solid background color ${BG} everywhere — no shadow, no ground, no text, no border, no frame.`,
  ].join(" ");
}

type Drawer = (prompt: string) => Promise<{ png: Buffer; usd: number }>;
async function openaiDrawer(): Promise<Drawer> {
  const { createImageProvider } = await import("@/lib/providers/images");
  const { costOf } = await import("@/lib/costs/pricing");
  const p = createImageProvider("gpt-image-2.5-flare");
  return async (prompt) => {
    const r = await p.draw(prompt, "low", "1024x1024", "opaque");
    return { png: Buffer.from(r.dataUrl.split(",")[1], "base64"), usd: costOf({ backend: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens }) };
  };
}

/** 이미 그려 온 그림(raw)을 캔버스에 앉힌다 — AI 를 안 부르는 순수 기계 부분(시험이 이것을 직접 잰다). */
export async function fitToCanvas(raw: Buffer, size: number, colors = 32): Promise<{ ok: true; png: Buffer; drawn: [number, number]; facts: string[] } | { ok: false; reason: string; facts: string[] }> {
  const facts: string[] = [];
  let small: Buffer;
  try { small = (await realDot(raw, { colors })).small; } catch (e) { return { ok: false, reason: (e as Error).message, facts: ["① 격자 못 찾음"] }; }
  let set;
  try { set = await findFrames(small, { clearBg: true }); } catch (e) { return { ok: false, reason: (e as Error).message, facts: ["② 캐릭터 못 찾음"] }; }
  if (set.frames.length !== 1) return { ok: false, reason: `캐릭터가 ${set.frames.length}개로 그려졌어요`, facts: [`② 덩어리 ${set.frames.length}개(기대 1)`] };
  const [cut] = await cutFrames(small, set);
  const { cellW: w, cellH: h } = set;
  facts.push(`AI 도트 ${w}×${h}칸`);
  let img = sharp(cut, { raw: { width: w, height: h, channels: 4 } }).png();
  let fw = w, fh = h;
  if (Math.max(w, h) > size) {
    const k = size / Math.max(w, h); fw = Math.max(1, Math.round(w * k)); fh = Math.max(1, Math.round(h * k));
    img = sharp(await img.toBuffer()).resize(fw, fh, { kernel: "nearest" }).png();
    facts.push(`캔버스보다 커서 ${(k * 100).toFixed(0)}%로 줄임`);
  }
  if (fh < size * 0.35) return { ok: false, reason: `캐릭터가 너무 작게 그려졌어요(${fh}px)`, facts: [...facts, `③ 키 ${fh}px < ${Math.ceil(size * 0.35)}px`] };
  const left = Math.floor((size - fw) / 2), top = size - fh - Math.max(0, Math.min(2, size - fh)); // 가운데 · 바닥에서 2px 띄움
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await img.toBuffer(), left, top }]).png().toBuffer();
  facts.push(`캔버스 ${size}×${size} · 키 ${fh}px`);
  return { ok: true, png, drawn: [w, h], facts };
}

export async function makeCharacter(desc: string, size: CanvasSize, o: { colors?: number } = {}): Promise<CreateResult> {
  const draw: Drawer = process.env.PIXEL_CREATE_MOCK ? async () => ({ png: readFileSync(process.env.PIXEL_CREATE_MOCK!), usd: 0 }) : await openaiDrawer();
  let d: { png: Buffer; usd: number };
  try { d = await draw(createPrompt(cleanDesc(desc), size)); }
  catch (e) { return { ok: false, reason: `그림 AI 가 거절했어요 (${(e as Error).message.slice(0, 80)})`, usd: 0, facts: [] }; }
  const f = await fitToCanvas(d.png, size, o.colors ?? 32);
  if (!f.ok) return { ok: false, reason: f.reason, usd: d.usd, facts: f.facts };
  const big = await sharp(f.png).resize(size * 8, size * 8, { kernel: "nearest" }).png().toBuffer();
  return { ok: true, png: f.png, big, raw: d.png, drawn: f.drawn, size, usd: d.usd, facts: f.facts };
}
