// 이미 산 둘째 판(turn2-raw)으로 새 길 전체를 돌린다 — 그리기 0원, 판단자만 실제로(약 1원).
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const D = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create";
process.env.PIXEL_MOTION_MOCK = `${D}/turn2-raw.png`;
process.env.PIXEL_JUDGE_LIVE = "1";
const { makeMotion, sheetOf, gifOf } = await import("../../../../src/lib/pixel/motion");
const r = await makeMotion(readFileSync(`${D}/dragon-1x.png`), "turn", { maxTries: 1 });
console.log(JSON.stringify({ ok: r.ok, usd: r.usd, ...(r.ok ? { cell: [r.set.cellW, r.set.cellH], check: r.check } : { reason: r.reason, check: r.check }) }, null, 1));
if (r.ok) {
  const s = await sheetOf(r.cuts, r.set); const m = await sharp(s).metadata();
  writeFileSync(`${D}/turn2-sheet-1x.png`, s);
  writeFileSync(`${D}/turn2-sheet-big.png`, await sharp(s).resize(m.width! * 6, m.height! * 6, { kernel: "nearest" }).png().toBuffer());
  writeFileSync(`${D}/turn2.gif`, await gifOf(r.cuts, r.set, { scale: 8, ms: 500 }));
}
