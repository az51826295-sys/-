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
    prompt: "the same character seen from 4 directions, standing still: frame 1 front view facing the viewer, frame 2 EXACT side profile facing right (camera at 90 degrees: we see only one eye, the nose points right, the body is narrow), frame 3 back view (we see the back of the head, no face), frame 4 EXACT side profile facing left. Not three-quarter views. Frame 4 is NOT a mirror image of frame 2: the character keeps each item in the same hand as in the reference, so in frame 2 the items held in the character's RIGHT hand are on the near side, and in frame 4 the items held in the character's LEFT hand (e.g. a shield) are on the near side and clearly visible" },
  // 11-27: "(mirror of frame 2)" 라고 시켰더니 왼쪽 모습이 오른쪽을 뒤집은 그림이 돼 기사 방패가 양옆에서 사라졌다(prop_ruler: 금색 1/6 양옆 다 사라짐, 픽셀랩은 왼쪽에서 지킴)
  // 11-26 날갯짓: 그림 AI 를 안 부르고 기본 그림의 날개를 코드가 움직인다(라우트가 makeMotion 전에 가로챈다 — rigWalk bob)
  fly: { ko: "날갯짓", en: "Fly", frames: 6, lock: false, prompt: "flying in place, flapping the wings: wings up, wings level, wings down" },
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

/**
 * 11-25 실패율 자 1바퀴에서 사람 눈이 잡은 것: 걷기에서 캐릭터가 **옆으로 미끄러진다**(토끼 몸 가운데 18.5→12.4칸, 슬라임 5칸).
 * 같은 너비 칸으로 자르면 그림 AI 가 프레임을 고르게 안 띄운 만큼 칸마다 위치가 어긋난다. 판단자·기계 검사 둘 다 못 잡았다.
 * → **윗몸(위 절반) 무게중심**을 1번 프레임에 맞춰 가로로 옮긴다(다리는 걸으며 움직이니 윗몸으로). 칸은 옮긴 만큼 넓힌다.
 */
export function stabilize(cuts: Buffer[], set: FrameSet): { cuts: Buffer[]; set: FrameSet; shifts: number[] } {
  const W = set.cellW, H = set.cellH, half = Math.floor(H / 2);
  const cx = cuts.map((c) => { let sx = 0, n = 0; for (let y = 0; y < half; y++) for (let x = 0; x < W; x++) if (c[(y * W + x) * 4 + 3]) { sx += x; n++; } return n ? sx / n : W / 2; });
  const shifts = cx.map((v) => Math.round(cx[0] - v));
  const pad = Math.max(0, ...shifts.map((v) => Math.abs(v)));
  if (!pad) return { cuts, set, shifts };
  const NW = W + 2 * pad;
  const out = cuts.map((c, f) => {
    const o = Buffer.alloc(NW * H * 4);
    for (let y = 0; y < H; y++) c.copy(o, (y * NW + pad + shifts[f]) * 4, y * W * 4, (y + 1) * W * 4);
    return o;
  });
  return { cuts: out, set: { ...set, cellW: NW }, shifts };
}

/**
 * 11-25 사장님 "동작일 때 어색함이 없어야 돼": 그림 AI 는 프레임마다 캐릭터를 **새로 그린다** → 드워프 걷기에서 수염 결·투구 장식·도끼날이
 * 프레임마다 달라 재생하면 머리가 번쩍였다(어색함 자: 머리 깜빡임 72%). 움직임(다리·팔·무기의 이동)은 덩어리째 옮겨 가고,
 * 다시 그리며 생긴 잡음은 제자리에서 칸 몇 개만 바뀐다 → **둘레 5×5 가 1번 프레임과 거의 같은데 혼자 다른 칸**만 1번 것으로 맞춘다.
 * 위아래 1칸 흔들림(걸음의 출렁임)은 먼저 맞춰 비교한다. 1번 프레임은 건드리지 않는다.
 */
