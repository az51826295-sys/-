/** 많이 지운 사람(도윤 34%)이 멀쩡한지 눈으로 — 안 지운 사람(나비 0%)을 대조군으로 같이 둔다. 11-08. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, sprites");
const 밑 = "C:/Users/az518/Desktop/로키-도트/티끌-20261108";
const 볼것: [string, string][] = [["doyun", "neutral"], ["doyun", "happy"], ["seoha", "neutral"], ["nabi", "neutral"]];
const 칸 = 330;
const 조각: sharp.OverlayOptions[] = [];
for (const [i, [슬러그, 감정]] of 볼것.entries()) {
  const c = (data as any[]).find((x) => x.slug === 슬러그);
  const 전 = Buffer.from(await (await fetch(c.sprites[감정])).arrayBuffer());
  조각.push({ input: await sharp(전).resize(칸, 칸, { kernel: "nearest" }).png().toBuffer(), left: i * 칸, top: 26 });
  조각.push({ input: await sharp(`${밑}/${슬러그}/${감정}.png`).resize(칸, 칸, { kernel: "nearest" }).png().toBuffer(), left: i * 칸, top: 26 + 칸 + 24 });
}
const svg = `<svg width="${칸 * 볼것.length}" height="${26 + 칸 * 2 + 24}"><style>text{font-family:sans-serif;font-size:17px;fill:#fff}</style>` +
  `<text x="6" y="19">전 — ${볼것.map(([s, e]) => `${s} ${e}`).join("  ·  ")}</text>` +
  `<text x="6" y="${26 + 칸 + 18}">후 — 티끌 지움</text></svg>`;
조각.push({ input: Buffer.from(svg), left: 0, top: 0 });
const out = `${밑}/_도윤점검.png`;
await sharp({ create: { width: 칸 * 볼것.length, height: 26 + 칸 * 2 + 24, channels: 4, background: { r: 70, g: 70, b: 82, alpha: 1 } } })
  .composite(조각).png().toFile(out);
console.log(out);
