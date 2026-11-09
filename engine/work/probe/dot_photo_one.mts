/** 새 열쇠로 **사진 한 장만** 뽑아 본다 — 되는지·얼마나 걸리는지·얼마인지. 아무것도 안 올린다. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const sharp = (await import("sharp")).default;
const { createImageProvider } = await import("../../../src/lib/providers/images");
const 나갈곳 = "C:/Users/az518/Desktop/로키-도트/사진-20261109"; mkdirSync(나갈곳, { recursive: true });

const slug = "rin";
const look = "a young woman with a black ponytail, sleepy half-closed eyes, wearing a grey hoodie";
const scene = "sitting alone in a late-night convenience store, eating cup ramen at the window counter, warm fluorescent light, city dark outside";
const ref = "data:image/png;base64," + readFileSync(`public/dot-sprites/${slug}/neutral.png`).toString("base64");
const prompt = [
  `Using the character in this image — SAME face, SAME hair style and color, same overall look (${look}) — draw ONE pixel-art snapshot photo of that character.`,
  `Scene: ${scene}. Waist-up or three-quarter view, character clearly the main subject and large in frame, looking natural (not posed like a sprite sheet).`,
  `Style: 16-bit pixel art, chunky crisp pixels, limited palette, no anti-aliasing. Vertical 4:5 snapshot with a real background (not transparent). NO text, NO letters, NO UI, NO borders, NO grid, NO other people.`,
].join(" ");

const t0 = Date.now();
const made = await createImageProvider().edit(ref, prompt, "1024x1536", "medium");
const raw = Buffer.from(made.dataUrl.split(",")[1], "base64");
const small = await sharp(raw).resize(200, 250, { kernel: "nearest", fit: "cover", position: "top" }).png({ palette: true, colors: 32, dither: 0 }).toBuffer();
writeFileSync(`${나갈곳}/_시험-${slug}.png`, small);
writeFileSync(`${나갈곳}/_시험-${slug}-원본.png`, raw);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s · ${Math.round(small.length / 1024)}KB · ${JSON.stringify((made as any).usage ?? (made as any).cost ?? "값 정보 없음")}`);
console.log(`${나갈곳}/_시험-${slug}.png`);
