/**
 * 구글 플레이 심사용 로키 계정 (100회차 09-13). 로키는 로그인해야 제대로 쓰므로 콘솔 "앱 액세스" 에 계정을 적어야 한다.
 * 계정은 여기서 만들고, 비밀번호는 **저장소 밖**(%LOCALAPPDATA%/rookery-dot/play-reviewer.txt)에만 둔다.
 * 콘솔에 비밀번호를 적는 것은 사장님이 한다(내가 비밀번호 칸을 채우지 않는다).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rookery_play_reviewer.mts
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const OUT = `${process.env.LOCALAPPDATA}/rookery-dot/play-reviewer.txt`;
const email = "playreview@rookery.local";

if (existsSync(OUT)) { console.log(`이미 있음 → ${OUT} (${readFileSync(OUT, "utf8").split("\n")[0]})`); process.exit(0); }
const password = `Rk-${randomBytes(9).toString("base64url")}`;
const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
await svc.from("companies").insert({ owner_id: data.user.id, name: "Play 심사" });
writeFileSync(OUT, `이메일: ${email}\n비밀번호: ${password}\n용도: Google Play 콘솔 > 앱 콘텐츠 > 앱 액세스 (심사원 로그인)\n`, "utf8");
console.log(`만듦: ${email} · uid ${data.user.id.slice(0, 8)} · 비밀번호는 ${OUT}`);
