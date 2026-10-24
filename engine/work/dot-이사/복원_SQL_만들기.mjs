/**
 * 두근도트 이사 — **못 들어간 표**를 되살리는 SQL 한 장을 만든다 (10-24).
 *
 * 왜 필요한가: 이사 때 `dot_characters`(8) · `dot_posts`(156) 만 들어갔고
 * 나머지는 전부 0 이었다. 까닭은 **`auth.users` 를 내 권한으로 못 쓰기 때문**이다 —
 * 말·친밀도·결제는 전부 `user_id` 로 계정을 참조하니, 계정이 없으면 한 줄도 안 들어간다.
 * 그래서 계정부터 넣는 SQL 을 **사장님이 한 번 붙여넣게** 따로 뽑는다.
 *
 *   node engine/work/dot-이사/복원_SQL_만들기.mjs
 *   → engine/work/dot-이사/복원.sql  (Supabase SQL 편집기에 통째로 붙여넣기)
 */
import { readFileSync, writeFileSync } from "node:fs";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce/engine/work/dot-이사";
const d = JSON.parse(readFileSync(뿌리 + "/dot-dump.json", "utf8"));

/** 넣을 순서 — 참조하는 쪽이 뒤에 온다 */
const 순서 = [
  ["auth.users", "auth_users"],
  ["auth.identities", "auth_identities"],
  ["public.dot_bonds", "dot_bonds"],
  ["public.dot_messages", "dot_messages"],
  ["public.dot_turns", "dot_turns"],
  ["public.dot_usage", "dot_usage"],
  ["public.dot_follows", "dot_follows"],
  ["public.dot_post_likes", "dot_post_likes"],
  ["public.dot_purchases", "dot_purchases"],
  ["public.dot_wallet", "dot_wallet"],
  ["public.dot_entitlements", "dot_entitlements"],
  ["public.dot_character_follows", "dot_character_follows"],
  ["public.dot_user_posts", "dot_user_posts"],
  ["public.dot_user_post_likes", "dot_user_post_likes"],
  ["public.dot_push_subs", "dot_push_subs"],
];

/** 달러 인용 — 홑따옴표를 안 건드려도 되게. 본문에 안 나오는 꼬리표를 고른다. */
function 인용(s) {
  for (let i = 0; i < 50; i++) {
    const tag = "$j" + i + "$";
    if (!s.includes(tag)) return tag + s + tag;
  }
  throw new Error("꼬리표를 못 골랐다");
}

const 줄 = [];
줄.push("-- 두근도트 이사 복원 — 10-24 생성. Supabase SQL 편집기에 **통째로** 붙여넣고 Run.");
줄.push("-- 계정 22개부터 넣어야 말·친밀도·결제가 들어간다. 이미 있는 줄은 건너뛴다(ON CONFLICT DO NOTHING).");
줄.push("begin;");
줄.push("");

let 합 = 0;
for (const [표, 키] of 순서) {
  const 줄들 = d[키];
  if (!줄들 || !줄들.length) { 줄.push("-- " + 표 + ": 옮길 줄 없음"); continue; }
  합 += 줄들.length;
  const 칸 = Object.keys(줄들[0]);
  줄.push("-- " + 표 + " — " + 줄들.length + "줄");
  줄.push("insert into " + 표 + " (" + 칸.map((c) => '"' + c + '"').join(", ") + ")");
  줄.push("select " + 칸.map((c) => '"' + c + '"').join(", "));
  줄.push("from json_populate_recordset(null::" + 표 + ", " + 인용(JSON.stringify(줄들)) + "::json)");
  줄.push("on conflict do nothing;");
  줄.push("");
}

줄.push("commit;");
줄.push("");
줄.push("-- 확인: 각 표가 몇 줄인가");
줄.push("select 'auth.users' t, count(*) n from auth.users");
for (const [표, 키] of 순서.slice(2)) {
  if (!d[키] || !d[키].length) continue;
  줄.push("union all select '" + 표 + "', count(*) from " + 표);
}
줄.push("order by 1;");

const sql = 줄.join("\n");
writeFileSync(뿌리 + "/복원.sql", sql, "utf8");
console.log("복원.sql 썼다 — " + 합 + "줄 · " + sql.length + "자");
