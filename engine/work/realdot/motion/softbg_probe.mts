// 둘째 판(어두운 번진 배경) 원본으로: 번진 배경 지우기 → 자동 나누기. 문턱(step)별로. 돈 0.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const D = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const { clearSoftBg, findFrames, cutFrames, sheetOf } = await import("../../../../src/lib/pixel/frames");
const raw = readFileSync(`${D}/turn2-raw.png`);
const rd = await realDot(raw);
console.log("주기", rd.period[0], "칸", rd.logical);
for (const step of [16, 26, 40]) {
  const c = await clearSoftBg(rd.small, step);
  try {
    const set = await findFrames(c.png, { clearBg: true });
    const cuts = await cutFrames(c.png, set, { dropEdgeBits: true });
    const hs = cuts.map((b) => { let t = -1, bt = -1; for (let y = 0; y < set.cellH; y++) for (let x = 0; x < set.cellW; x++) if (b[(y * set.cellW + x) * 4 + 3]) { if (t < 0) t = y; bt = y; } return bt - t + 1; });
    console.log(`step ${step}: 지운 ${(c.cleared * 100).toFixed(0)}% · 프레임 ${set.frames.length} · 칸 ${set.cellW}×${set.cellH} · 키 ${hs.join("/")}`);
    const s1 = await sheetOf(cuts, set); const m = await sharp(s1).metadata();
    writeFileSync(`${D}/turn2-step${step}.png`, await sharp(s1).resize(m.width! * 5, m.height! * 5, { kernel: "nearest" }).png().toBuffer());
  } catch (e) { console.log(`step ${step}: 지운 ${(c.cleared * 100).toFixed(0)}% · 실패 ${(e as Error).message}`); }
}
