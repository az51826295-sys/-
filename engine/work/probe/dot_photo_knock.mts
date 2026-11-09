/** 표에 적힌 사진 주소를 **전부 두드려 본다** — 적힌 것과 열리는 것은 다르다(11-07 에 36장이 404였다). */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data } = await db.from("dot_characters").select("slug, name, photos").eq("is_public", true).order("slug");
let 열림 = 0; const 막힘: string[] = [];
for (const c of data as any[]) {
  for (const p of (c.photos ?? []) as { url: string; caption: string }[]) {
    const r = await fetch(p.url, { cache: "no-store" as any });
    if (r.ok) 열림++; else 막힘.push(`${c.slug} ${p.caption} ${r.status}`);
  }
  console.log(`${c.name.padEnd(4)} ${(c.photos ?? []).length}장`);
}
console.log(`\n열린 사진 ${열림} · 안 열린 것 ${막힘.length} ${막힘.join(", ")}`);
