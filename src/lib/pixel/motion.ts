import { readFileSync } from "node:fs";
import sharp from "sharp";
import { z } from "zod";
import { realDot, type RealDotResult } from "./realdot";
import { cutFrames, findFrames, gifOf, sheetOf, type FrameSet } from "./frames";
import { checkGate } from "@/lib/director/index";

/**
 * **AI 동작 생성** (11-24 사장님: "그거 만들어야 돼 · 생성자").
 *
 * 캐릭터 그림 한 장 → 그림 AI 가 **같은 캐릭터**로 동작 프레임 한 줄을 그린다 → 진짜 도트 → 프레임 나누기 → 움직임.
 * AI 는 만들고, 기계가 맞추고 잰다(사장님 11-23 "AI 와 기계식 융합"). 판단은 로키 엔진 방식:
 *   기계 검사가 통과/실패를 말하면 그게 이긴다($0). 애매할 때만 판단자(luna)에게 "같은 캐릭터인가"를 묻고 `checkGate` 로 받는다.
 *   실패면 **한 번만** 다시 그린다(돈을 아낀다 — 사장님 11-24 "제발 아껴서"). 그래도 실패면 쓴 장을 돌려준다(라우트에서).
 *
 * 모델: gpt-image-2.5-flare 참조 그리기(edit). 품질 "low" — 어차피 진짜 도트로 다시 찍으니 고품질 값이 필요 없다.
 * 시험용 목: PIXEL_MOTION_MOCK=<png 경로> 면 AI 를 안 부르고 그 그림을 "그려 온 것"으로 쓴다(돈 0).
 */
export const MOTIONS = {
  idle: { ko: "숨쉬기·깜빡임", en: "Idle (breathing, blink)", frames: 4, lock: false,
    prompt: "idle animation: frame 1 neutral, frame 2 slight breath in (body 1 pixel lower), frame 3 eyes closed (blink), frame 4 neutral again" },
  walk: { ko: "걷기", en: "Walk", frames: 4, lock: false,
    prompt: "walk cycle seen from the front: frame 1 left foot forward, frame 2 feet together passing, frame 3 right foot forward, frame 4 feet together passing; arms swing opposite to legs" },
  wave: { ko: "손 흔들기", en: "Wave", frames: 4, lock: false,
    prompt: "waving hello with the right hand: frame 1 hand down, frame 2 hand raised beside the face, frame 3 hand tilted left, frame 4 hand tilted right" },
  // 11-25 "픽셀랩 같은 것": 4방향 — 게임 캐릭터의 기본 세트
  turn: { ko: "4방향(앞·오른쪽·뒤·왼쪽)", en: "4 directions", frames: 4, lock: false,
    prompt: "the same character seen from 4 directions, standing still: frame 1 front view facing the viewer, frame 2 side view facing right, frame 3 back view (we see the back of the head), frame 4 side view facing left" },
  // 손님이 글로 쓴 동작 — 프롬프트는 makeMotion 이 손님 글로 채운다
  custom: { ko: "글로 쓴 동작", en: "Custom action", frames: 4, lock: false, prompt: "" },
} as const;
export type MotionKey = keyof typeof MOTIONS;
export const MOTION_COST = 1; // 장 — 값은 사장님이 정한다(11-24 기본값 1장, 바꾸려면 여기 한 곳)

const BG = "#B0C4DE"; // 배경 한 색(자동 나누기가 배경으로 갈라 찾는다)

export type MotionCheck = { machine: "pass" | "fail" | "unsure"; facts: string[]; judge?: { same: boolean; confidence: number; why: string }; action: "accept" | "escalate" };
export type MotionResult = { ok: true; set: FrameSet; cuts: Buffer[]; rd: RealDotResult; raw: Buffer; tries: number; usd: number; check: MotionCheck }
  | { ok: false; reason: string; tries: number; usd: number; check?: MotionCheck; raw?: Buffer }; // raw: 돈 내고 그렸는데 떨어진 그림(11-25 용 4방향 — 못 봐서 판정을 못 했다)

