/**
 * **길드 홀 그림** (10-10 사장님 시안 "거점 (길드 홀) 갤러리").
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ash_길드홀.mts [--진짜]
 *
 * 지금 길드 탭은 야영지(camp.png) 앞에 대표가 서 있다. 시안은 **방 안**이다 —
 * 긴 탁자, 촛불, 벽에 걸린 깃발. 탑 그림처럼 1/4 로 줄여 도트 칸을 맞춘다.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";
const 진짜 = process.argv.includes("--진짜");
const 주문 = [
  "A single pixel art image: the inside of a small guild hall, seen straight on from the front, like a stage.",
  "A long wooden table in the middle with a few stools, a lit candelabra and scattered papers on it.",
  "Rough dark stone walls with iron sconces holding small warm flames, a tall banner hanging on the back wall,",
  "a stack of crates and barrels in one corner, a weapon rack in the other, a worn rug on the floor.",
  "Warm dim candlelight from the middle, the corners sinking into darkness. Nobody is in the room.",
  "The floor runs across the bottom of the image so a character sprite can stand on it.",
  "No text, no UI, no frame, no border. Nothing glows green, no modern objects.",
  "Style: 16-bit SNES JRPG pixel art, thick dark outlines, flat shading, limited desaturated palette.",
  "Every pixel a clear square block. Old, worn, quiet.",
].join(" ");
console.log("길드 홀 — gpt-image-2 · 1536×1024");
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }
const OpenAI = (await import("openai")).default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 2 });
const r = await openai.images.generate({ model: "gpt-image-2", prompt: 주문, n: 1, size: "1536x1024", quality: "low" });
const b64 = (r as any).data?.[0]?.b64_json;
if (!b64) { console.error("안 왔다"); process.exit(1); }
const 원본 = "C:/Users/az518/Desktop/로키-도트/배경/_원본-길드홀.png";
writeFileSync(원본, Buffer.from(b64, "base64"));
const m = await sharp(원본).metadata();
const w = Math.round((m.width ?? 1536) / 4), h = Math.round((m.height ?? 1024) / 4);
await sharp(원본).resize(w, h, { kernel: "nearest" }).png().toFile("public/ash/art/hall.png");
// **manifest 에 넣어야 게임이 불러온다** — 10-10 에 이걸 빼먹어 배경이 안 바뀌었다
const { readFileSync, writeFileSync: 쓰기 } = await import("node:fs");
const 길 = "public/ash/art/manifest.json";
const 옛 = JSON.parse(readFileSync(길, "utf8")) as string[];
if (!옛.includes("hall")) { 옛.push("hall"); 쓰기(길, JSON.stringify(옛.sort())); }
console.log(`${m.width}×${m.height} → public/ash/art/hall.png ${w}×${h} · manifest ${옛.length}개`);
