/**
 * 말풍선 색 자 — 배경마다 짝지은 말풍선(상대·나)의 글자 대비를 WCAG 식으로 잰다(09-11, 74회차).
 *
 * "배경과 맞췄다" 는 형용사다. 재는 건 하나: 글자가 읽히는가 — 대비 4.5 미만이면 ✗.
 *   node engine/tools/dot_palette_test.mjs
 */
import { readFileSync } from "node:fs";
const s = readFileSync("src/app/dot/[slug]/DotChat.tsx", "utf8");
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rows = [...s.matchAll(/^\s*(\w+):\s*\{ name: "([^"]+)",\s*wall:.*?them: "(#[0-9a-f]{6})", themText: "(#[0-9a-f]{6})", me: "(#[0-9a-f]{6})", meText: "(#[0-9a-f]{6})"/gm)];
let bad = 0;
for (const [, key, name, them, themText, me, meText] of rows) {
  const a = cr(them, themText), b = cr(me, meText);
  if (a < 4.5 || b < 4.5) bad++;
  console.log(`${key.padEnd(9)} ${name.padEnd(4)} 상대 ${a.toFixed(1)}  나 ${b.toFixed(1)} ${a >= 4.5 && b >= 4.5 ? "✓" : "✗"}`);
}
console.log(`배경 ${rows.length}개 · 대비 4.5 미만 ${bad}개`);
process.exit(bad || rows.length < 6 ? 1 : 0);
