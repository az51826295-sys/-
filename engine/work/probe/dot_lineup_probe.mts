/** 바닥선 맞추기 전/후를 한 장에 나란히 — 11-08. 눈으로 보는 용도. */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { alignSprite } = await import("../../../src/lib/dot/align");
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, sprites, is_public");
const 사람 = (data as any[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));

const 칸 = 256; /* 512 의 정확히 절반 — 정수 축소라 도트가 안 뭉개진다 */
const 폭 = 칸 * 사람.length, 높 = 칸 * 2 + 72;
const 조각: sharp.OverlayOptions[] = [];

for (let i = 0; i < 사람.length; i++) {
  const c = 사람[i];
  const key = Object.keys(c.sprites).find((k) => k === "neutral") ?? Object.keys(c.sprites)[0];
  const res = await fetch(c.sprites[key]);
  if (!res.ok) continue;
  const 전 = Buffer.from(await res.arrayBuffer());
  const { png: 후 } = await alignSprite(전);
  const 줄이기 = (b: Buffer) => sharp(b).resize(칸, 칸, { kernel: "nearest" }).png().toBuffer();
  조각.push({ input: await 줄이기(전), left: i * 칸, top: 36 });
  조각.push({ input: await 줄이기(후), left: i * 칸, top: 36 + 칸 });
}

/* 바닥선 두 줄 — 전 줄의 바닥과 후 줄의 바닥에 빨간 선을 긋는다 */
const 선 = (y: number) => ({
  input: { create: { width: 폭, height: 2, channels: 4 as const, background: { r: 255, g: 60, b: 60, alpha: 1 } } },
  left: 0, top: y,
});
조각.push(선(36 + 칸 - 2), 선(36 + 칸 * 2 - 2));

const svg = `<svg width="${폭}" height="${높}"><style>text{font-family:sans-serif;font-size:22px;fill:#fff}</style>
<text x="8" y="26">맞추기 전 — 발밑 여백 0/16/24/32px (바닥선이 네 군데)</text>
<text x="8" y="${높 - 10}">맞춘 뒤 — 발밑 0px 하나 (${사람.map((c: any) => c.name).join(" · ")})</text></svg>`;
조각.push({ input: Buffer.from(svg), left: 0, top: 0 });

const out = "C:/Users/az518/Desktop/ai-workforce/engine/work/probe/lineup.png";
await sharp({ create: { width: 폭, height: 높, channels: 4, background: { r: 24, g: 24, b: 32, alpha: 1 } } })
  .composite(조각).png().toFile(out);
console.log(out);
