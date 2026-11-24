/**
 * AI 동작 생성(src/lib/pixel/motion.ts)의 자 (11-24). **모델 0 · 돈 0** — 그림 AI 대신 목 그림을 "그려 온 것"으로 쓴다.
 *   npx tsx engine/tools/motion_check.mts [--sabotage]
 * 기대(먼저 적음):
 *   ① 참조 taeo · 목 = taeo 4프레임        → 받음, 4프레임, 기계 통과
 *   ② 참조 taeo · 목 = haru 4프레임(다른 애) → 안 받음(같은 캐릭터가 아니다)
 *   ③ 참조 taeo · 목 = nabi strip(붙은 그림) → 안 받음
 * --sabotage: ②를 기계 검사에 넣을 때 참조 분포 자리에 haru 것을 넣는다(검사가 엉뚱한 것과 견주는 고장) → ②의 기대가 깨져야 한다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const SAB = process.argv.includes("--sabotage");
const D = "C:/Users/az518/Desktop/두근도트-시트", W = "engine/work/realdot/motion"; mkdirSync(W, { recursive: true });
// 목 그림: strip 윗줄 앞 4프레임(1536 폭에 6프레임 → 4프레임은 1024 폭)
for (const n of ["taeo", "haru"]) await sharp(`${D}/${n}-strip.png`).extract({ left: 0, top: 0, width: 1024, height: 250 }).png().toFile(`${W}/mock-${n}4.png`);
const { makeMotion, machineCheck, histOf } = await import("../../src/lib/pixel/motion");
let ok = 0, n = 0;
const expect = (name: string, pass: boolean, got: unknown) => { n++; if (pass) ok++; console.log(`${pass ? "✓" : "✗"} ${name}: ${typeof got === "string" ? got : JSON.stringify(got)}`); };
const ref = readFileSync(`${D}/taeo-neutral.png`);

process.env.PIXEL_MOTION_MOCK = `${W}/mock-taeo4.png`;
const a = await makeMotion(ref, "idle");
expect("① 같은 캐릭터 → 받음 · 4프레임 · 기계 통과", a.ok && a.set.frames.length === 4 && a.check.machine === "pass", a.ok ? { frames: a.set.frames.length, cell: [a.set.cellW, a.set.cellH], check: a.check } : a);
if (a.ok) { const { gifOf } = await import("../../src/lib/pixel/frames"); writeFileSync(`${W}/ok.gif`, await gifOf(a.cuts, a.set, { scale: 6, ms: 250 })); }

process.env.PIXEL_MOTION_MOCK = `${W}/mock-haru4.png`;
if (!SAB) {
  const b = await makeMotion(ref, "idle");
  expect("② 다른 캐릭터 → 안 받음", !b.ok, b.ok ? { check: b.check } : { reason: b.reason, check: b.check });
} else {
  // 무른 검사: 참조 색표에 haru 색까지 들어 있는 경우
  const { realDot } = await import("../../src/lib/pixel/realdot");
  const { findFrames, cutFrames } = await import("../../src/lib/pixel/frames");
  const rd = await realDot(readFileSync(`${W}/mock-haru4.png`)); const set = await findFrames(rd.small); const cuts = await cutFrames(rd.small, set);
  // 무른 검사: 참조 분포를 haru 첫 프레임 것으로 바꿔 넣는다(엉뚱한 참조와 견준 경우)
  const px: number[][] = []; for (let i = 0; i < cuts[0].length; i += 4) if (cuts[0][i + 3]) px.push([cuts[0][i], cuts[0][i + 1], cuts[0][i + 2]]);
  const mc = await machineCheck(set, cuts, 4, histOf(px));
  expect("② 다른 캐릭터 → 안 받음", mc.machine !== "pass", mc);
}
process.env.PIXEL_MOTION_MOCK = `${D}/nabi-strip.png`;
const c = await makeMotion(ref, "idle");
expect("③ 붙은 그림 → 안 받음", !c.ok, c.ok ? { check: c.check } : { reason: c.reason });
console.log(`\n${ok}/${n}`);
