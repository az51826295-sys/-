/**
 * Railway 에 띄운 Supabase 스택의 anon·service 열쇠를 만들어 시험한다 (10-24).
 *   railway variables --service Postgrest --json > engine/work/probe/_pgrst.json
 *   node engine/work/probe/railway_supabase_열쇠.mjs
 *
 * 자가 호스팅 Supabase 는 열쇠를 따로 주지 않는다 — **JWT 비밀(ROOT_SECRET)로 직접 서명**해서 만든다.
 * 값은 **화면에 안 찍는다.** 통했는지만 적고, 열쇠는 `.keys/dot-railway.json` 에만 쓴다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHmac } from "node:crypto";

const 터 = "https://envoy-production-564b.up.railway.app";
const vars = JSON.parse(readFileSync("engine/work/probe/_pgrst.json", "utf8"));
const 비밀 = vars.ROOT_SECRET;
if (!비밀) { console.error("ROOT_SECRET 을 못 찾았다"); process.exit(1); }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function 만들기(role) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role, iss: "supabase", iat: now, exp: now + 60 * 60 * 24 * 3650 });
  const sig = createHmac("sha256", 비밀).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

const anon = 만들기("anon");
const service = 만들기("service_role");

/** 진짜 통하나 — REST 가 열쇠를 받아 주는지 */
const 재기 = async (이름, 열쇠) => {
  const r = await fetch(`${터}/rest/v1/`, { headers: { apikey: 열쇠, Authorization: `Bearer ${열쇠}` } });
  console.log(`  ${이름.padEnd(13)} ${r.status} ${r.status < 400 ? "통함" : "거절"}`);
  return r.status;
};
const a = await 재기("anon", anon);
const s = await 재기("service_role", service);

if (a < 400 || s < 400) {
  mkdirSync(".keys", { recursive: true });
  writeFileSync(".keys/dot-railway.json", JSON.stringify({ url: 터, anon, service }, null, 2));
  console.log("  열쇠를 .keys/dot-railway.json 에 넣었다 (화면엔 안 찍는다)");
} else {
  console.log("  **아직 안 통한다** — 서명 방식이 다르거나 스택이 더 떠야 한다");
}