/** 프레임들 중 가장 큰 키(칸) — 예측(참조 키)과 견준다. */
function heightOf(cuts: Buffer[], set: FrameSet): number {
  return Math.max(...cuts.map((c) => { let top = -1, bot = -1; for (let y = 0; y < set.cellH; y++) for (let x = 0; x < set.cellW; x++) if (c[(y * set.cellW + x) * 4 + 3]) { if (top < 0) top = y; bot = y; } return top < 0 ? 0 : bot - top + 1; }));
}

/** 모든 프레임에서 빈 위·아래 줄을 같이 잘라 낸다(같은 너비 칸 자르기는 그림 높이 전체를 칸으로 쓴다 — 둘째 판 40×107). */
function trimRows(cuts: Buffer[], set: FrameSet): { cuts: Buffer[]; set: FrameSet } {
  const row = set.cellW * 4;
  let top = set.cellH, bot = -1;
  for (const c of cuts) for (let y = 0; y < set.cellH; y++) for (let x = 0; x < set.cellW; x++) if (c[y * row + x * 4 + 3]) { top = Math.min(top, y); bot = Math.max(bot, y); }
  if (bot < 0 || (top === 0 && bot === set.cellH - 1)) return { cuts, set };
  return { cuts: cuts.map((c) => Buffer.from(c.subarray(top * row, (bot + 1) * row))), set: { ...set, cellH: bot - top + 1 } };
}

/** 색 분포(채널당 5단계 → 125칸, 비율). */
const L = 5;
function histOf(px: number[][]): Float64Array {
  const h = new Float64Array(L ** 3);
  for (const p of px) h[Math.min(L - 1, (p[0] * L) >> 8) * L * L + Math.min(L - 1, (p[1] * L) >> 8) * L + Math.min(L - 1, (p[2] * L) >> 8)]++;
  const n = px.length || 1; return h.map((v) => v / n);
}
const overlap = (a: Float64Array, b: Float64Array) => a.reduce((s, v, i) => s + Math.min(v, b[i]), 0);

/** 참조 그림의 색 분포(진짜 도트로 바꾼 뒤, 그림의 40% 넘는 한 색은 배경으로 보고 뺀다) */
async function refHistOf(img: Buffer): Promise<Float64Array> {
  let small: Buffer;
  try { small = (await realDot(img)).small; } catch { small = await sharp(img).resize(64, 64, { fit: "inside", kernel: "nearest" }).png().toBuffer(); }
  const { data } = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px: number[][] = [], cnt = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) { px.push([data[i], data[i + 1], data[i + 2]]); const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > px.length * 0.4) { const bg = [(top[0] >> 16) & 255, (top[0] >> 8) & 255, top[0] & 255]; return histOf(px.filter((p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) >= 30)); }
  return histOf(px);
}

/**
 * 기계 검사(잠금 — 11-24): 프레임 수 = 기대 · 프레임 높이 차 ≤ 15% · **색 분포 겹침**(참조 vs 각 프레임, 최솟값) ≥ 0.70 통과, < 0.50 실패, 사이 애매.
 * 문턱은 6명×6명 표에서 잡았다(engine/work/realdot/motion/hist_matrix.mts): 같은 캐릭터 0.85~0.91(soeun 만 0.35), 다른 캐릭터 최대 0.45.
 * 처음 쓴 "참조 색에 가까운 칸 비율"은 haru 를 taeo 로 통과시켰다(피부·외곽선이 겹쳐 90%) — 버렸다.
 */
