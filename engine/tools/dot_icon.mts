/** 앱 아이콘 — 유나의 무표정 스프라이트를 도트 그대로 키워 바탕에 얹는다. */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const SRC = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet/yuna-neutral.png";
const face = readFileSync(SRC);
const BG = "#b2c7d9";

for (const [size, inner, name] of [[192, 168, "dot-icon-192.png"], [512, 448, "dot-icon-512.png"], [512, 340, "dot-icon-maskable.png"]] as [number, number, string][]) {
  // 최근접으로 키운다 — 부드럽게 키우면 아이콘만 도트가 아니게 된다.
  const art = await sharp(face).resize(inner, inner, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const out = await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: art, gravity: "south" }])
    .png()
    .toBuffer();
  writeFileSync(`public/${name}`, out);
  console.log(`${name} ${size}px · ${Math.round(out.length / 1024)} KB`);
}
