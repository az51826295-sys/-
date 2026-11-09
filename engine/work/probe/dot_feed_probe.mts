import type { OverlayOptions } from "sharp";
/** 피드 사진은 어떤 물건인가 — 크기·장수·결. 기준 한 장이 표정과 피드를 같이 덮을 수 있나. 11-08. */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, photos, is_public");
const 사람 = (data as any[]).filter((c) => c.is_public).sort((a, b) => a.slug.localeCompare(b.slug));

console.log("이름     피드 장수  크기들              도트인가(색 수)");
const 조각: OverlayOptions[] = [];
const 칸 = 256;
let i = 0;
for (const c of 사람) {
  const ps: string[] = Array.isArray(c.photos) ? c.photos : c.photos ? Object.values(c.photos) : [];
  const 주소 = ps.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean);
  if (!주소.length) { console.log(`${c.name.padEnd(7)} 0`); i++; continue; }
  const 크기 = new Set<string>(); let 색 = 0;
  for (const u of 주소.slice(0, 3)) {
    const r = await fetch(u); if (!r.ok) continue;
    const b = Buffer.from(await r.arrayBuffer());
    const m = await sharp(b).metadata();
    크기.add(`${m.width}x${m.height}`);
    if (!색) {
      const { data: raw, info } = await sharp(b).resize(64, 64, { kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const s = new Set<string>();
      for (let p = 0; p < raw.length; p += info.channels) s.add(`${raw[p]},${raw[p + 1]},${raw[p + 2]}`);
      색 = s.size;
      조각.push({ input: await sharp(b).resize(칸, 칸, { fit: "cover" }).png().toBuffer(), left: (i % 7) * 칸, top: 30 });
    }
  }
  console.log(`${c.name.padEnd(7)} ${String(주소.length).padStart(2)}        ${[...크기].join(" ").padEnd(18)}  ${색}색${색 > 200 ? " ← 도트 아님" : ""}`);
  i++;
}
if (조각.length) {
  const svg = `<svg width="${칸 * 7}" height="30"><style>text{font-family:sans-serif;font-size:20px;fill:#fff}</style><text x="8" y="22">피드 사진 — ${사람.map((c: any) => c.name).join(" · ")}</text></svg>`;
  조각.push({ input: Buffer.from(svg), left: 0, top: 0 });
  const out = "C:/Users/az518/Desktop/ai-workforce/engine/work/probe/feed.png";
  await sharp({ create: { width: 칸 * 7, height: 칸 + 30, channels: 4, background: { r: 24, g: 24, b: 32, alpha: 1 } } }).composite(조각).png().toFile(out);
  console.log(`\n${out}`);
}
