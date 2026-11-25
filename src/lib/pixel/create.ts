import { readFileSync } from "node:fs";
import sharp from "sharp";
import { realDot } from "./realdot";
import { PIXEL_BG, cutFrames, dropBgSpecks, findFrames } from "./frames";
import { profileOf, snapToPalette, styleDistance, type StyleProfile } from "./style";
import { refusedWhy } from "./motion";

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
    `Low resolution sprite about ${Math.round(size * 0.92)} pixels tall, drawn with big chunky square pixels (every pixel clearly visible), crisp hard edges, no anti-aliasing, no gradients, limited palette, dark outline.`,
    `Flat solid background color ${BG} everywhere — no shadow, no ground, no text, no border, no frame.`,
  ].join(" ");
}

type Drawer = (prompt: string, ref?: Buffer) => Promise<{ png: Buffer; usd: number }>;
async function openaiDrawer(): Promise<Drawer> {
  const { createImageProvider } = await import("@/lib/providers/images");
  const { costOf } = await import("@/lib/costs/pricing");
  const p = createImageProvider("gpt-image-2.5-flare");
  return async (prompt, ref) => {
    // 11-25 사장님 "고품질로 하자 가격을 올리더라도": 첫 그림이 low 면 4방향·동작이 전부 그 흐린 그림을 따라간다 → high(환경변수로 내릴 수 있다)
    const q = (process.env.PIXEL_CREATE_QUALITY as "low" | "medium" | "high" | undefined) ?? "medium"; // 11-25 사장님 "미디움이 제일 좋고" — 크기·디테일은 단위 맞추기가 냈다
    const r = ref ? await p.edit("data:image/png;base64," + ref.toString("base64"), prompt, "1024x1024", q) : await p.draw(prompt, q, "1024x1024", "opaque");
    return { png: Buffer.from(r.dataUrl.split(",")[1], "base64"), usd: costOf({ backend: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens }) };
  };
}

export type FitOpts = { colors?: number; height?: number; profile?: StyleProfile; snap?: boolean; near?: number };

/** 이미 그려 온 그림(raw)을 캔버스에 앉힌다 — AI 를 안 부르는 순수 기계 부분(시험이 이것을 직접 잰다). */
export async function fitToCanvas(raw: Buffer, size: number, o: FitOpts = {}): Promise<{ ok: true; png: Buffer; drawn: [number, number]; facts: string[]; size: number; period: number } | { ok: false; reason: string; facts: string[]; period?: number }> {
  const facts: string[] = [];
  let small: Buffer, period: number;
  try { const rd = await realDot(raw, { colors: o.colors ?? 32, near: o.near }); small = rd.small; period = rd.period[0]; } catch (e) { return { ok: false, reason: (e as Error).message, facts: ["① 격자 못 찾음"] }; }
  let set;
  try { set = await findFrames(small, { clearBg: true }); } catch (e) { return { ok: false, reason: (e as Error).message, facts: ["② 캐릭터 못 찾음"] }; }
  if (set.frames.length !== 1) return { ok: false, reason: `캐릭터가 ${set.frames.length}개로 그려졌어요`, facts: [`② 덩어리 ${set.frames.length}개(기대 1)`] };
  let [cut] = await cutFrames(small, set);
  dropBgSpecks(cut, set.cellW, set.cellH, PIXEL_BG); if (set.bg) dropBgSpecks(cut, set.cellW, set.cellH, set.bg); // 11-25: 배경 번짐 지우기(시킨 색 + 읽은 색)
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
  return { ok: true, png, drawn: [w, h], facts, size, period };
}

/** 게임 키에 맞는 캔버스: 키 + 4 이상인 가장 작은 기본 크기, 없으면 키 + 4 */
export const canvasFor = (height: number) => SIZES.find((z) => z >= height + 4) ?? height + 4;

/**
 * 11-25 사장님 "협업해서 픽셀의 단위를 어떻게 맞출지 · 생성만 고퀄로 하면 고퀄이 된다":
 * **도트 한 칸 크기(단위)를 예측자·생성자·잰 값이 같이 맞춘다.**
 *   ① 예측: 목표 키 H = 캔버스의 92% 칸, 그림(1024)에서 캐릭터가 약 80% → 한 칸 u = 820/H px
 *   ② 생성자에게 **격자 판**(u px 간격의 연한 줄)을 주고 "한 칸 = 그 격자 한 칸, 키 H 칸" 으로 그리게 한다
 *   ③ 기계가 실제 한 칸 크기와 키를 잰다
 *   ④ 15% 넘게 어긋나면 **잰 숫자를 생성자에게 되돌려** 같은 캐릭터를 다시 그리게 한다(지난번 한 칸 p px · 키 h 칸 → u px · H 칸). 1번만.
 *   ⑤ 둘 중 목표에 가까운 것을 쓴다.
 */
