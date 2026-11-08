/**
 * 화면 점검용 **로그인 링크 한 개**. 계정은 `peek-<시각>@dot.test` 로 만들고,
 * 끝나면 `peek_clean.mjs --delete` 가 지운다(남기면 운영 계정 목록이 더러워진다).
 *
 * 토큰은 Supabase 가 만들고 주소는 운영이 박혀 나온다 — 자(`dot_ui_audit`)가 `DOT_BASE` 로
 * 주소만 바꿔 들어간다. 열쇠가 같으니 토큰은 로컬 서버에서도 그대로 통한다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const email = `peek-${Date.now()}@dot.test`;
const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
if (error) { console.log("못 만듦:", error.message); process.exit(1); }
/* `action_link` 는 Supabase 로 먼저 갔다 돌아오는 길이라 로컬에선 안 통한다.
   `/auth/confirm` 길로 바로 넣는다 — 새 계정이면 종류가 `signup` 으로 나오니 그대로 쓴다. */
const p = data.properties;
console.log(`https://dot-web-production-7e03.up.railway.app/auth/confirm?token_hash=${p.hashed_token}&type=${p.verification_type ?? "magiclink"}`);