export async function machineCheck(set: FrameSet, cuts: Buffer[], want: number, ref: Float64Array): Promise<{ machine: MotionCheck["machine"]; facts: string[]; score: number }> {
  const facts: string[] = [];
  if (set.frames.length !== want) return { machine: "fail", facts: [`프레임 ${set.frames.length}개(기대 ${want})`], score: 0 };
  const hs = cuts.map((c) => { let top = -1, bot = -1; for (let y = 0; y < set.cellH; y++) for (let x = 0; x < set.cellW; x++) if (c[(y * set.cellW + x) * 4 + 3]) { if (top < 0) top = y; bot = y; } return bot - top + 1; });
  const spread = (Math.max(...hs) - Math.min(...hs)) / Math.max(...hs);
  facts.push(`프레임 높이 ${hs.join("/")} (차 ${(spread * 100).toFixed(0)}%)`);
  if (spread > 0.15) return { machine: "fail", facts, score: 0 };
  const ov = cuts.map((c) => { const px: number[][] = []; for (let i = 0; i < c.length; i += 4) if (c[i + 3]) px.push([c[i], c[i + 1], c[i + 2]]); return overlap(ref, histOf(px)); });
  const score = Math.min(...ov);
  facts.push(`참조와 색 분포 겹침 ${ov.map((v) => v.toFixed(2)).join("/")}`);
  return { machine: score >= 0.7 ? "pass" : score < 0.5 ? "fail" : "unsure", facts, score };
}

type Drawer = (refDataUrl: string, prompt: string) => Promise<{ png: Buffer; usd: number }>;

async function openaiDrawer(): Promise<Drawer> {
  const { createImageProvider } = await import("@/lib/providers/images");
  const { costOf } = await import("@/lib/costs/pricing");
  const p = createImageProvider("gpt-image-2.5-flare");
  return async (ref, prompt) => {
    // 11-25 "실패는 고치고 비싸게 받자": low 는 선이 흐려 1배로 옮길 때 몸에 검은 점이 박혔다(용 4방향) → medium(값은 재서 적는다)
    const r = await p.edit(ref, prompt, "1536x1024", (process.env.PIXEL_MOTION_QUALITY as "low" | "medium" | "high" | undefined) ?? "medium");
    return { png: Buffer.from(r.dataUrl.split(",")[1], "base64"), usd: costOf({ backend: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens }) };
  };
}
const mockDrawer = (path: string): Drawer => async () => ({ png: readFileSync(path), usd: 0 });

async function judgeSame(ref: Buffer, sheet: Buffer): Promise<{ same: boolean; confidence: number; why: string; usd: number } | null> {
  if (process.env.PIXEL_MOTION_MOCK) return null; // 목에서는 판단자도 안 부른다(돈 0)
  try {
    const { createOpenAIProvider } = await import("@/lib/providers/openai");
    const { costOf } = await import("@/lib/costs/pricing");
    const ai = createOpenAIProvider({ judgmentModel: "gpt-5.6-luna" });
    const b64 = async (b: Buffer) => (await sharp(b).resize(512, 512, { fit: "inside", kernel: "nearest" }).png().toBuffer()).toString("base64");
    const r = await ai.generateStructuredOutput({
      systemInstructions: "Image 1 is a reference character. Image 2 is a pixel-art animation sheet. Is every frame in image 2 clearly the SAME character (same hair, face, outfit, colors)? Pose differences are expected. Give confidence 0-1.",
      input: "Answer for the whole sheet.",
      images: [await b64(ref), await b64(sheet)],
      schema: z.object({ same: z.boolean(), confidence: z.number(), why: z.string() }), schemaName: "same_character", maxTokens: 16000, tier: "judgment",
    });
    return { ...r.output, usd: costOf({ backend: r.model, inputTokens: r.inputTokens ?? 0, outputTokens: r.outputTokens ?? 0 }) };
  } catch { return null; }
}

/**
 * 11-25 사장님 "판단자가 자를 때 생성자랑 협업하면 자를 때 좋아지지": 판단자가 **자르는 자리에 들어온다.**
 * 기계가 자른 후보 둘(A = 덩어리로 자동, B = 같은 너비 칸)과 AI 원본을 보고 더 잘 자른 쪽을 고른다.
 * 같은 캐릭터인지, (4방향이면) 프레임마다 방향이 맞는지도 같이 본다. 판단자는 **문이 아니라 고르는 자리** —
 * 판단자가 없으면(목·오류) 기계 판정대로 간다. 값은 한 번에 약 1원(luna).
 */
