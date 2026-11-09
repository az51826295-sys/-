/** 열 명 — 서 있는 모습 한 줄로. 켠 뒤 눈으로 한 번 본다. */
import { mkdirSync, readFileSync } from "node:fs";
import type { OverlayOptions } from "sharp";
const sharp = (await import("sharp")).default;
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data } = await db.from("dot_characters").select("slug, name, tagline").eq("is_public", true).order("slug");
const 사람 = (data ?? []) as { slug: string; name: string; tagline: string }[];
const W = 190, H = 190, 머리 = 34;
const 조각: OverlayOptions[] = [];
let 글 = "";
for (const [i, c] of 사람.entries()) {
  const x = (i % 5) * W, y = Math.floor(i / 5) * (H + 머리);
  조각.push({ input: await sharp(`public/dot-sprites/${c.slug}/neutral.png`).resize(W, H, { kernel: "nearest" }).png().toBuffer(), left: x, top: y + 머리 });
  글 += `<text x="${x + 6}" y="${y + 15}">${c.name}</text><text x="${x + 6}" y="${y + 29}" class="s">${c.tagline.slice(0, 14)}</text>`;
}
const 줄 = Math.ceil(사람.length / 5);
const 전체W = W * 5, 전체H = 줄 * (H + 머리);
조각.push({ input: Buffer.from(`<svg width="${전체W}" height="${전체H}"><style>text{font-family:sans-serif;font-size:14px;fill:#1c1c1c}.s{font-size:10px;fill:#6b6b80}</style>${글}</svg>`), left: 0, top: 0 });
const out = "C:/Users/az518/Desktop/로키-도트/새캐릭터-20261109/_열명.png";
mkdirSync("C:/Users/az518/Desktop/로키-도트/새캐릭터-20261109", { recursive: true });
await sharp({ create: { width: 전체W, height: 전체H, channels: 4, background: { r: 178, g: 199, b: 217, alpha: 1 } } }).composite(조각).png().toFile(out);
console.log(`${사람.length}명 → ${out}`);
