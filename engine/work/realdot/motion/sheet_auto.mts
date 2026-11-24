import { readFileSync, writeFileSync } from "node:fs";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const { findFrames, cutFrames, sheetOf } = await import("../../../../src/lib/pixel/frames");
const r = await realDot(readFileSync("C:/Users/az518/Desktop/두근도트-시트/taeo-sheet.png"));
const s = await findFrames(r.small); console.log(r.logical, s.frames.length, s.cellW, s.cellH, s.frames.map((f) => `${f.x},${f.y} ${f.w}x${f.h}`).join(" | "));
const sh = await sheetOf(await cutFrames(r.small, s), s);
const sharp = (await import("sharp")).default; writeFileSync("engine/work/realdot/motion/sheet_auto.png", await sharp(sh).resize({ width: s.cellW * s.frames.length * 4, kernel: "nearest" }).png().toBuffer());
