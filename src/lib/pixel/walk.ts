/**
 * 걷기 만들기(11-26, 라이벌 픽셀랩 측정 뒤 정한 방식).
 *
 *   ① 그림 AI 가 4장 한 바퀴를 그린다(다리만 쓸 것이라 날것으로 받는다 — noCalm)
 *   ② 다리 띠만 떼어 기본 그림에 붙인다(hybridWalk): 머리·몸·소품은 기본 그림 그대로 → 얼굴 바뀜 0%, 검·방패 안 사라짐
 *   ③ 반 바퀴 3장 = [가장 크게 벌린 장, 그다음 장, 그 뒤 두 번째 장] — 건너뛴 한 장(반대 발 내딛기)은 좌우 뒤집기가 채운다 → 6장, 좌우 같은 걸음
 *   ④ **다리 문**: 반 바퀴의 발 폭 변화가 키의 1/9(최소 4칸)보다 작으면 다리가 안 움직인 것 → 다시 그린다(최대 3판)
 *      11-26 기사: 4장 판 = 변화 9칸(통과), 반 바퀴 3장을 따로 시킨 판 = 2칸(그림 AI 가 다리를 거의 안 움직였다)
 *   ⑤ 끝까지 안 되면 / 다리 틈이 없는 그림(슬라임·박쥐·발까지 덮는 로브)은 코드 걷기(rigWalk) — 손님에게 실패를 주지 않는다
 */
import sharp from "sharp";
import { makeMotion } from "./motion";
import { hybridWalk, lowerSymmetry, rigWalk, type RigWalk } from "./rigwalk";

/**
 * 바깥 기준: 픽셀랩 정면 걷기(기사, 11-26 체험) — 키 52칸 · 발 폭 7/17/8/7/7/7 → 변화 10칸 = 키 × 0.192 (engine/work/realdot/motion/rival_gate.mts).
 * 문(키/9)은 "안 움직임(0~1칸)"과 "걸음(10칸↑)" 사이 빈 구간에 있어 그대로 두고, 라이벌 대비는 **자로만** 보고한다 —
 * 문을 라이벌 숫자로 올리면 사장님이 통과시킨 8종 중 4종(0.84~0.91배)이 다시 그려진다(판마다 약 25원).
 */
const RIVAL_STEP = 10 / 52;
export type WalkResult = RigWalk & { usd: number; tries: number; how: "hybrid" | "code"; spreadDiff: number; ai?: { cuts: Buffer[]; w: number; h: number } }; // ai: 고른 판의 AI 4장(시험 도구가 이음 줄을 공짜로 다시 재려고)

