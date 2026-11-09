import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const h = (b: Buffer) => createHash("sha1").update(b).digest("hex").slice(0, 10);
const { data } = await db.from("dot_characters").select("slug, name, sprites").eq("is_public", true);
let 같음 = 0; const 다름: string[] = [];
for (const c of data as any[]) {
  for (const [감정, url] of Object.entries(c.sprites as Record<string, string>)) {
    const r = await fetch(url as string, { cache: "no-store" as any });
    const 온것 = Buffer.from(await r.arrayBuffer());
    const 로컬 = readFileSync(`C:/Users/az518/Desktop/로키-도트/테두리-20261108/${c.slug}/${감정.replace(":", "-")}.png`);
    if (h(온것) === h(로컬)) 같음++; else 다름.push(`${c.slug}/${감정}`);
  }
}
console.log(`앱이 받는 주소 기준 — 테두리판과 같음 ${같음} · 다름 ${다름.length} ${다름.join(", ")}`);
