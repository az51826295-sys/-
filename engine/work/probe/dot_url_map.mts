import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data } = await db.from("dot_characters").select("slug, sprites").eq("is_public", true).order("slug");
for (const c of data as any[]) for (const [k, v] of Object.entries(c.sprites as Record<string, string>)) console.log(`${c.slug}\t${k}\t${v}`);
