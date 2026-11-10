/** 재배선 뒤 **앱 DB 에 새 글이 들어오는지** 지켜본다. 최대 25분, 1분마다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const 셈 = async () => (await db.from("dot_posts").select("id", { count: "exact", head: true })).count ?? -1;
const 처음 = await 셈();
console.log(`시작 ${new Date().toISOString()} · 글 ${처음}개`);
for (let i = 0; i < 25; i++) {
  await new Promise((r) => setTimeout(r, 60_000));
  const 지금 = await 셈();
  if (지금 > 처음) {
    const { data } = await db.from("dot_posts").select("caption, created_at").order("created_at", { ascending: false }).limit(지금 - 처음);
    console.log(`맞음  ${지금 - 처음}개 들어왔다 (${i + 1}분)`);
    for (const p of data ?? []) console.log(`  ${p.created_at}  ${String(p.caption).slice(0, 40)}`);
    process.exit(0);
  }
}
console.log("25분 동안 새 글 없음 — 일꾼 로그를 봐야 한다");
process.exit(1);