export async function makeWalk(basePng: Buffer, o: { maxTries?: number; bob?: boolean; aiFrames?: 4 | 8 } = {}): Promise<WalkResult> {
  const { data, info } = await sharp(basePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const base = { data, w: info.width, h: info.height };
  const baseFeet = feetCenters([data], info.width, info.height)[0];
  let usd = 0, tries = 0;
  const facts: string[] = [];
  const code = async (why: string): Promise<WalkResult> => { const r = await rigWalk(basePng, { bob: o.bob }); return { ...r, facts: [...facts, why, ...r.facts], usd, tries, how: "code", spreadDiff: 0 }; };
  if (o.bob) return code("날거나 다리 없는 캐릭터 — 몸 위아래로");
  // 다리 틈이 없으면 AI 를 부르지 않는다(돈 0)
  const probe = hybridWalk(base, [Buffer.from(data)], info.width, info.height);
  if (!probe) return code("다리 틈 없음 — 코드 걷기");
  let top = -1, bot = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3]) { if (top < 0) top = y; bot = y; }
  const need = Math.max(4, Math.round((bot - top + 1) / 9));
  // 11-27 사장님 "프레임도 늘리자": AI 8장 한 바퀴 → 반 바퀴 4장 + 다리만 뒤집기 4장 = 8장(PIXEL_WALK_AI_FRAMES=8 로 시험 중, 기본 4 → 6장)
  const AIN = Number(o.aiFrames ?? process.env.PIXEL_WALK_AI_FRAMES ?? 4) === 8 ? 8 : 4;
  const ACTION = AIN === 8
    ? "walking toward the viewer with big, clearly visible steps, 8 evenly spaced phases — frame 1: left foot planted forward and outward; frame 2: body lowers, weight on the left foot; frame 3: right foot lifts and swings past; frame 4: right foot reaching forward; frame 5: right foot planted forward and outward; frame 6: body lowers, weight on the right foot; frame 7: left foot lifts and swings past; frame 8: left foot reaching forward. The legs must visibly change in every frame."
    : "walking toward the viewer with big, clearly visible steps — frame 1: left foot stepping forward and outward, knee bent; frame 2: legs passing together, one foot lifted; frame 3: right foot stepping forward and outward, knee bent; frame 4: legs passing together, other foot lifted. The legs must visibly change in every frame.";
  let best: WalkResult | null = null;
  for (let t = 1; t <= Math.max(1, Math.min(3, o.maxTries ?? 3)); t++) {
    tries = t;
    const m = await makeMotion(basePng, "custom", { action: ACTION, frames: AIN, noCalm: true, maxTries: 1 });
    usd += m.usd;
    if (!m.ok) { facts.push(`${t}판 그림 실패: ${m.reason.slice(0, 80)}`); continue; }
    // 4장 각각의 발 폭(기본 그림에 붙인 뒤)으로 가장 크게 벌린 장을 찾는다
    const full = hybridWalk(base, m.cuts, m.set.cellW, m.set.cellH);
    if (!full || !full.frames.length) { facts.push(`${t}판 섞기 실패: ${full?.facts.join(" · ") ?? ""}`); continue; }
    const sp = spreadsOf(full.frames, info.width, info.height);
    // 11-27 덮인 다리(망토·긴 옷): 허리 아래를 통째로 가져오므로 좌우 뒤집기를 하면 지팡이 아랫부분만 반대쪽으로 넘어간다(마법사 4번 장)
    // → 뒤집지 않고 AI 가 그린 한 바퀴 4장을 그대로 쓴다
    // 11-27 다섯째: 아랫몸이 좌우 대칭(같은 색 겹침 ≥ 0.8 — 기사왕 0.94, 지팡이 마법사 0.44)이면 뒤집어도 소품이 안 넘어간다 → 아래 반 바퀴+뒤집기 6장으로(걸음이 고르게)
    const sym = lowerSymmetry(base.data, base.w, base.h);
    // 11-27 일곱째: 절뚝 자를 문으로 썼더니 6판 중 4판이 걸리고 다시 그려도 안 풀렸다 → 이제는 다리만 뒤집는 6장(rigwalk mirrorHalf)이 기본, 4장 그대로는 PIXEL_WALK_FOUR=1 일 때만(비교용)
    if (process.env.PIXEL_WALK_FOUR && full.facts.some((f) => f.startsWith("덮인 다리") || f.startsWith("머리만")) && sym < 0.8) {
      const diff = Math.max(...sp) - Math.min(...sp);
      // 11-27 사장님 "절뚝거려"(마법사): 4장 중 한 발로 선 두 장이 둘 다 왼발이었다(발 중심 43.5·43 / 몸 48.3) — 같은 걸음을 두 번 그린 것.
      // **절뚝 자**: 발 폭이 가장 좁은 두 장의 발 중심이 몸 가운데의 서로 다른 쪽(각각 1칸 이상)이어야 한다. 아니면 다시 그린다.
      const fc = feetCenters(full.frames, info.width, info.height), narrow = [...sp.keys()].sort((a, b) => sp[a] - sp[b]).slice(0, 2);
      const sides = narrow.map((i) => fc[i] - baseFeet);
      const limp = !(sides[0] * sides[1] < 0 && Math.min(Math.abs(sides[0]), Math.abs(sides[1])) >= 1);
      facts.push(`${t}판 발 폭 ${sp.join("/")} → 한 바퀴 4장 그대로(대칭 ${sym.toFixed(2)} < 0.8 — 뒤집기 안 함) 변화 ${diff}칸(문 ${need}칸 · 픽셀랩 대비 ${(diff / ((bot - top + 1) * RIVAL_STEP)).toFixed(2)}배) · 한 발 장 ${narrow.map((i) => i + 1).join(",")} 발 중심 ${sides.map((v) => (v > 0 ? "+" : "") + v.toFixed(1)).join("/")}칸${limp ? " → 절뚝(같은 발)" : " → 번갈아"} · $${m.usd.toFixed(4)}`);
      const r: WalkResult = { ...full, facts: [...facts, ...full.facts], usd, tries: t, how: "hybrid", spreadDiff: limp ? Math.min(diff, need - 1) : diff, ai: { cuts: m.cuts, w: m.set.cellW, h: m.set.cellH } };
      if (!best || r.spreadDiff > best.spreadDiff) best = r;
      if (!limp && diff >= need) return { ...r, usd, tries: t };
      continue;
    }
    const w = sp.indexOf(Math.max(...sp));
    const half = AIN === 8 ? [7, 0, 1, 2].map((d) => (w + d) % 8) : [w, (w + 1) % 4, (w + 3) % 4];
    const h = hybridWalk(base, half.map((i) => m.cuts[i]), m.set.cellW, m.set.cellH, { mirrorHalf: true });
    if (!h || !h.frames.length) { facts.push(`${t}판 반 바퀴 섞기 실패`); continue; }
    const hs = half.map((i) => sp[i]), diff = Math.max(...hs) - Math.min(...hs);
    facts.push(`${t}판 발 폭 ${sp.join("/")} → 반 바퀴 ${half.map((i) => i + 1).join(",")} 변화 ${diff}칸(문 ${need}칸 · 픽셀랩 대비 ${(diff / ((bot - top + 1) * RIVAL_STEP)).toFixed(2)}배) · $${m.usd.toFixed(4)}`);
    const r: WalkResult = { ...h, facts: [...facts, ...h.facts], usd, tries: t, how: "hybrid", spreadDiff: diff, ai: { cuts: m.cuts, w: m.set.cellW, h: m.set.cellH } };
    if (!best || diff > best.spreadDiff) best = r;
    if (diff >= need) return { ...r, usd, tries: t };
  }
  if (best) { best.facts.push(`다리 문(${need}칸)을 ${tries}판 안에 못 넘음 → 가장 많이 움직인 판(${best.spreadDiff}칸)`); return { ...best, usd, tries }; }
  return code(`그림 ${tries}판 모두 실패 — 코드 걷기`);
}