const DIRS = ["front (facing the viewer)", "side view facing RIGHT", "back view", "side view facing LEFT"];
export type CutJudge = { pick: "A" | "B" | "neither"; same: boolean; confidence: number; badFrames: number[]; why: string; usd: number };
async function judgeCut(ref: Buffer, raw: Buffer, a: Buffer | null, b: Buffer | null, motion: MotionKey): Promise<CutJudge | null> {
  if (process.env.PIXEL_MOTION_MOCK && !process.env.PIXEL_JUDGE_LIVE) return null; // 목에서는 안 부른다 — 이미 산 원본으로 판단자만 잴 때 PIXEL_JUDGE_LIVE=1
  try {
    const { createOpenAIProvider } = await import("@/lib/providers/openai");
    const { costOf } = await import("@/lib/costs/pricing");
    const ai = createOpenAIProvider({ judgmentModel: "gpt-5.6-luna" });
    const png = async (x: Buffer, w: number) => (await sharp(x).flatten({ background: "#ffffff" }).resize(w, w, { fit: "inside", kernel: "nearest" }).png().toBuffer()).toString("base64");
    const blank = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const dirQ = motion === "turn" ? ` Frames should face, in order: ${DIRS.join(", ")}. List in badFrames the 1-based numbers of frames (in the picked sheet) whose facing is wrong.` : " badFrames: 1-based numbers of frames that are broken (missing body parts, extra pieces, or a different character).";
    const r = await ai.generateStructuredOutput({
      systemInstructions: "You check sprite-sheet cutting. Image 1: the reference character. Image 2: the original AI drawing (a row of frames). Image 3: cut result A. Image 4: cut result B (a blank square means that cut failed). " +
        "Pick the cut that keeps every frame whole (no missing horns/wings/tail, no pieces of neighbouring frames, no leftover background) and in the right order; 'neither' if both are bad. " +
        "Also say whether the frames are the SAME character as the reference (pose and facing differences are expected), with confidence 0-1." + dirQ,
      input: "Judge the cuts.",
      images: [await png(ref, 384), await png(raw, 768), await png(a ?? blank, 768), await png(b ?? blank, 768)],
      schema: z.object({ pick: z.enum(["A", "B", "neither"]), same: z.boolean(), confidence: z.number(), badFrames: z.array(z.number()), why: z.string() }),
      schemaName: "cut_judge", maxTokens: 16000, tier: "judgment",
    });
    return { ...r.output, usd: costOf({ backend: r.model, inputTokens: r.inputTokens ?? 0, outputTokens: r.outputTokens ?? 0 }) };
  } catch { return null; }
}

/** 손님이 쓴 동작 글: 한 줄 · 120자 · 제어문자 없음 */
export const cleanAction = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

