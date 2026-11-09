import type { OverlayOptions } from "sharp";
/**
 * **밀도가 범인인가** — 피드 사진(도트 1)을 우리 `pixelize` 로 깎아 보면 스프라이트가 된다.
 * 돈 한 푼 안 쓰고, 기준점(격자 몇으로 할까)을 눈으로 고를 수 있게 한 줄로 세운다. 11-08.
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

/** 서하 — 피드에서 얼굴이 제일 크게 나온 장이라 밀도 차이가 눈에 띈다. */
const c = (data as any[]).find((x) => x.slug === "seoha") ?? (data as any[]).find((x) => x.is_public && x.photos);
const ps: any[] = Array.isArray(c.photos) ? c.photos : Object.values(c.photos ?? {});
const url = ps.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean)[0];
const 원본 = Buffer.from(await (await fetch(url)).arrayBuffer());

/** 우리 `pixelize` 와 같은 셈 — 격자로 내렸다가 24색으로 줄이고 다시 올린다. */
async function 깎기(b: Buffer, grid: number) {
  const 작게 = await sharp(b)
    .resize(grid, Math.round(grid * 1.25), { kernel: "nearest" })
    .png({ palette: true, colors: 24, dither: 0 })
    .toBuffer();
  return await sharp(작게).resize(320, 400, { kernel: "nearest" }).png().toBuffer();
}

const 격자 = [64, 96, 128, 160];
const 폭 = 320 * (격자.length + 1), 높 = 400 + 44;
const 조각: OverlayOptions[] = [{ input: await sharp(원본).resize(320, 400, { kernel: "nearest" }).png().toBuffer(), left: 0, top: 36 }];
for (let i = 0; i < 격자.length; i++) 조각.push({ input: await 깎기(원본, 격자[i]), left: (i + 1) * 320, top: 36 });

const 글 = ["지금 피드 (도트 1)", ...격자.map((g) => `격자 ${g}${g === 64 ? " ← 지금 스프라이트` ".replace("`", "") : ""}`)];
const svg = `<svg width="${폭}" height="${높}"><style>text{font-family:sans-serif;font-size:21px;fill:#fff}</style>` +
  글.map((t, i) => `<text x="${i * 320 + 8}" y="26">${t}</text>`).join("") + `</svg>`;
조각.push({ input: Buffer.from(svg), left: 0, top: 0 });

const out = "C:/Users/az518/Desktop/ai-workforce/engine/work/probe/grid.png";
await sharp({ create: { width: 폭, height: 높, channels: 4, background: { r: 24, g: 24, b: 32, alpha: 1 } } })
  .composite(조각).png().toFile(out);
console.log(out);
