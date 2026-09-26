import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.DOT_SUPABASE_URL!, process.env.DOT_SUPABASE_KEY!, { auth: { persistSession: false } });
const slug = process.argv[2] ?? "yuna";
const { data } = await db.from("dot_characters").select("sprites").eq("slug", slug).maybeSingle();
const sp = ((data as { sprites: Record<string,string> } | null)?.sprites) ?? {};
const dir = `C:/Users/az518/Desktop/도트-${slug}`;
fs.mkdirSync(dir, { recursive: true });
console.log("표정:", Object.keys(sp).join(", "));
for (const [emo, u] of Object.entries(sp)) {
  try {
    const r = await fetch(String(u));
    if (!r.ok) { console.log(`  ${emo}: HTTP ${r.status}`); continue; }
    const b = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(`${dir}/${emo}.png`, b);
    console.log(`  ${emo}: ${(b.length/1024).toFixed(0)} KB`);
  } catch (e) { console.log(`  ${emo}: ${e instanceof Error ? e.message : e}`); }
}