export async function makeMotion(ref: Buffer, motion: MotionKey, o: { colors?: number; maxTries?: number; action?: string } = {}): Promise<MotionResult> {
  const M = MOTIONS[motion];
  const act = motion === "custom" ? cleanAction(o.action ?? "") : "";
  if (motion === "custom" && !act) return { ok: false, reason: "동작을 글로 적어 주세요.", tries: 0, usd: 0 };
  const how = motion === "custom" ? `a 4-step animation of this action: ${act}` : M.prompt;
  const draw = process.env.PIXEL_MOTION_MOCK ? mockDrawer(process.env.PIXEL_MOTION_MOCK) : await openaiDrawer();
  // 작은 도트(예: 글로 만든 32px)는 그림 AI 가 못 알아본다 → 한 색 배경에 얹어 512 언저리로 nearest 확대
  const meta = await sharp(ref).metadata();
  const long = Math.max(meta.width ?? 0, meta.height ?? 0);
  const refPng = long && long < 256
    ? await sharp(ref).flatten({ background: BG }).resize({ width: Math.round((meta.width ?? 1) * Math.ceil(512 / long)), kernel: "nearest" }).png().toBuffer()
    : await sharp(ref).png().toBuffer();
  const refUrl = "data:image/png;base64," + refPng.toString("base64");
  const refH = await refHistOf(refPng);
  // 11-25: 1배 참조(글로 만든 캐릭터)의 키(칸) — 4방향이 63칸 용을 41칸으로 줄여 그렸다 → 같은 칸 크기로 그리라고 숫자로 준다
  let refCells = 0;
  if (long && long < 256) { const t = await sharp(ref).trim().metadata().catch(() => null); refCells = t?.height ?? 0; }
  const prompt = [
    "Use the reference image as the character. Keep EXACTLY the same character: same face, hair, outfit, colors and proportions.",
    `Draw a pixel-art sprite sheet: ONE horizontal row of ${M.frames} frames, ${how}.`,
    "All frames the same scale, same baseline, evenly spaced with a clear empty gap between frames, full body inside each frame.",
    `Flat solid background color ${BG} everywhere — no gradient, no shadow, no ground, no text, no numbers, no borders or boxes.`,
    "Chunky crisp pixel art with a limited palette.",
    ...(refCells ? [`Keep EXACTLY the same pixel size as the reference: the character is ${refCells} pixels tall in every frame (one reference pixel = one pixel in the sheet). Do not draw it smaller.`] : []),
  ].join(" ");
  let usd = 0, last: MotionCheck | undefined, reason = "", lastRaw: Buffer | undefined;
  const tries = Math.max(1, Math.min(2, o.maxTries ?? 2));
  for (let t = 1; t <= tries; t++) {
    let raw: Buffer;
    try { const d = await draw(refUrl, prompt); raw = d.png; lastRaw = raw; usd += d.usd; }
    catch (e) { reason = `그림 AI 가 거절했어요 (${(e as Error).message.slice(0, 80)})`; break; } // 돈·열쇠 문제는 다시 해도 같다
    let rd: RealDotResult, set: FrameSet, cuts: Buffer[];
    const fixes: string[] = [];
    // 후보 B: 같은 너비 칸으로 자르기(그림 AI 에게 "고르게 띄워" 라고 시켰다) — 자동이 실패하거나 판단자가 더 낫다고 할 때
    let candB: { rd: RealDotResult; set: FrameSet; cuts: Buffer[] } | null = null;
    try {
      // 11-25: 그림 AI 가 배경을 투명으로 돌려줄 때가 있다(둘째 판) — 투명도 배경으로 받는다
      rd = await realDot(raw, { colors: o.colors ?? 32 });
      try { const sb = await findFrames(rd.small, { cols: M.frames, rows: 1 }); candB = { rd, set: sb, cuts: await cutFrames(rd.small, sb, { lockBottom: M.lock ? 0.25 : 0, dropEdgeBits: true }) }; } catch { /* B 없음 */ }
      try { set = await findFrames(rd.small, { clearBg: true }); }
      catch (e) { if (!candB) throw e; set = candB.set; fixes.push("자동 나누기 실패 → 같은 너비 칸으로"); }
      cuts = await cutFrames(rd.small, set, { lockBottom: M.lock ? 0.25 : 0, dropEdgeBits: true });
      // 11-25 예측자 → 판단자 → 고치기(돈 0): 참조 키(refCells)를 미리 안다 = 예측. 읽힌 키가 15% 넘게 다르면
      // 칸 크기를 잘못 읽은 것(용 4방향: 63칸 → 41칸, 몸에 검은 점) → 예측 주기 근처에서 **진짜 봉우리를 다시 찾는다**(강제 아님).
      // 다시 읽은 쪽이 예측에 더 가깝고 프레임 수가 맞을 때만 바꾼다.
      const hNow = heightOf(cuts, set);
      if (refCells && Math.abs(hNow - refCells) / refCells > 0.15) {
        const pred = (rd.period[0] * hNow) / refCells;
        try {
          const rd2 = await realDot(raw, { colors: o.colors ?? 32, near: pred });
          const set2 = await findFrames(rd2.small, { clearBg: true });
          const cuts2 = await cutFrames(rd2.small, set2, { lockBottom: M.lock ? 0.25 : 0, dropEdgeBits: true });
          const h2 = heightOf(cuts2, set2);
          if (set2.frames.length === M.frames && Math.abs(h2 - refCells) < Math.abs(hNow - refCells)) {
            fixes.push(`예측 키 ${refCells}칸 · 처음 ${hNow}칸(주기 ${rd.period[0]}) → 다시 읽어 ${h2}칸(주기 ${rd2.period[0]})`);
            rd = rd2; set = set2; cuts = cuts2;
          } else fixes.push(`예측 키 ${refCells}칸 · 읽힌 키 ${hNow}칸 — 다시 읽어도 안 나아짐(${h2}칸)`);
        } catch { fixes.push(`예측 키 ${refCells}칸 · 읽힌 키 ${hNow}칸 — 다시 읽기 실패`); }
      }
      // 예측자가 칸 크기를 고쳤으면 후보 B 도 고친 칸으로 다시 자른다(둘째 판: 판단자가 B 를 골랐는데 B 가 고치기 전 46칸이었다)
      if (candB && candB.rd !== rd) {
        try { const sb = await findFrames(rd.small, { cols: M.frames, rows: 1 }); candB = { rd, set: sb, cuts: await cutFrames(rd.small, sb, { lockBottom: M.lock ? 0.25 : 0, dropEdgeBits: true }) }; } catch { /* 옛 B 그대로 */ }
      }
    } catch (e) { reason = (e as Error).message; last = { machine: "fail", facts: [reason], action: "escalate" }; continue; }
    // 판단자가 자르는 자리에: A(자동·예측자 고침) vs B(같은 너비) 를 원본과 견줘 고른다
    const cj = await judgeCut(refPng, raw, set.frames.length === M.frames ? await sheetOf(cuts, set) : null, candB ? await sheetOf(candB.cuts, candB.set) : null, motion);
    if (cj) {
      usd += cj.usd;
      if (cj.pick === "B" && candB) { rd = candB.rd; ({ set, cuts } = trimRows(candB.cuts, candB.set)); fixes.push("판단자: 같은 너비 칸이 더 잘 잘렸다"); }
      fixes.push(`판단자: ${cj.pick} · 같은 캐릭터 ${cj.same ? "예" : "아니오"}(${cj.confidence.toFixed(2)})${cj.badFrames.length ? ` · 틀린 프레임 ${cj.badFrames.join(",")}` : ""}`);
    }
    const mc = await machineCheck(set, cuts, M.frames, refH);
    mc.facts.unshift(...fixes);
    let judge: MotionCheck["judge"];
    if (cj) judge = { same: cj.same, confidence: cj.confidence, why: cj.why };
    else if (mc.machine === "unsure") {
      const j = await judgeSame(refPng, await sheetOf(cuts, set));
      if (j) { usd += j.usd; judge = { same: j.same, confidence: j.confidence, why: j.why }; }
    }
    // 판단자가 확신(≥0.7)하고 "둘 다 못 잘랐다 · 다른 캐릭터 · 방향 틀림" 이면 기계가 통과시켜도 받지 않는다(다시 그리기로)
    const judgeNo = !!cj && cj.confidence >= 0.7 && (cj.pick === "neither" || !cj.same || cj.badFrames.length > 0);
    if (judgeNo) mc.machine = "fail";
    const conf = judge ? (judge.same ? judge.confidence : 0) : undefined;
    const g = checkGate([], { kind: "pixel-motion", seat: "gpt-5.6-luna" }, conf, mc.machine === "unsure" ? undefined : mc.machine);
    last = { machine: mc.machine, facts: mc.facts, judge, action: g.action };
    if (g.action === "accept") return { ok: true, set, cuts, rd, raw, tries: t, usd, check: last };
    reason = mc.facts.join(" · ");
  }
  return { ok: false, reason: reason || "같은 캐릭터로 못 그렸어요.", tries, usd, check: last, raw: lastRaw };
}

export { gifOf, sheetOf, histOf };