/**
 * 사이트에서 넘어오는 그림은 8배로 키운 것(만들기 결과 big)이다 → 정수배 확대면 1배로 되돌린다(칸마다 한 색인지 확인).
 * 1배 도트(긴 변 ≤ 256)이고 **투명 배경**이 있을 때만 걷기 섞기를 쓸 수 있다 — 아니면 null(옛 길로).
 */
export async function spriteOf(img: Buffer): Promise<Buffer | null> {
  const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let k = 1;
  for (let s = 32; s >= 2; s--) { // 만들기 결과 big 은 768/크기 배(32px → 24배)
    if (W % s || H % s) continue;
    let ok = true;
    for (let y = 0; y < H && ok; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, j = ((y - (y % s)) * W + (x - (x % s))) * 4; if (data.readUInt32LE(i) !== data.readUInt32LE(j)) { ok = false; break; } }
    if (ok) { k = s; break; }
  }
  const w = W / k, h = H / k;
  if (Math.max(w, h) > 256) return null;
  const o = Buffer.alloc(w * h * 4); let clear = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * k * W + x * k) * 4; data.copy(o, (y * w + x) * 4, i, i + 4); if (data[i + 3] === 0) clear++; }
  if (clear < w * h * 0.2) return null; // 배경이 투명하지 않다
  return sharp(o, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/** 장마다 맨 아래 3줄 칠한 칸의 가운데 x(한 발로 선 장이면 그 발 자리) */
function feetCenters(frames: Buffer[], W: number, H: number): number[] {
  return frames.map((f) => {
    let bot = -1; for (let y = H - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3]) { bot = y; break; }
    let s = 0, k = 0; for (let y = Math.max(0, bot - 2); y <= bot; y++) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3]) { s += x; k++; }
    return k ? s / k : W / 2;
  });
}

function spreadsOf(frames: Buffer[], W: number, H: number): number[] {
  return frames.map((f) => {
    let bot = -1; for (let y = H - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3]) { bot = y; break; }
    let l = 1e9, r = -1; for (let y = Math.max(0, bot - 2); y <= bot; y++) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3]) { l = Math.min(l, x); r = Math.max(r, x); }
    return r - l + 1;
  });
}
