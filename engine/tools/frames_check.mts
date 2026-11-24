/**
 * 움직임 만들기(프레임 나누기)의 자 (11-24). 모델 0. 기대값을 먼저 적고 맞나 본다.
 *   npx tsx engine/tools/frames_check.mts [--sabotage]
 * --sabotage: 프레임 맞추기 이동을 끄고(dx=dy=0) 상자를 한 칸씩 밀어 둔다 → "몸통 일치" 기대가 깨져야 한다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { realDot } from "../../src/lib/pixel/realdot";
import { findFrames, cutFrames, gifOf, sheetOf, type FrameSet } from "../../src/lib/pixel/frames";

const SAB = process.argv.includes("--sabotage");
const D = "C:/Users/az518/Desktop/두근도트-시트";
let ok = 0, n = 0;
const expect = (name: string, pass: boolean, got: unknown) => { n++; if (pass) ok++; console.log(`${pass ? "✓" : "✗"} ${name}: ${typeof got === "string" ? got : JSON.stringify(got)}`); };
const sab = (s: FrameSet): FrameSet => SAB ? { ...s, frames: s.frames.map((f, i) => ({ ...f, dx: 0, dy: i % 2 })) } : s;

/** 잘린 프레임끼리 아래 1/4(몸통) 불투명 칸이 같은 색인 비율(첫 프레임 기준, 최소값) */
function bodyMatch(cuts: Buffer[], W: number, H: number) {
  let worst = 1;
  for (let f = 1; f < cuts.length; f++) {
    let same = 0, tot = 0;
    for (let y = Math.floor(H * 0.75); y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, a = cuts[0], b = cuts[f];
      if (!a[i + 3] && !b[i + 3]) continue; tot++;
      if (a[i + 3] && b[i + 3] && a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) same++;
    }
    worst = Math.min(worst, tot ? same / tot : 0);
  }
  return worst;
}

mkdirSync("engine/work/realdot/frames", { recursive: true });
// nabi-strip 은 아랫줄 얼굴 조각이 윗줄에 맞닿아 그림 파일 자체가 자동으로 못 나뉜다(11-24 눈으로 확인) → 알려진 한계, 세지 않는다
for (const name of ["taeo", "haru", "yeonu"]) {
  const r = await realDot(readFileSync(`${D}/${name}-strip.png`));
  try {
    const set = sab(await findFrames(r.small));
    const cuts = await cutFrames(r.small, set);
    const m = bodyMatch(cuts, set.cellW, set.cellH);
    // 기대: 자동으로 윗줄 6프레임(아래 얼굴 조각 줄은 크기가 달라 빠진다) · 몸통 일치 ≥ 0.75(AI 그림 자체 일관성 S 중앙값 76%)
    expect(`${name}-strip 자동 6프레임`, set.frames.length === 6, `${set.frames.length}개 ${set.cellW}×${set.cellH} (${set.how})`);
    expect(`${name}-strip 몸통 일치 ≥ 75%`, m >= 0.75, `${(m * 100).toFixed(1)}%`);
    // 몸통 고정(아래 1/4)을 켜면 몸통은 다 같고, 얼굴(위 3/4)은 프레임마다 달라야 한다(표정이 살아 있나)
    const locked = await cutFrames(r.small, set, { lockBottom: 0.25 });
    const lm = bodyMatch(locked, set.cellW, set.cellH);
    const faceDiff = locked.slice(1).every((c) => !c.subarray(0, Math.floor(set.cellH * 0.75) * set.cellW * 4).equals(locked[0].subarray(0, Math.floor(set.cellH * 0.75) * set.cellW * 4)));
    expect(`${name}-strip 몸통 고정 → 몸통 100% · 얼굴은 다 다름`, lm === 1 && faceDiff, `몸통 ${(lm * 100).toFixed(1)}% · 얼굴 다름 ${faceDiff}`);
    if (name === "taeo" || name === "haru") {
      writeFileSync(`engine/work/realdot/frames/${name}-sheet.png`, await sheetOf(cuts, set));
      writeFileSync(`engine/work/realdot/frames/${name}.gif`, await gifOf(cuts, set, { scale: 6, ms: 300 }));
      writeFileSync(`engine/work/realdot/frames/${name}-locked.gif`, await gifOf(locked, set, { scale: 6, ms: 300 }));
    }
  } catch (e) { expect(`${name}-strip 자동`, false, (e as Error).message); }
}
for (const name of ["haru", "taeo"]) {
  const r = await realDot(readFileSync(`${D}/${name}-sheet.png`));
  const set = sab(await findFrames(r.small, { cols: 3, rows: 2 }));
  expect(`${name}-sheet 3×2 → 6프레임 같은 크기`, set.frames.length === 6 && new Set(set.frames.map((f) => `${f.w}x${f.h}`)).size === 1, `${set.frames.length}개 ${set.cellW}×${set.cellH}`);
}
// 배경이 그라데이션인 시트는 자동으로 나누면 안 되고, 왜 안 되는지 말해야 한다
try { const r = await realDot(readFileSync(`${D}/taeo-sheet.png`)); await findFrames(r.small); expect("taeo-sheet 자동 → 거절", false, "거절 안 함"); }
catch (e) { expect("taeo-sheet 자동 → 거절(가로·세로 정하라고)", /가로·세로/.test((e as Error).message), (e as Error).message); }
console.log(`\n${ok}/${n}`);
