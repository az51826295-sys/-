/** 피드 그림이 실제로 몇 색인가 — 색표를 몇 색으로 잡을지는 피드가 정한다. 11-08. */
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
const 모두 = new Set<string>();
for (const c of (data as any[]).filter((x) => x.is_public && x.photos).sort((a, b) => a.slug.localeCompare(b.slug))) {
  const ps: any[] = Array.isArray(c.photos) ? c.photos : Object.values(c.photos);
  const 수: number[] = [];
  const 사람 = new Set<string>();
  for (const u of ps.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean)) {
    const r = await fetch(u); if (!r.ok) { 수.push(-1); continue; }
    const { data: raw, info } = await sharp(Buffer.from(await r.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const s = new Set<string>();
    for (let p = 0; p < raw.length; p += info.channels) {
      if (raw[p + 3] < 16) continue;
      const k = `${raw[p]},${raw[p + 1]},${raw[p + 2]}`;
      s.add(k); 사람.add(k); 모두.add(k);
    }
    수.push(s.size);
  }
  console.log(`${c.name.padEnd(5)} 장당 ${수.join(", ")}색   ·  이 사람 전체 ${사람.size}색`);
}
console.log(`\n일곱 명 합쳐 ${모두.size}색`);
