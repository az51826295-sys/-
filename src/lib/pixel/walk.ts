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
import { hybridWalk, rigWalk, type RigWalk } from "./rigwalk";

export type WalkResult = RigWalk & { usd: number; tries: number; how: "hybrid" | "code"; spreadDiff: number };

export async function makeWalk(basePng: Buffer, o: { maxTries?: number; bob?: boolean } = {}): Promise<WalkResult> {
  const { data, info } = await sharp(basePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const base = { data, w: info.width, h: info.height };
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
  const ACTION = "walking toward the viewer with big, clearly visible steps — frame 1: left foot stepping forward and outward, knee bent; frame 2: legs passing together, one foot lifted; frame 3: right foot stepping forward and outward, knee bent; frame 4: legs passing together, other foot lifted. The legs must visibly change in every frame.";
  let best: WalkResult | null = null;
  for (let t = 1; t <= Math.max(1, Math.min(3, o.maxTries ?? 3)); t++) {
    tries = t;
    const m = await makeMotion(basePng, "custom", { action: ACTION, frames: 4, noCalm: true, maxTries: 1 });
    usd += m.usd;
    if (!m.ok) { facts.push(`${t}판 그림 실패: ${m.reason.slice(0, 80)}`); continue; }
    // 4장 각각의 발 폭(기본 그림에 붙인 뒤)으로 가장 크게 벌린 장을 찾는다
    const full = hybridWalk(base, m.cuts, m.set.cellW, m.set.cellH);
    if (!full || !full.frames.length) { facts.push(`${t}판 섞기 실패: ${full?.facts.join(" · ") ?? ""}`); continue; }
    const sp = spreadsOf(full.frames, info.width, info.height);
    const w = sp.indexOf(Math.max(...sp));
    const half = [w, (w + 1) % 4, (w + 3) % 4];
    const h = hybridWalk(base, half.map((i) => m.cuts[i]), m.set.cellW, m.set.cellH, { mirrorHalf: true });
    if (!h || !h.frames.length) { facts.push(`${t}판 반 바퀴 섞기 실패`); continue; }
    const hs = half.map((i) => sp[i]), diff = Math.max(...hs) - Math.min(...hs);
    facts.push(`${t}판 발 폭 ${sp.join("/")} → 반 바퀴 ${half.map((i) => i + 1).join(",")} 변화 ${diff}칸(문 ${need}칸) · $${m.usd.toFixed(4)}`);
    const r: WalkResult = { ...h, facts: [...facts, ...h.facts], usd, tries: t, how: "hybrid", spreadDiff: diff };
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

function spreadsOf(frames: Buffer[], W: number, H: number): number[] {
  return frames.map((f) => {
    let bot = -1; for (let y = H - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3]) { bot = y; break; }
    let l = 1e9, r = -1; for (let y = Math.max(0, bot - 2); y <= bot; y++) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3]) { l = Math.min(l, x); r = Math.max(r, x); }
    return r - l + 1;
  });
}