export function calmFrames(cuts: Buffer[], set: FrameSet): { cuts: Buffer[]; changed: number[] } {
  const W = set.cellW, H = set.cellH, base = cuts[0];
  const same = (a: Buffer, i: number, b: Buffer, j: number) => (a[i + 3] > 0) === (b[j + 3] > 0) && (a[i + 3] === 0 || Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2]) <= 60);
  const changed: number[] = [0];
  const out = [base, ...cuts.slice(1).map((c) => {
    // 걸음 출렁임: 위 절반이 가장 잘 맞는 dy(−1·0·+1)
    let dy = 0, bestS = -1;
    for (const t of [-1, 0, 1]) { let sc = 0; for (let y = 0; y < H / 2; y++) { const yb = y + t; if (yb < 0 || yb >= H) continue; for (let x = 0; x < W; x++) if (same(base, (yb * W + x) * 4, c, (y * W + x) * 4)) sc++; } if (sc > bestS) { bestS = sc; dy = t; } }
    const o = Buffer.from(c); let k = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, yb = y + dy; if (yb < 0 || yb >= H) continue; const j = (yb * W + x) * 4;
      if (same(base, j, c, i)) continue;
      let n = 0, eq = 0;
      for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) {
        if (!u && !v) continue; const xx = x + u, yy = y + v, yy2 = yb + v; if (xx < 0 || yy < 0 || xx >= W || yy >= H || yy2 < 0 || yy2 >= H) continue;
        n++; if (same(base, (yy2 * W + xx) * 4, c, (yy * W + xx) * 4)) eq++;
      }
      if (n && eq / n >= 0.75) { base.copy(o, i, j, j + 4); k++; }
    }
    changed.push(k);
    return o;
  })];
  return { cuts: out, changed };
}

/** 위 35%(머리)가 이웃 프레임과 바뀐 칸 비율의 최댓값 — 위아래 1칸 출렁임은 빼고. 어색함 자(engine/tools/motion_feel.mts)와 같은 셈 */
export function headFlicker(cuts: Buffer[], set: FrameSet): number {
  const W = set.cellW, H = set.cellH, top = Math.max(1, Math.floor(H * 0.35));
  const d = (a: Buffer, b: Buffer) => { let best = 1; for (const sh of [-1, 0, 1]) { let n = 0, k = 0; for (let y = 0; y < top; y++) { const yb = y + sh; if (yb < 0 || yb >= H) continue; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, j = (yb * W + x) * 4; const ua = a[i + 3] > 0, ub = b[j + 3] > 0; if (!ua && !ub) continue; n++; if (ua !== ub || Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2]) > 60) k++; } } if (n) best = Math.min(best, k / n); } return best; };
  let m = 0; for (let f = 0; f < cuts.length; f++) m = Math.max(m, d(cuts[f], cuts[(f + 1) % cuts.length]));
  return m;
}

/**
 * 걷기 **윗몸 고정**(11-25): 드워프 걷기는 수염·투구·도끼를 프레임마다 통째로 다르게 그려 잡음 맞춤(calmFrames)으로도 72% 깜빡였다.
 * 걷기에서 움직여야 하는 건 다리다 → 머리 깜빡임이 25% 를 넘으면 윗몸은 1번 프레임 것, 다리는 각 프레임 것.
 * 잇는 줄: 키의 45~65% 사이에서 두 프레임이 가장 비슷한 줄(허리). 위아래 출렁임(−1·0·+1)은 그 프레임 다리에 맞춘다.
 */
