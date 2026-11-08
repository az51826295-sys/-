/**
 * **격자는 아무 수나 못 쓴다** — 512 캔버스에서 도트 크기가 정수로 나오는 수만 격자가 성립한다.
 * 512/64=8 · /128=4 · /256=2 · /512=1 ✅   그런데 512/96=5.33 · /160=3.2 ❌ → 격자가 깨진다.
 * 그래서 고를 수 있는 값만 나란히 둔다. 11-08.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, photos, is_public");
const c = (data as any[]).find((x) => x.slug === "seoha");
const ps: any[] = Array.isArray(c.photos) ? c.photos : Object.values(c.photos ?? {});
const url = ps.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean)[0];
const 원본 = Buffer.from(await (await fetch(url)).arrayBuffer());

async function 깎기(b: Buffer, grid: number) {
  const 작게 = await sharp(b).resize(grid, Math.round(grid * 1.25), { kernel: "nearest" })
    .png({ palette: true, colors: 24, dither: 0 }).toBuffer();
  return await sharp(작게).resize(340, 425, { kernel: "nearest" }).png().toBuffer();
}

const 격자 = [64, 128, 256];
const 글 = ["격자 64 · 도트 8  ← 지금", "격자 128 · 도트 4", "격자 256 · 도트 2", "안 깎음 ← 피드 그대로"];
const 조각: sharp.OverlayOptions[] = [];
for (let i = 0; i < 격자.length; i++) 조각.push({ input: await 깎기(원본, 격자[i]), left: i * 340, top: 36 });
조각.push({ input: await sharp(원본).resize(340, 425, { kernel: "nearest" }).png().toBuffer(), left: 3 * 340, top: 36 });

const 폭 = 340 * 4, 높 = 425 + 44;
const svg = `<svg width="${폭}" height="${높}"><style>text{font-family:sans-serif;font-size:20px;fill:#fff}</style>` +
  글.map((t, i) => `<text x="${i * 340 + 8}" y="26">${t}</text>`).join("") + `</svg>`;
조각.push({ input: Buffer.from(svg), left: 0, top: 0 });
const out = "C:/Users/az518/Desktop/ai-workforce/engine/work/probe/grid2.png";
await sharp({ create: { width: 폭, height: 높, channels: 4, background: { r: 24, g: 24, b: 32, alpha: 1 } } })
  .composite(조각).png().toFile(out);
console.log(out);
