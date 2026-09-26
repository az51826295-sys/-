import { createClient } from "@supabase/supabase-js";
const url = process.env.DOT_SUPABASE_URL!, key = process.env.DOT_SUPABASE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await db.from("dot_characters").select("slug,name,sprites");
if (error) { console.log("못 읽음:", error.message); process.exit(1); }
for (const r of (data ?? []) as { slug: string; name: string; sprites: Record<string,string> | null }[]) {
  const sp = r.sprites ?? {};
  const one = Object.values(sp)[0] ?? "";
  const host = /https?:\/\/([^/]+)/.exec(String(one))?.[1] ?? "(경로)";
  console.log(`${String(r.slug).padEnd(16)} ${String(r.name).padEnd(6)} 표정 ${Object.keys(sp).length}장 · ${host}`);
}
