/** 어떤 표에 어떤 칸이 있나 — DDL 열쇠가 없으니 **있는 칸 안에서** 설계해야 한다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
for (const t of ["dot_bonds", "dot_messages", "dot_posts", "dot_usage", "dot_wallet", "dot_entitlements", "dot_tarot"]) {
  const { data, error } = await db.from(t).select("*").limit(1);
  if (error) { console.log(`${t.padEnd(18)} ✗ ${error.message.slice(0, 60)}`); continue; }
  console.log(`${t.padEnd(18)} ${data?.length ? Object.keys(data[0]).join(", ") : "(줄이 없어 칸을 못 봄)"}`);
}
