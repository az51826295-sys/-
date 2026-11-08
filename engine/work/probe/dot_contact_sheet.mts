/** 66칸을 이름 붙여 한 장에 — 사장님이 "이거" 하고 집을 수 있게. 11-08. */
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, sprites, is_public");
const 공개 = (data as any[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));

const 칸 = 190, 글높 = 24, 줄 = 6;
const 목록: { 이름: string; png: Buffer }[] = [];
for (const c of 공개) {
  for (const [감정, url] of Object.entries(c.sprites as Record<string, string>)) {
    const r = await fetch(url); if (!r.ok) continue;
    목록.push({ 이름: `${c.name} ${감정.replace("menhera:", "멘·")}`, png: Buffer.from(await r.arrayBuffer()) });
  }
}
const 행 = Math.ceil(목록.length / 줄);
const 조각: sharp.OverlayOptions[] = [];
for (const [i, x] of 목록.entries()) {
  조각.push({ input: await sharp(x.png).resize(칸, 칸).png().toBuffer(), left: (i % 줄) * 칸, top: Math.floor(i / 줄) * (칸 + 글높) + 글높 });
}
const svg = `<svg width="${줄 * 칸}" height="${행 * (칸 + 글높)}"><style>text{font-family:sans-serif;font-size:15px;fill:#fff}</style>` +
  목록.map((x, i) => `<text x="${(i % 줄) * 칸 + 5}" y="${Math.floor(i / 줄) * (칸 + 글높) + 17}">${x.이름}</text>`).join("") + `</svg>`;
조각.push({ input: Buffer.from(svg), left: 0, top: 0 });
const 나갈곳 = "C:/Users/az518/Desktop/로키-도트/자르기-20261108";
mkdirSync(나갈곳, { recursive: true });
const out = join(나갈곳, "_전체66칸.png");
await sharp({ create: { width: 줄 * 칸, height: 행 * (칸 + 글높), channels: 4, background: { r: 24, g: 24, b: 32, alpha: 1 } } })
  .composite(조각).png().toFile(out);
console.log(`${목록.length}칸 → ${out}`);
