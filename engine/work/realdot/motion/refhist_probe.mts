// 용 4방향이 "색 겹침 0.40" 으로 떨어졌다 — 참조 쪽 색 분포에 배경이 섞였나? 돈 0.
import { readFileSync } from "node:fs";
import sharp from "sharp";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const ref = readFileSync("C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create/dragon-1x.png");
const BG = "#B0C4DE";
const meta = await sharp(ref).metadata();
const long = Math.max(meta.width!, meta.height!);
const refPng = await sharp(ref).flatten({ background: BG }).resize({ width: meta.width! * Math.ceil(512 / long), kernel: "nearest" }).png().toBuffer();
const small = (await realDot(refPng)).small;
const { data, info } = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cnt = new Map<number, number>(); let n = 0;
for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) { n++; const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `#${k.toString(16).padStart(6, "0")} ${((100 * v) / n).toFixed(1)}%`);
console.log(`realDot 뒤 ${info.width}×${info.height} · 불투명 ${n}칸 · 많은 색 ${top.join(" , ")}`);
const o = await sharp(ref).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let fig = 0; for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3]) fig++;
console.log(`원본 1배: 캐릭터 칸 ${fig}/${o.info.width * o.info.height} = ${((100 * fig) / (o.info.width * o.info.height)).toFixed(1)}% → 배경 ${(100 - (100 * fig) / (o.info.width * o.info.height)).toFixed(1)}% (40% 넘어야 배경으로 빠진다)`);
