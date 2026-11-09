/**
 * **일꾼과 웹이 서로 다른 DB 를 본다.** 어느 쪽이 진짜 운영인지 숫자로 가른다.
 * 열쇠는 railway 에서 받아 **찍지 않고** 쓴다. 보는 것: 캐릭터 수 · 마지막 게시물 · 마지막 대화 · 사람 수.
 */
import { execFileSync } from "node:child_process";
const { createClient } = await import("@supabase/supabase-js");

function 변수(서비스: string): Record<string, string> {
  return JSON.parse(execFileSync("cmd", ["/c", "railway", "variables", "--service", 서비스, "--json"], { encoding: "utf8", maxBuffer: 1 << 24 }));
}
for (const 서비스 of ["dot-web", "dot-worker"]) {
  const v = 변수(서비스);
  const url = v.NEXT_PUBLIC_SUPABASE_URL, key = v.SUPABASE_SECRET_KEY ?? v.SUPABASE_SERVICE_ROLE_KEY ?? v.SUPABASE_ANON_KEY;
  const ref = (url ?? "").replace("https://", "").split(".")[0];
  if (!url || !key) { console.log(`${서비스}: 열쇠가 없다`); continue; }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const 세기 = async (표: string) => (await db.from(표).select("*", { count: "exact", head: true })).count ?? -1;
  const 마지막 = async (표: string, 칸: string) => ((await db.from(표).select(칸).order(칸, { ascending: false }).limit(1)).data?.[0] as any)?.[칸] ?? "없음";
  console.log(`\n${서비스}  (${ref})`);
  console.log(`  캐릭터 ${await 세기("dot_characters")} · 게시물 ${await 세기("dot_posts")} · 대화 ${await 세기("dot_messages")}`);
  console.log(`  마지막 게시물 ${await 마지막("dot_posts", "published_on")} · 마지막 대화 ${String(await 마지막("dot_messages", "created_at")).slice(0, 16)}`);
}
