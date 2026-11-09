/** 사진이 어디에서 오고 뭐라고 적혀 있나 — 새로 뽑기 전에 자리를 확인한다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data, error } = await db.from("dot_characters").select("slug, name, photos, look").eq("is_public", true).order("slug");
if (error) { console.log("못 읽었다:", error.message); process.exit(1); }
for (const c of data as any[]) {
  const ps = (c.photos ?? []) as { url: string; caption: string }[];
  console.log(`${c.slug.padEnd(6)} ${ps.length}장  ${ps[0]?.url?.slice(0, 64) ?? "-"}`);
  console.log(`       ${ps.map((p) => p.caption).join(" · ")}`);
  console.log(`       생김새: ${(c.look ?? "").slice(0, 90)}`);
}
