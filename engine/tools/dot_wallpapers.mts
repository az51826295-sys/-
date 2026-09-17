/**
 * 채팅방 배경 — 도트 그림 여러 장 (09-11, 사장님 "배경화면 도트로 몇 개 만들고 선택할 수 있게").
 *
 * 세로 폰 화면 비율로 그리고(1024×1536), **최근접으로 뭉개서** 진짜 도트로 만든다(160×240, 32색).
 * 그 크기면 파일이 10KB 안팎이라 `public/wallpapers/` 에 넣어 앱과 같이 배포한다(저장소 왕복 없음).
 * 사람·글자·로고는 넣지 않는다 — 말풍선 뒤에 깔리는 것이라 조용해야 한다.
 *
 *   npx tsx engine/tools/dot_wallpapers.mts [--only night,sakura]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import sharp from "sharp";
const { createImageProvider } = await import("../../src/lib/providers/images");

const OUT = "public/wallpapers"; mkdirSync(OUT, { recursive: true });
const W = 160, H = 240;
const SCENES: Record<string, string> = {
  night:   "a calm night sky over a small town, stars, crescent moon, a few rooftops at the bottom, deep blue palette",
  sakura:  "a quiet path under cherry blossom trees in spring, petals drifting, soft pink and pale green",
  rain:    "a rainy day seen through a window with droplets on the glass, blurred city lights outside, blue-gray and warm yellow",
  sunset:  "a beach at sunset, calm sea, orange and purple sky, a small pier",
  room:    "a cozy bedroom corner at night, blanket, a small lamp glowing, plant on the windowsill, warm and dim",
  store:   "a small convenience store at night on a quiet street, glowing sign, wet pavement reflecting light",
};
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt > 0 ? new Set(process.argv[onlyAt + 1].split(",")) : null;

const drawer = createImageProvider();
const previews: Buffer[] = [];
for (const [key, scene] of Object.entries(SCENES)) {
  if (only && !only.has(key)) continue;
  const file = `${OUT}/${key}.png`;
  if (!existsSync(file) || only) {
    const prompt = `Pixel art background for a chat app, vertical phone wallpaper. ${scene}. 16-bit pixel art, limited palette, flat colors, crisp pixels, no anti-aliasing. NO people, NO characters, NO animals, NO text, NO letters, NO logos, NO UI. Calm, quiet, slightly dark so white and yellow speech bubbles stay readable on top.`;
    const t0 = Date.now();
    const made = await drawer.draw(prompt, "low", "1024x1536");
    const raw = Buffer.from(made.dataUrl.split(",")[1], "base64");
    // 최근접으로 줄이고 색을 줄인다 — 이게 "도트" 를 만든다. 그리고 살짝 어둡게(말풍선이 위에 얹힌다).
    const small = await sharp(raw).resize(W, H, { kernel: "nearest", fit: "cover" }).modulate({ brightness: 0.85, saturation: 0.9 })
      .png({ palette: true, colors: 32, dither: 0 }).toBuffer();
    writeFileSync(file, small);
    console.log(`${key}: ${((Date.now() - t0) / 1000).toFixed(1)}s · ${Math.round(small.length / 1024)}KB · 토큰 out ${made.outputTokens}`);
  }
  previews.push(await sharp(readFileSync(file)).resize(W * 2, H * 2, { kernel: "nearest" }).png().toBuffer());
}
const keys = Object.keys(SCENES).filter((k) => !only || only.has(k));
const strip = await sharp({ create: { width: W * 2 * keys.length, height: H * 2, channels: 3, background: "#000" } })
  .composite(previews.map((p, i) => ({ input: p, left: i * W * 2, top: 0 }))).png().toBuffer();
const P = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet/wallpapers-strip.png";
writeFileSync(P, strip);
console.log(`→ ${P} (${keys.join(", ")})`);
