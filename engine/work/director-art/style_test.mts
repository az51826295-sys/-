// 잠근 M1(문턱 26)을 새 6장에 — 눈 판정(eye_labels.json, 먼저 커밋)과 견준다.
import { readFileSync } from "node:fs";
const { 칸들, M1 } = await import("./style_dev.mts");
const key = JSON.parse(readFileSync("engine/work/director-art/verify/blind_key.json", "utf8")) as { row: number; slug: string; seat: string }[];
const eye = JSON.parse(readFileSync("engine/work/director-art/verify/eye_labels.json", "utf8")) as Record<string, string>;
let 맞음 = 0, img2짐작 = 0;
for (const k of key) {
  const m = await M1(await 칸들(`engine/work/director-art/verify/${k.seat}-${k.slug}-sheet.png`), k.slug);
  const 자 = m <= 26 ? "같음" : "벗어남", 눈 = eye[String(k.row)].startsWith("벗어남") ? "벗어남" : "같음";
  if (자 === 눈) 맞음++; if ((k.seat.startsWith("img2") ? "벗어남" : "같음") === 눈) img2짐작++;
  console.log(`${자 === 눈 ? "✅" : "❌"} 줄${k.row} ${k.seat.padEnd(12)} ${k.slug.padEnd(6)} M1 ${m.toFixed(1)} → ${자} · 눈 ${eye[String(k.row)]}`);
}
console.log(`자 vs 눈 ${맞음}/6 · "img2 는 벗어난다" 짐작 vs 눈 ${img2짐작}/6`);