export function lockUpper(cuts: Buffer[], set: FrameSet): { cuts: Buffer[]; seams: number[] } {
  const W = set.cellW, H = set.cellH, base = cuts[0], row = W * 4;
  const rowDiff = (a: Buffer, ya: number, b: Buffer, yb: number) => { let k = 0; for (let x = 0; x < W; x++) { const i = ya * row + x * 4, j = yb * row + x * 4; if ((a[i + 3] > 0) !== (b[j + 3] > 0) || (a[i + 3] && Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2]) > 60)) k++; } return k; };
  const seams: number[] = [0];
  const out = [base, ...cuts.slice(1).map((c) => {
    // 11-25: 0.45~0.65 에서 가장 비슷한 줄을 고르니 드워프 허리띠·앞치마가 프레임마다 바뀐 채 남았다 →
    // 0.5~0.75 에서 후보를 모으고, 가장 싼 값에 가까운(+W×10%) 줄 중 **가장 아래** 줄로 잇는다(윗몸을 최대한 고정)
    const cand: { cost: number; y: number; dy: number }[] = [];
    for (const dy of [-1, 0, 1]) for (let y = Math.floor(H * 0.5); y <= Math.floor(H * 0.75); y++) {
      const yb = y - dy; if (yb < 0 || yb >= H) continue;
      cand.push({ cost: rowDiff(base, yb, c, y) + rowDiff(base, Math.min(H - 1, yb + 1), c, Math.min(H - 1, y + 1)), y, dy });
    }
    const minC = Math.min(...cand.map((v) => v.cost));
    const best = cand.filter((v) => v.cost <= minC + Math.max(2, W * 0.1)).reduce((a, b) => (b.y > a.y || (b.y === a.y && b.cost < a.cost) ? b : a), { cost: Infinity, y: Math.floor(H * 0.55), dy: 0 });
    const o = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) {
      if (y < best.y) { const yb = y - best.dy; if (yb >= 0 && yb < H) base.copy(o, y * row, yb * row, (yb + 1) * row); }
      else c.copy(o, y * row, y * row, (y + 1) * row);
    }
    seams.push(best.y);
    return o;
  })];
  return { cuts: out, seams };
}

/**
 * 11-25 실패율 자 6바퀴: 내 게임 그림체 여학생(게임 색 15개로 맞춘 캐릭터)의 4방향이 게임 색이 아닌 색으로 그려져
 * 기계가 "다른 색"(겹침 0.28~0.46)으로 떨어뜨렸다(판단자는 같은 캐릭터 0.99). → 동작 프레임을 **참조 캐릭터의 색**으로 맞춘다.
 * 가까운 색(거리 ≤ 60)만 — 화살·마법 불꽃처럼 새로 생긴 색은 그대로 둔다. 참조가 1배 작은 도트(색 64개 이하)일 때만.
 */
