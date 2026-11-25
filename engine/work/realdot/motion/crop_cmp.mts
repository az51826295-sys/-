// 4방향 1번 프레임: AI 원본 확대 vs 1배 확대를 나란히. 돈 0.
import { readFileSync } from "node:fs";
import sharp from "sharp";
const D = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create";
const raw = await sharp(readFileSync(`${D}/turn-raw.png`)).extract({ left: 0, top: 220, width: 400, height: 560 }).resize(400, 560).png().toBuffer();
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const r = await realDot(readFileSync(`${D}/turn-raw.png`));
const p = r.period[0];
const one = await sharp(r.small).extract({ left: 0, top: Math.floor(220 / p), width: Math.floor(400 / p), height: Math.floor(560 / p) }).resize(400, 560, { kernel: "nearest" }).png().toBuffer();
await sharp({ create: { width: 820, height: 560, channels: 4, background: "#ffffff" } }).composite([{ input: raw, left: 0, top: 0 }, { input: one, left: 420, top: 0 }]).png().toFile(`${D}/cmp-frame1.png`);
console.log("ok", p);
