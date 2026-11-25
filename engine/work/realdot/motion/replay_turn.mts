// 돈 0 다시 돌리기: 이미 산 용 4방향 원본(turn-raw.png)을 "그려 온 것"으로 넣고 고친 길(예측자→판단자→고치기)을 통째로 돌린다.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const D = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create";
process.env.PIXEL_MOTION_MOCK = `${D}/turn-raw.png`;
const { makeMotion, sheetOf } = await import("../../../../src/lib/pixel/motion");
const r = await makeMotion(readFileSync(`${D}/dragon-1x.png`), "turn", { maxTries: 1 });
console.log(JSON.stringify({ ok: r.ok, usd: r.usd, ...(r.ok ? { cell: [r.set.cellW, r.set.cellH], check: r.check } : { reason: r.reason, check: r.check }) }, null, 1));
if (r.ok) { const s = await sheetOf(r.cuts, r.set); const m = await sharp(s).metadata(); writeFileSync(`${D}/turn-replay-big.png`, await sharp(s).resize(m.width! * 6, m.height! * 6, { kernel: "nearest" }).png().toBuffer()); }
