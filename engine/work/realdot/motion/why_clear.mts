import { readFileSync } from "node:fs";
import sharp from "sharp";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const rd = await realDot(readFileSync("C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create/turn2-raw.png"));
const { data, info } = await sharp(rd.small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let clear = 0; for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] < 128) clear++;
console.log("realDot 결과에서 이미 투명한 칸", (100 * clear / (info.width * info.height)).toFixed(0) + "%");
const m = await sharp(readFileSync("C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create/turn2-raw.png")).metadata();
console.log("원본 알파 있음?", m.hasAlpha, m.channels);
