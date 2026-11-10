/**
 * # 선물 그림 — 다섯 개  (11-10 사장님: *"두쫀쿠 사진도 뽑아서 넣어 다"*)
 *
 *   npx tsx engine/tools/dot_gift_art.mts            ← 없는 것만
 *   npx tsx engine/tools/dot_gift_art.mts --redo
 *
 * 선물 서랍이 글자만 있었다. 목록은 `bond.ts` 의 `GIFTS` 가 주인이고, 그림은 **키 이름으로** 붙는다
 * (`public/dot-sprites/gift/<key>.png`) — 표에 적지 않으므로 선물이 늘면 파일만 하나 더 놓으면 된다.
 *
 * ## 자
 *
 * 얼굴·스프라이트와 **같은 결**이어야 한다 — 128×128 · **도트 4**(논리 32×32) · 배경 비움.
 * 도트가 1이 되면 선물 칸만 매끈해져서 그 칸이 다른 앱처럼 보인다
 * ([[dot-character-standard]]). 뭉개기는 **논리 크기로 줄였다가 정수배로 키우는** 같은 방법을 쓴다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const sharp = (await import("sharp")).default;
const { createImageProvider } = await import("../../src/lib/providers/images");
const { GIFTS } = await import("../../src/lib/dot/bond");

const OUT = "public/dot-sprites/gift";
mkdirSync(OUT, { recursive: true });
const 논리 = 32, 배 = 4, W = 논리 * 배;          // 128 · 도트 4
const 다시 = process.argv.includes("--redo");

/** 그림으로 그릴 말 — 이름만으로는 "두쫀쿠" 가 안 그려진다. `tell` 에 이미 풀어 적어 뒀다. */
const 영문: Record<string, string> = {
  dzk: "a thick round Dubai-style chocolate cookie, gooey pistachio filling showing at a bite",
  saltbread: "a freshly baked salt butter bread roll, glossy top with coarse salt flakes",
  strawmilk: "a carton of strawberry milk with a straw in it, pink and white",
  cancoffee: "a short aluminium drink can of coffee, flat round pull-tab top, cylindrical metal body with a simple brown label",
  ramen: "a cup of instant ramen with the lid half peeled and steam rising",
};

const 그림 = createImageProvider();
const 그릴것 = GIFTS.filter((g) => 다시 || !existsSync(`${OUT}/${g.key}.png`));
if (!그릴것.length) { console.log("그릴 것이 없다 (--redo 면 다시)"); process.exit(0); }
console.log(`선물 그림 ${그릴것.length}개 — ${W}×${W} · 도트 ${배} · 배경 비움\n`);

let 실패 = 0;
for (const g of 그릴것) {
  const prompt = [
    `A single pixel-art item: ${영문[g.key] ?? g.tell}.`,
    "16-bit pixel art, chunky crisp pixels, limited palette, bold dark outline around the item, no anti-aliasing.",
    "The item alone, centered, filling most of the frame. Transparent background. NO text, NO letters, NO hands, NO people, NO plate, NO table, NO shadow on the ground.",
  ].join(" ");
  const t0 = Date.now();
  try {
    const made = await 그림.draw(prompt, "low", "1024x1024");
    const raw = Buffer.from(made.dataUrl.split(",")[1], "base64");
    /* 논리 도트로 먼저 줄인 뒤 정수배로 키운다 — 바로 128 로 줄이면 도트가 1화소가 된다. */
    const 작게 = await sharp(raw).ensureAlpha().resize(논리, 논리, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const 큰것 = await sharp(작게).resize(W, W, { kernel: "nearest" }).png({ palette: true, colors: 24, dither: 0 }).toBuffer();
    writeFileSync(`${OUT}/${g.key}.png`, 큰것);
    console.log(`  ${g.name.padEnd(5)} ${((Date.now() - t0) / 1000).toFixed(1)}s · ${Math.round(큰것.length / 1024)}KB`);
  } catch (e) { 실패++; console.log(`  ✗ ${g.name}: ${e instanceof Error ? e.message : e}`); }
}
console.log(`\n나간 곳 ${OUT} — **배포해야 앱에서 보인다**`);
process.exit(실패 ? 1 : 0);
