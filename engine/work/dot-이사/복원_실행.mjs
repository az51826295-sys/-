/**
 * 두근도트 복원을 **내가 직접 실행한다** (10-24). SQL 붙여넣기 없이.
 *
 * 길: Admin API 로 계정을 **원래 id 그대로** 만들고(비밀번호는 안 옮긴다),
 * 나머지 표는 service 열쇠로 그냥 넣는다. `auth.users` 를 손으로 쓸 필요가 없다.
 *
 *   node engine/work/dot-이사/복원_실행.mjs --시험   # 한 명만 해 본다
 *   node engine/work/dot-이사/복원_실행.mjs          # 전부
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const k = JSON.parse(readFileSync(뿌리 + "/.keys/dot-new.json", "utf8"));
const d = JSON.parse(readFileSync(뿌리 + "/engine/work/dot-이사/dot-dump.json", "utf8"));
const db = createClient(k.url, k.service, { auth: { persistSession: false, autoRefreshToken: false } });
const 시험만 = process.argv.includes("--시험");

/** 비밀번호·토큰은 **안 옮긴다.** 구글로 가입한 분은 그대로 들어오고, 나머지는 비밀번호 찾기를 한 번 한다. */
const 사람들 = 시험만 ? d.auth_users.slice(0, 1) : d.auth_users;
let 만듦 = 0, 이미 = 0, 실패 = 0;
const 실패보기 = [];
for (const u of 사람들) {
  const { error } = await db.auth.admin.createUser({
    id: u.id,
    email: u.email,
    email_confirm: !!u.email_confirmed_at,
    user_metadata: u.raw_user_meta_data ?? {},
    app_metadata: u.raw_app_meta_data ?? {},
  });
  if (!error) 만듦++;
  else if (/already (been )?registered|duplicate|already exists/i.test(error.message)) 이미++;
  else { 실패++; if (실패보기.length < 3) 실패보기.push(error.message.slice(0, 90)); }
}
console.log(`계정 — 만듦 ${만듦} · 이미 있음 ${이미} · 실패 ${실패}` + (실패보기.length ? "\n  " + 실패보기.join("\n  ") : ""));
if (시험만) { console.log("\n(시험이라 여기서 멈춘다)"); process.exit(실패 ? 1 : 0); }
if (만듦 + 이미 === 0) { console.log("계정이 하나도 안 들어갔다 — 표는 건드리지 않는다"); process.exit(1); }

/** 참조하는 쪽이 뒤에 오도록 */
const 순서 = ["dot_bonds", "dot_messages", "dot_turns", "dot_usage", "dot_follows",
              "dot_post_likes", "dot_purchases", "dot_wallet", "dot_entitlements"];
for (const 표 of 순서) {
  const 줄들 = d[표];
  if (!줄들?.length) { console.log(표.padEnd(18) + "옮길 줄 없음"); continue; }
  /* 한 번에 다 보내면 큰 표에서 끊긴다 — 200줄씩 */
  let 넣음 = 0, 오류 = null;
  for (let i = 0; i < 줄들.length; i += 200) {
    const { error } = await db.from(표).upsert(줄들.slice(i, i + 200), { ignoreDuplicates: true });
    if (error) { 오류 = error; break; }
    넣음 += Math.min(200, 줄들.length - i);
  }
  const { count } = await db.from(표).select("*", { count: "exact", head: true });
  console.log(표.padEnd(18) + (오류 ? "오류 " + 오류.code + " " + 오류.message.slice(0, 60) : "보냄 " + 넣음) + "  → 지금 " + count + "줄");
}
