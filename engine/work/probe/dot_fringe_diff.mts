/** 어느 칸을 지웠는지 빨갛게 — 티끌인지 그림인지는 지운 자리를 봐야 안다. 11-08. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, sprites");
const 밑 = "C:/Users/az518/Desktop/로키-도트/티끌-20261108";
const 볼것: [string, string][] = [["doyun", "neutral"], ["rin", "neutral"], ["yuna", "neutral"], ["yeonu", "neutral"]];
const 칸 = 420;
const 조각: sharp.OverlayOptions[] = [];
for (const [n, [슬러그, 감정]] of 볼것.entries()) {
  const c = (data as any[]).find((x) => x.slug === 슬러그);
  const 전 = Buffer.from(await (await fetch(c.sprites[감정])).arrayBuffer());
  const 후 = await sharp(`${밑}/${슬러그}/${감정}.png`).png().toBuffer();
  const A = await sharp(전).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(후).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buf = Buffer.from(A.data);
  const ch = A.info.channels;
  for (let p = 0; p < buf.length; p += ch) {
    if (A.data[p + 3] >= 16 && B.data[p + 3] < 16) { buf[p] = 255; buf[p + 1] = 0; buf[p + 2] = 0; buf[p + 3] = 255; }
  }
  const 표시 = await sharp(buf, { raw: { width: A.info.width, height: A.info.height, channels: ch } }).png().toBuffer();
  조각.push({ input: await sharp(표시).resize(칸, 칸, { kernel: "nearest" }).png().toBuffer(), left: (n % 2) * 칸, top: Math.floor(n / 2) * (칸 + 24) + 24 });
}
const svg = `<svg width="${칸 * 2}" height="${(칸 + 24) * 2}"><style>text{font-family:sans-serif;font-size:17px;fill:#fff}</style>` +
  볼것.map(([s, e], i) => `<text x="${(i % 2) * 칸 + 6}" y="${Math.floor(i / 2) * (칸 + 24) + 18}">${s} ${e} — 빨간 칸이 지워질 자리</text>`).join("") + `</svg>`;
조각.push({ input: Buffer.from(svg), left: 0, top: 0 });
const out = `${밑}/_지운자리.png`;
await sharp({ create: { width: 칸 * 2, height: (칸 + 24) * 2, channels: 4, background: { r: 70, g: 70, b: 82, alpha: 1 } } })
  .composite(조각).png().toFile(out);
console.log(out);
