// 사장님 구글 메일로 이미 있는 두근도트 계정이 어떤 모양인가(읽기만). 메일 주소는 인자로 받고 출력에 안 찍는다.
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const want = (process.argv[2] ?? "").toLowerCase();
console.log("프로젝트", new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host.split(".")[0]);
for (let page = 1; page < 50; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.log("오류", error.message); break; }
  for (const u of data.users) if ((u.email ?? "").toLowerCase() === want)
    console.log(JSON.stringify({ id: u.id.slice(0, 8), providers: u.app_metadata?.providers, confirmed: !!u.email_confirmed_at, anon: u.is_anonymous, created: u.created_at, last: u.last_sign_in_at, identities: u.identities?.map((x) => x.provider) }));
  if (data.users.length < 200) break;
}
