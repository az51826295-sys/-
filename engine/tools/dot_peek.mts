/**
 * **눈으로 보기용 계정 하나** (227회차 09-29). 모델 호출 0 · 값 0.
 *
 *   npx tsx engine/tools/dot_peek.mts            # 새 계정 + 비밀번호 없는 로그인 링크
 *   npx tsx engine/tools/dot_peek.mts --delete <uid>
 *
 * `dot_qa_session.mts` 는 실제 모델로 몇 턴을 돌려서 값이 든다. 화면 구조만 볼 때는 그게 필요 없다 —
 * **처음 온 사람이 보는 화면**을 보려면 오히려 아무것도 안 한 계정이어야 한다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const BASE = process.argv.find((a) => a.startsWith("https://")) ?? "https://dot-web-production-7e03.up.railway.app";

if (process.argv[2] === "--delete") {
  await svc.auth.admin.deleteUser(process.argv[3]);
  console.log("지움", process.argv[3]);
  process.exit(0);
}

const email = `peek-${Date.now().toString(36)}@dot.test`;
const { data: made, error: me } = await svc.auth.admin.createUser({ email, email_confirm: true });
if (me) { console.error("계정 못 만듦:", me.message); process.exit(1); }
const { data, error } = await svc.auth.admin.generateLink({ type: "magiclink", email });
if (error) { console.error("링크 못 만듦:", error.message); process.exit(1); }
console.log(`uid ${made.user!.id}`);
console.log(`${BASE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
