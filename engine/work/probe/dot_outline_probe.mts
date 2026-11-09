import type { OverlayOptions } from "sharp";
/**
 * 테두리 고르기 — 린을 **방 배경 위에** 올려 놓고 본다. 사장님이 말한 문제는 배경 위에서만 보인다. 11-08.
 * 네 가지를 나란히: 지금 / 검정 1칸 / 어둡게 1칸 / 어둡게 2칸.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const { outlineSprite, countHoles } = await import("../../../src/lib/dot/outline");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, sprites");
const 밑 = "C:/Users/az518/Desktop/로키-도트/티끌-20261108";

/** 구멍이 얼마나 되나 — 린이 정말 많은지 숫자로 먼저. */
for (const s of ["rin", "yuna", "doyun", "nabi"]) {
  const b = await sharp(`${밑}/${s}/neutral.png`).png().toBuffer();
  const h = await countHoles(b, 8);
  console.log(`${s.padEnd(6)} 구멍 ${String(h.구멍).padStart(3)}칸 / 잉크 ${h.잉크}칸  ${((h.구멍 / h.잉크) * 100).toFixed(1)}%`);
}

const 린 = await sharp(`${밑}/rin/neutral.png`).png().toBuffer();
const 판: [string, Buffer][] = [["지금", 린]];
판.push(["검정 1칸", (await outlineSprite(린, 8, { 식: "한색", 색: [20, 18, 26] }, 1)).png]);
판.push(["어둡게 1칸", (await outlineSprite(린, 8, { 식: "어둡게", 비율: 0.45 }, 1)).png]);
판.push(["어둡게 2칸", (await outlineSprite(린, 8, { 식: "어둡게", 비율: 0.45 }, 2)).png]);

/* 앱에서 보이는 자리와 비슷하게 — 밝은 방 배경 위 */
const 칸 = 380;
const 바탕 = await sharp({
  create: { width: 칸, height: 칸, channels: 4, background: { r: 246, g: 237, b: 226, alpha: 1 } },
}).png().toBuffer();
const 조각: OverlayOptions[] = [];
for (const [i, [이름, png]] of 판.entries()) {
  const 올린것 = await sharp(바탕).composite([{ input: await sharp(png).resize(칸, 칸, { kernel: "nearest" }).png().toBuffer() }]).png().toBuffer();
  조각.push({ input: 올린것, left: i * 칸, top: 28 });
}
const svg = `<svg width="${칸 * 판.length}" height="${28 + 칸}"><style>text{font-family:sans-serif;font-size:19px;fill:#fff}</style>` +
  판.map(([이름], i) => `<text x="${i * 칸 + 8}" y="21">${이름}</text>`).join("") + `</svg>`;
조각.push({ input: Buffer.from(svg), left: 0, top: 0 });
const out = "C:/Users/az518/Desktop/로키-도트/티끌-20261108/_테두리.png";
await sharp({ create: { width: 칸 * 판.length, height: 28 + 칸, channels: 4, background: { r: 24, g: 24, b: 32, alpha: 1 } } })
  .composite(조각).png().toFile(out);
console.log(`\n${out}`);