// 11-25 실패율 자: 목표 92% 면 그림 AI 가 10~15% 넘게 그려 캔버스를 넘쳤다(매 바퀴 1~2개 억지로 줄임) → 88%: 15% 넘쳐도 캔버스 안
export const unitTarget = (size: number) => { const H = Math.round(size * 0.88); return { H, u: +(820 / H).toFixed(1) }; };
export async function gridBoard(u: number): Promise<Buffer> {
  const n = Math.ceil(1024 / u);
  const lines: string[] = [];
  for (let i = 1; i < n; i++) { const v = (i * u).toFixed(1); lines.push(`<line x1="${v}" y1="0" x2="${v}" y2="1024"/><line x1="0" y1="${v}" x2="1024" y2="${v}"/>`); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/><g stroke="#9fb3cd" stroke-width="1">${lines.join("")}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
export function unitPrompt(desc: string, H: number, u: number): string {
  return [
    `The reference image is an EMPTY PIXEL GRID: every grid cell is ${u}x${u} screen pixels and stands for ONE pixel of a pixel-art sprite.`,
    `Paint on this grid a pixel art game sprite: ${desc}. Every sprite pixel must fill exactly one whole grid cell (solid color, square, aligned to the grid) — never half cells, never finer detail than one cell.`,
    `The character is exactly ${H} cells tall from head to feet (about 80% of the image height), full body, front view facing the viewer, standing, centered, exactly ONE character.`,
    `Crisp hard edges, no anti-aliasing, no gradients inside a cell, limited palette, dark outline. Outside the character keep the flat background color ${BG}; the faint grid lines may stay or vanish.`,
  ].join(" ");
}
function feedbackPrompt(H: number, u: number, h: number, p: number): string {
  const dir = h < H ? "SMALLER pixels (more, finer cells)" : "BIGGER pixels (fewer cells)";
  return [
    "Redraw EXACTLY this same character — same design, colors, pose, outfit, proportions — as pixel art with " + dir + ".",
    `Last time each sprite pixel was about ${p.toFixed(0)} screen pixels and the character was ${h} pixels tall. Now each sprite pixel must be ${u} screen pixels and the character exactly ${H} pixels tall (about 80% of the image height).`,
    `Square solid pixels aligned to a regular grid, crisp hard edges, no anti-aliasing. Flat solid background color ${BG}, nothing else.`,
  ].join(" ");
}

export async function makeCharacter(desc: string, size: CanvasSize, o: { colors?: number; game?: Buffer[]; snap?: boolean } = {}): Promise<CreateResult> {
  const draw: Drawer = process.env.PIXEL_CREATE_MOCK ? async () => ({ png: readFileSync(process.env.PIXEL_CREATE_MOCK!), usd: 0 }) : await openaiDrawer();
  let profile: StyleProfile | undefined, board: Buffer | undefined;
  if (o.game?.length) {
    try { profile = await profileOf(o.game); } catch (e) { return { ok: false, reason: (e as Error).message, usd: 0, facts: ["게임 그림 분석 실패"] }; }
    board = await refBoard(o.game);
  }
  const canvas = profile ? canvasFor(profile.height) : size;
  let d: { png: Buffer; usd: number };
  // 기본 그림체: 단위 맞추기 협업(위 ①~⑤). 게임 그림체는 게임 그림이 단위를 정한다(그대로).
  const unit = profile || process.env.PIXEL_UNIT_OFF ? null : unitTarget(size);
  try {
    d = profile ? await draw(stylePrompt(cleanDesc(desc), profile.height), board)
      : unit ? await draw(unitPrompt(cleanDesc(desc), unit.H, unit.u), await gridBoard(unit.u))
      : await draw(createPrompt(cleanDesc(desc), size));
  }
  catch (e) { return { ok: false, reason: refusedWhy(e as Error), usd: 0, facts: [] }; }
  let usd = d.usd;
  let f = await fitToCanvas(d.png, canvas, { colors: o.colors ?? 32, height: profile?.height, profile, snap: o.snap });
  // 11-25 실패율 자 6바퀴 확인 판: 게임 그림체 남학생이 "격자 못 찾음" 으로 바로 실패(게임 그림체 길엔 다시 그리기가 없었다) → 1번만 다시, 이유를 붙여서
  if (!f.ok && profile && !process.env.PIXEL_CREATE_MOCK) {
    try {
      const why = f.facts.some((x) => x.includes("격자")) ? "Last time the picture had no clear pixel grid: draw with big clean square pixels exactly like the reference sprites, no blur, no anti-aliasing." : `Last time: ${f.reason}. Draw exactly ONE character, whole body, centered.`;
      const d2 = await draw(`${stylePrompt(cleanDesc(desc), profile.height)} ${why}`, board);
      usd += d2.usd;
      const f2 = await fitToCanvas(d2.png, canvas, { colors: o.colors ?? 32, height: profile.height, profile, snap: o.snap });
      if (f2.ok) { f2.facts.unshift(`첫 그림 실패(${f.facts.join(" · ")}) → 이유를 붙여 다시 그림`); f = f2; d = d2; }
    } catch { /* 다시 그리기 실패 — 아래에서 실패로 */ }
  }
  if (unit) {
    const h1 = f.ok ? f.drawn[1] : 0;
    const off = !f.ok || Math.abs(h1 - unit.H) / unit.H > 0.15;
    // 11-25 실패율 자 2바퀴: 해골 66칸 · 닌자 68칸이 64 캔버스에 억지로 줄었다(목표 59 의 15% 안이라 손대지 않았다) → 캔버스보다 크면 돈 0 다시 읽기만
    const tooBig = f.ok && !off && Math.max(f.drawn[0], h1) > size;
    const note = `단위 목표: 키 ${unit.H}칸 · 한 칸 ${unit.u}px`;
    if (off && f.ok) {
      // ④ 잰 숫자를 생성자에게 되돌린다 — 같은 캐릭터를 단위만 바꿔 다시
      // 11-25 실패율 자 1바퀴: 되돌린 숫자가 지나치게 먹혀 로봇 104칸 → 37칸(목표 59), 토끼는 58칸 그대로라 48 캔버스에 억지로 줄었다
      // → 후보를 넷으로: 첫 그림 · 다시 그린 그림 · 둘 각각을 **목표 칸 크기 근처에서 다시 읽기**(돈 0, 강제 아님). 목표 키에 가장 가까운 것.
      type Cand = { f: Extract<typeof f, { ok: true }>; d: typeof d; tag: string };
      const cands: Cand[] = [{ f, d, tag: `첫 그림 ${h1}칸(한 칸 ${f.period.toFixed(1)}px)` }];
      const reread = async (src: typeof d, from: string) => {
        const nearP = (await fitToCanvas(src.png, canvas, { colors: o.colors ?? 32 }));
        const p0 = nearP.ok ? (nearP.period * nearP.drawn[1]) / unit.H : unit.u;
        // 더 잘게 읽기는 없는 칸을 지어낸다(로봇: 한 칸 23px 그림을 15px 로 읽어 57칸 — 사장님이 "도트 이상" 이라 한 그 모양) → 더 굵게 합칠 때만
        if (!nearP.ok || p0 < nearP.period * 1.05) return;
        const r = await fitToCanvas(src.png, canvas, { colors: o.colors ?? 32, near: p0 });
        if (r.ok) cands.push({ f: r, d: src, tag: `${from}를 목표 칸 크기 근처에서 다시 읽음 ${r.drawn[1]}칸(한 칸 ${r.period.toFixed(1)}px)` });
      };
      await reread(d, "첫 그림");
      try {
        const d2 = await draw(feedbackPrompt(unit.H, unit.u, h1, f.period), d.png);
        usd += d2.usd;
        const f2 = await fitToCanvas(d2.png, canvas, { colors: o.colors ?? 32 });
        if (f2.ok) { cands.push({ f: f2, d: d2, tag: `숫자를 되돌려 다시 그림 ${f2.drawn[1]}칸(한 칸 ${f2.period.toFixed(1)}px)` }); await reread(d2, "다시 그린 그림"); }
      } catch { /* 다시 그리기 실패 — 남은 후보에서 고른다 */ }
      const best = cands.reduce((a, b) => (Math.abs(b.f.drawn[1] - unit.H) < Math.abs(a.f.drawn[1] - unit.H) ? b : a));
      best.f.facts.unshift(note, `후보 ${cands.length}: ${cands.map((c) => c.tag).join(" · ")} → 고름: ${best.tag}`);
      f = best.f; d = best.d;
    } else if (tooBig && f.ok) {
      const nearP = (f.period * h1) / unit.H;
      const r = await fitToCanvas(d.png, canvas, { colors: o.colors ?? 32, near: nearP });
      if (r.ok && r.period >= f.period * 1.02 && Math.max(r.drawn[0], r.drawn[1]) <= size) { r.facts.unshift(note, `첫 그림 ${h1}칸 — 캔버스보다 커서 조금 굵게 다시 읽음 ${r.drawn[1]}칸(한 칸 ${r.period.toFixed(1)}px)`); f = r; }
      else f.facts.unshift(note, `첫 그림 ${h1}칸 — 캔버스보다 큼, 다시 읽어도 안 맞아 줄임`);
    } else if (f.ok) f.facts.unshift(note, `첫 그림 ${h1}칸(한 칸 ${f.period.toFixed(1)}px) — 목표 안`);
  }
  if (!f.ok) return { ok: false, reason: f.reason, usd, facts: f.facts };
  const scale = Math.max(2, Math.floor(768 / f.size));
  const big = await sharp(f.png).resize(f.size * scale, f.size * scale, { kernel: "nearest" }).png().toBuffer();
  return { ok: true, png: f.png, big, raw: d.png, drawn: f.drawn, size: f.size, usd, facts: f.facts };
}