export async function refPalette(ref: Buffer): Promise<number[][] | null> {
  const { data, info } = await sharp(ref).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (Math.max(info.width, info.height) >= 256) return null;
  const set = new Map<number, number[]>();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) set.set((data[i] << 16) | (data[i + 1] << 8) | data[i + 2], [data[i], data[i + 1], data[i + 2]]);
  return set.size && set.size <= 64 ? [...set.values()] : null;
}
export function snapFrames(cuts: Buffer[], pal: number[][]): number {
  let k = 0;
  for (const c of cuts) for (let i = 0; i < c.length; i += 4) {
    if (!c[i + 3]) continue;
    let best = pal[0], bd = Infinity;
    for (const p of pal) { const d = Math.abs(c[i] - p[0]) + Math.abs(c[i + 1] - p[1]) + Math.abs(c[i + 2] - p[2]); if (d < bd) { bd = d; best = p; } }
    if (bd > 0 && bd <= 60) { c[i] = best[0]; c[i + 1] = best[1]; c[i + 2] = best[2]; k++; }
  }
  return k;
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
export async function machineCheck(set: FrameSet, cuts: Buffer[], want: number, ref: Float64Array, useMean = false): Promise<{ machine: MotionCheck["machine"]; facts: string[]; score: number }> {
  const facts: string[] = [];
  if (set.frames.length !== want) return { machine: "fail", facts: [`프레임 ${set.frames.length}개(기대 ${want})`], score: 0 };
  const hs = cuts.map((c) => { let top = -1, bot = -1; for (let y = 0; y < set.cellH; y++) for (let x = 0; x < set.cellW; x++) if (c[(y * set.cellW + x) * 4 + 3]) { if (top < 0) top = y; bot = y; } return bot - top + 1; });
  const spread = (Math.max(...hs) - Math.min(...hs)) / Math.max(...hs);
  facts.push(`프레임 높이 ${hs.join("/")} (차 ${(spread * 100).toFixed(0)}%)`);
  if (spread > 0.15) return { machine: "fail", facts, score: 0 };
  const ov = cuts.map((c) => { const px: number[][] = []; for (let i = 0; i < c.length; i += 4) if (c[i + 3]) px.push([c[i], c[i + 1], c[i + 2]]); return overlap(ref, histOf(px)); });
  // 11-25: 4방향은 뒤 그림 색이 원래 다르다(고양이 요리사 뒤 0.45, 판단자는 같은 캐릭터 0.99) → 평균으로. 다른 동작은 최솟값 그대로
  const score = useMean ? ov.reduce((a, b) => a + b, 0) / ov.length : Math.min(...ov);
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
    const r = await p.edit(ref, prompt, "1536x1024", (process.env.PIXEL_MOTION_QUALITY as "low" | "medium" | "high" | undefined) ?? "medium"); // 11-25 사장님 "미디움이 제일 좋고"
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
export type CutJudge = { pick: "A" | "B" | "neither"; same: boolean; confidence: number; badFrames: number[]; profileOk: boolean; missing: string[]; fix: string; why: string; usd: number };
async function judgeCut(ref: Buffer, raw: Buffer, a: Buffer | null, b: Buffer | null, motion: MotionKey): Promise<CutJudge | null> {
  if (process.env.PIXEL_MOTION_MOCK && !process.env.PIXEL_JUDGE_LIVE) return null; // 목에서는 안 부른다 — 이미 산 원본으로 판단자만 잴 때 PIXEL_JUDGE_LIVE=1
  try {
    const { createOpenAIProvider } = await import("@/lib/providers/openai");
    const { costOf } = await import("@/lib/costs/pricing");
    const ai = createOpenAIProvider({ judgmentModel: "gpt-5.6-luna" });
    const png = async (x: Buffer, w: number) => (await sharp(x).flatten({ background: "#ffffff" }).resize(w, w, { fit: "inside", kernel: "nearest" }).png().toBuffer()).toString("base64");
    const blank = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const dirQ = motion === "turn"
      ? ` Frames should face, in order: ${DIRS.join(", ")}. List in badFrames the 1-based numbers of frames (in the picked sheet) whose facing is wrong. ` +
        "profileOk: are frames 2 and 4 TRUE side profiles (camera at 90 degrees, only one eye visible, narrow body) and not three-quarter views? " +
        "fix: if anything is wrong, ONE short instruction to the artist for the redraw (e.g. 'frame 2 is a three-quarter view: turn it to an exact side profile facing right'); empty if all good."
      : " badFrames: 1-based numbers of frames that are broken (missing body parts, extra pieces, or a different character). profileOk: true. fix: one short instruction to the artist if something is wrong, else empty.";
    const r = await ai.generateStructuredOutput({
      systemInstructions: "You check sprite-sheet cutting. Image 1: the reference character. Image 2: the original AI drawing (a row of frames). Image 3: cut result A. Image 4: cut result B (a blank square means that cut failed). " +
        "Pick the cut that keeps every frame whole (no missing horns/wings/tail, no pieces of neighbouring frames, no leftover background) and in the right order; 'neither' if both are bad. " +
        "Also say whether the frames are the SAME character as the reference (pose and facing differences are expected), with confidence 0-1. " +
        "missing: items the reference holds or wears (weapon, tool, staff, hat, cape, bag...) that are ABSENT from any frame of the picked sheet (an item hidden behind the body in a back or side view is NOT missing); empty list if none." + dirQ,
      input: "Judge the cuts.",
      images: [await png(ref, 384), await png(raw, 768), await png(a ?? blank, 768), await png(b ?? blank, 768)],
      schema: z.object({ pick: z.enum(["A", "B", "neither"]), same: z.boolean(), confidence: z.number(), badFrames: z.array(z.number()), profileOk: z.boolean(), missing: z.array(z.string()), fix: z.string(), why: z.string() }),
      schemaName: "cut_judge", maxTokens: 16000, tier: "judgment",
    });
    return { ...r.output, usd: costOf({ backend: r.model, inputTokens: r.inputTokens ?? 0, outputTokens: r.outputTokens ?? 0 }) };
  } catch { return null; }
}

/** 11-25: 그림 AI 거절을 손님 말로 — 안전 거절이면 "유명 캐릭터·실존 인물·위험한 내용" 안내(스파이더맨이 400 으로 막혔다) */
export function refusedWhy(e: Error): string {
  const m = e.message ?? "";
  if (/safety|rejected|content_policy|moderation/i.test(m)) return "유명 캐릭터·실존 인물 이름이나 위험한 내용은 그림 AI 가 그리지 않아요. 직접 지은 캐릭터로 적어 주세요.";
  // 11-27: 서버 열쇠가 틀렸을 때(401) 손님 화면에 "Incorrect API key provided: sk-proj-***" 가 그대로 떴다 — 우리 쪽 고장은 손님 탓처럼 보이면 안 되고 열쇠 모양도 내보내지 않는다
  if (/\b40[123]\b|\b429\b|api[ _-]?key|quota|billing|insufficient|unauthori[sz]ed|authentication/i.test(m)) { console.error(`[pixel] 그림 AI 서버 쪽 막힘: ${m.slice(0, 200)}`); return "지금 그림 AI 쪽에 문제가 있어 못 그렸어요 — 저희 쪽 문제예요. 곧 고칠게요."; }
  return `그림 AI 가 거절했어요 (${m.replace(/sk-[\w*-]+/g, "").slice(0, 80)})`;
}

/** 손님이 쓴 동작 글: 한 줄 · 120자 · 제어문자 없음 */
export const cleanAction = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

export async function makeMotion(ref: Buffer, motion: MotionKey, o: { colors?: number; maxTries?: number; action?: string; frames?: number; noCalm?: boolean } = {}): Promise<MotionResult> {
  const M = { ...MOTIONS[motion], frames: o.frames ?? MOTIONS[motion].frames }; // 11-26: 섞어 걷기는 반 바퀴 3장만 그린다(나머지는 좌우 뒤집기)
  const act = motion === "custom" ? cleanAction(o.action ?? "") : "";
  if (motion === "custom" && !act) return { ok: false, reason: "동작을 글로 적어 주세요.", tries: 0, usd: 0 };
  const how = motion === "custom" ? `a ${M.frames}-step animation of this action: ${act}` : M.prompt;
  const draw = process.env.PIXEL_MOTION_MOCK ? mockDrawer(process.env.PIXEL_MOTION_MOCK) : await openaiDrawer();
  // 작은 도트(예: 글로 만든 32px)는 그림 AI 가 못 알아본다 → 한 색 배경에 얹어 512 언저리로 nearest 확대
  const meta = await sharp(ref).metadata();
  const long = Math.max(meta.width ?? 0, meta.height ?? 0);
  const refPng = long && long < 256
    ? await sharp(ref).flatten({ background: BG }).resize({ width: Math.round((meta.width ?? 1) * Math.ceil(512 / long)), kernel: "nearest" }).png().toBuffer()
    : await sharp(ref).png().toBuffer();
  const refUrl = "data:image/png;base64," + refPng.toString("base64");
  const refH = await refHistOf(refPng);
  const refPal = await refPalette(ref);
  // 11-25: 1배 참조(글로 만든 캐릭터)의 키(칸) — 4방향이 63칸 용을 41칸으로 줄여 그렸다 → 같은 칸 크기로 그리라고 숫자로 준다
  let refCells = 0;
  // 투명 칸을 빼고 직접 센다 — sharp trim().metadata() 는 잘라 낸 크기가 아니라 원래 크기(64)를 돌려줬다(11-25 마법사: 46칸인데 "예측 64")
  if (long && long < 256) {
    const { data, info } = await sharp(ref).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let top = -1, bot = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] >= 128) { if (top < 0) top = y; bot = y; }
    refCells = top < 0 ? 0 : bot - top + 1;
  }
  const prompt = [
    "Use the reference image as the character. Keep EXACTLY the same character: same face, hair, outfit, colors and proportions.",
    `Draw a pixel-art sprite sheet: ONE horizontal row of ${M.frames} frames, ${how}.`,
    "All frames the same scale, same baseline, evenly spaced with a clear empty gap between frames, full body inside each frame.",
    `Flat solid background color ${BG} everywhere — no gradient, no shadow, no ground, no text, no numbers, no borders or boxes.`,
    "Chunky crisp pixel art with a limited palette.",
    ...(motion !== "turn" ? ["The head, face, hair, headwear and any held item must be pixel-identical in every frame (copy them exactly); only the moving body parts change between frames."] : []),
    ...(refCells ? [`Keep EXACTLY the same pixel size as the reference: the character is ${refCells} pixels tall in every frame (one reference pixel = one pixel in the sheet). Do not draw it smaller.`] : []),
  ].join(" ");
  let usd = 0, last: MotionCheck | undefined, reason = "", lastRaw: Buffer | undefined, feedback = "";
  const tries = Math.max(1, Math.min(2, o.maxTries ?? 2));
  for (let t = 1; t <= tries; t++) {
    let raw: Buffer;
    try { const d = await draw(refUrl, feedback ? `${prompt} FIX FROM THE REVIEWER OF YOUR LAST TRY: ${feedback}` : prompt); raw = d.png; lastRaw = raw; usd += d.usd; }
    catch (e) { reason = refusedWhy(e as Error); break; } // 돈·열쇠 문제는 다시 해도 같다
    let rd: RealDotResult, set: FrameSet, cuts: Buffer[];
    const fixes: string[] = [];
    // 후보 B: 같은 너비 칸으로 자르기(그림 AI 에게 "고르게 띄워" 라고 시켰다) — 자동이 실패하거나 판단자가 더 낫다고 할 때
    let candB: { rd: RealDotResult; set: FrameSet; cuts: Buffer[] } | null = null;
    try {
      // 11-25: 그림 AI 가 배경을 투명으로 돌려줄 때가 있다(둘째 판) — 투명도 배경으로 받는다
      rd = await realDot(raw, { colors: o.colors ?? 32 });
      try { const sb = await findFrames(rd.small, { cols: M.frames, rows: 1, valleys: true }); candB = { rd, set: sb, cuts: await cutFrames(rd.small, sb, { lockBottom: M.lock ? 0.25 : 0, dropEdgeBits: true }) }; } catch { /* B 없음 */ }
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
      // 11-27 4방향 키: 그림 AI 가 정말로 작게 그렸으면(기사 43칸 vs 기본 54칸 — 진짜 봉우리를 찾아도 43) 원본을 **더 촘촘한 격자로 다시 읽는다**.
      // 다 읽은 뒤 nearest 로 키우면(fitTurn 1.26배) 줄·칸이 두 번 찍혀 울퉁불퉁하다. 키가 기본에 ±2칸으로 맞고 프레임 수가 같을 때만 바꾼다. 돈 0.
      if (motion === "turn" && refCells) {
        const hN = heightOf(cuts, set);
        if (hN && Math.abs(hN - refCells) / refCells > 0.05) {
          try {
            const rd3 = await realDot(raw, { colors: o.colors ?? 32, period: (rd.period[0] * hN) / refCells });
            const set3 = await findFrames(rd3.small, { clearBg: true }).catch(() => findFrames(rd3.small, { cols: M.frames, rows: 1, valleys: true }));
            const cuts3 = await cutFrames(rd3.small, set3, { dropEdgeBits: true });
            const h3 = heightOf(cuts3, set3);
            if (set3.frames.length === M.frames && Math.abs(h3 - refCells) <= 2) { fixes.push(`그려진 키 ${hN}칸 → 촘촘한 격자(주기 ${rd.period[0]}→${rd3.period[0]})로 다시 읽어 ${h3}칸(기본 ${refCells}칸)`); rd = rd3; set = set3; cuts = cuts3; }
            else fixes.push(`그려진 키 ${hN}칸 — 촘촘히 다시 읽기 안 맞음(${set3.frames.length}장 · ${h3}칸)`);
          } catch { fixes.push(`그려진 키 ${hN}칸 — 촘촘히 다시 읽기 실패`); }
        }
      }
      // 예측자가 칸 크기를 고쳤으면 후보 B 도 고친 칸으로 다시 자른다(둘째 판: 판단자가 B 를 골랐는데 B 가 고치기 전 46칸이었다)
      if (candB && candB.rd !== rd) {
        try { const sb = await findFrames(rd.small, { cols: M.frames, rows: 1, valleys: true }); candB = { rd, set: sb, cuts: await cutFrames(rd.small, sb, { lockBottom: M.lock ? 0.25 : 0, dropEdgeBits: true }) }; } catch { /* 옛 B 그대로 */ }
      }
    } catch (e) { reason = (e as Error).message; last = { machine: "fail", facts: [reason], action: "escalate" }; continue; }
    // 판단자가 자르는 자리에: A(자동·예측자 고침) vs B(같은 너비) 를 원본과 견줘 고른다
    if (candB && (candB.set.sliced ?? 0) > 0 && set.frames.length === M.frames) { fixes.push(`같은 너비 후보가 자른 줄에 그림 ${candB.set.sliced}칸이 걸침 → 후보에서 뺌`); candB = null; }
    // 프레임끼리 겹쳐 그려졌으면(자동 나누기가 수를 못 맞추고, 같은 너비 후보도 자른 줄에 그림이 걸침 — 악마 걷기 날개) 어디를 잘라도 벤다 → 생성자에게 되돌린다
    if (set.frames.length !== M.frames && candB && (candB.set.sliced ?? 0) > 0 && t < tries) {
      feedback = "Last time neighbouring frames overlapped (wings/arms touched the next frame): leave a WIDE empty gap between frames so no part of one frame touches another, and keep each figure narrower than a quarter of the image width.";
      reason = `프레임끼리 겹쳐 그려짐(자른 줄에 그림 ${candB.set.sliced}칸)`; last = { machine: "fail", facts: [...fixes, reason], action: "escalate" }; continue;
    }
    // 캐릭터가 그림 테두리에 닿아 잘려 그려졌으면 다시 그리기로(마지막 판이면 받는다)
    if (set.touchesBorder && t < tries) { feedback = "Some character was cut off by the image border last time: keep every frame completely inside the image with an empty margin on all sides."; reason = "그림 테두리에 캐릭터가 잘려 그려짐"; last = { machine: "fail", facts: [...fixes, reason], action: "escalate" }; continue; }
    const aSheet = set.frames.length === M.frames ? await sheetOf(cuts, set) : null, bSheet = candB ? await sheetOf(candB.cuts, candB.set) : null;
    const cj = await judgeCut(refPng, raw, aSheet, bSheet, motion);
    // 자동 나누기가 프레임 수를 못 맞췄으면(악마 날개가 붙어 3개) 판단자 없이도 같은 너비 칸으로 — 판단자가 오류여도 손님은 결과를 받는다
    if (!aSheet && candB && (!cj || cj.pick !== "B")) { rd = candB.rd; ({ set, cuts } = trimRows(candB.cuts, candB.set)); fixes.push(`자동 나누기 ${set.frames.length === M.frames ? "" : "프레임 수 어긋남 → "}같은 너비 칸으로`); }
    if (cj) {
      usd += cj.usd;
      if (cj.pick === "B" && candB) { rd = candB.rd; ({ set, cuts } = trimRows(candB.cuts, candB.set)); fixes.push("판단자: 같은 너비 칸이 더 잘 잘렸다"); }
      fixes.push(`판단자: ${cj.pick} · 같은 캐릭터 ${cj.same ? "예" : "아니오"}(${cj.confidence.toFixed(2)})${cj.badFrames.length ? ` · 틀린 프레임 ${cj.badFrames.join(",")}` : ""}${cj.missing.length ? ` · 빠진 소품 ${cj.missing.join(",")}` : ""}`);
    }
    // 참조 색으로 맞추기(색이 프레임마다 흔들리지 않게 · 게임 팔레트 캐릭터는 게임 색 그대로)
    if (refPal && !process.env.PIXEL_NO_SNAP) { const k = snapFrames(cuts, refPal); if (k) fixes.push(`참조 색 ${refPal.length}개로 맞춤 ${k}칸`); }
    // 미끄러짐 잡기(돌기·동작 모두): 윗몸 가운데를 1번 프레임에 맞춘다
    { const st = stabilize(cuts, set); if (st.shifts.some((v) => v)) { cuts = st.cuts; set = st.set; fixes.push(`프레임 가로 맞춤 ${st.shifts.join("/")}칸`); } }
    // 번쩍임 잡기: 동작(걷기·숨쉬기·글로 쓴 동작)만 — 4방향은 프레임마다 다른 모습이 맞다
    if (motion !== "turn" && !(o.noCalm || process.env.PIXEL_NO_CALM)) { const cf = calmFrames(cuts, set); cuts = cf.cuts; if (cf.changed.some((v) => v)) fixes.push(`잡음 칸 맞춤 ${cf.changed.join("/")}칸`); }
    if (motion === "walk" && !(o.noCalm || process.env.PIXEL_NO_CALM)) {
      const hf = headFlicker(cuts, set);
      if (hf > 0.25) { const lu = lockUpper(cuts, set); cuts = lu.cuts; fixes.push(`머리 깜빡임 ${(hf * 100).toFixed(0)}% → 윗몸 고정(잇는 줄 ${lu.seams.slice(1).join("/")}) → ${(headFlicker(cuts, set) * 100).toFixed(0)}%`); }
    }
    const mc = await machineCheck(set, cuts, M.frames, refH, motion === "turn");
    mc.facts.unshift(...fixes);
    let judge: MotionCheck["judge"];
    if (cj) judge = { same: cj.same, confidence: cj.confidence, why: cj.why };
    else if (mc.machine === "unsure") {
      const j = await judgeSame(refPng, await sheetOf(cuts, set));
      if (j) { usd += j.usd; judge = { same: j.same, confidence: j.confidence, why: j.why }; }
    }
    // 판단자가 확신(≥0.7)하고 "둘 다 못 잘랐다 · 다른 캐릭터 · 방향 틀림" 이면 기계가 통과시켜도 받지 않는다(다시 그리기로)
    // 옆모습이 비스듬하면(turn) 다시 그릴 거리 — 다만 마지막 판이면 받는다(손님에게 실패보다 낫다)
    // 11-25 실패율 자 4바퀴: 드워프 4방향에서 도끼가 네 장 다 빠졌는데 "같은 캐릭터" 로 통과 → 빠진 소품도 다시 그릴 거리(마지막 판이면 받는다)
    const says = (c: CutJudge) => c.confidence >= 0.7 && (c.pick === "neither" || !c.same || c.badFrames.length > 0 || (motion === "turn" && !c.profileOk && t < tries) || (c.missing.length > 0 && t < tries));
    let judgeNo = !!cj && says(cj);
    // 11-25 실패율 자: 같은 그림을 세 번 보여 주니 판단자가 한 번만 "4장 다 틀림" 이라 했다(고양이 요리사 걷기) → 막기 전에 **한 번 더 묻고 둘 다 막자고 할 때만** 막는다
    if (cj && judgeNo) {
      const cj2 = await judgeCut(refPng, raw, aSheet, bSheet, motion);
      if (cj2) { usd += cj2.usd; if (!says(cj2)) { judgeNo = false; mc.facts.push("판단자 두 번째 의견: 괜찮다 → 받음"); } else mc.facts.push("판단자 두 번째 의견도: 다시"); }
    }
    if (cj && judgeNo) feedback = ((cj.missing.length ? `Keep these items from the reference in EVERY frame: ${cj.missing.join(", ")}. ` : "") + (cj.fix || cj.why)).slice(0, 300); // 협업: 판단자의 말이 다음 그림으로 간다
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
