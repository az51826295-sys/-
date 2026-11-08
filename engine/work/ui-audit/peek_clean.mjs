/** 오늘 화면 점검에 쓴 `peek-*@dot.test` 계정 치우기. 먼저 세고, --delete 를 줄 때만 지운다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) { console.log("못 읽음:", error.message); process.exit(1); }
const 것 = data.users.filter((u) => (u.email ?? "").startsWith("peek-") && (u.email ?? "").endsWith("@dot.test"));
console.log(`peek 계정 ${것.length}개 / 전체 ${data.users.length}명`);
if (process.argv[2] !== "--delete") { console.log("지우려면 --delete"); process.exit(0); }
let n = 0;
for (const u of 것) { const { error: e } = await db.auth.admin.deleteUser(u.id); if (e) console.log("못 지움", u.email, e.message); else n++; }
console.log(`지움 ${n}개`);
