/** 앱이 쓰는 DB 에 **새 게시물이 들어오고 있나**. 일꾼 재배선(11-10) 뒤 확인용. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
console.log("DB", (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace("https://", "").split(".")[0]);
const { data, error } = await db.from("dot_posts").select("caption, published_on, created_at").order("created_at", { ascending: false }).limit(6);
if (error) { console.log("틀림", error.message); process.exit(1); }
for (const p of data ?? []) console.log(`  ${p.created_at}  ${String(p.caption).slice(0, 34)}`);
const 최신 = data?.[0]?.created_at ? new Date(data[0].created_at) : null;
const 시간 = 최신 ? (Date.now() - 최신.getTime()) / 36e5 : NaN;
console.log(최신 ? `\n제일 새 글 ${시간.toFixed(1)}시간 전` : "\n글이 없다");
