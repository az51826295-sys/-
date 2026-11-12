/**
 * **개발자 링크를 찍어 준다** (11-13).
 *
 *   railway run --service dot-web -- npx tsx engine/tools/dot_dev_link.mts
 *
 * `railway run` 으로 돌려야 하는 까닭: 열쇠가 **서버 비밀에서 나온다**(`dev.ts` 참고).
 * 이 셸에 그 비밀이 없으면 **지어내지 않고** 왜 못 찍는지 적는다 —
 * 링크를 틀리게 찍으면 404 를 보고 "기능이 안 된다" 고 읽게 된다([[zero-can-mean-i-cannot-see]]).
 *
 * 비밀 자체는 **한 글자도 안 찍는다.** 나오는 것은 HMAC 에서 딴 24자뿐이다.
 */
import { devKey } from "../../src/lib/dot/dev";

const 집 = (process.env.DOT_WEB_URL ?? "https://dot-web-production-7e03.up.railway.app").replace(/\/$/, "");
const k = devKey();

if (!k) {
  console.log("◻︎ 못 찍는다 — 이 셸에 SUPABASE_SECRET_KEY(또는 DOT_DEV_KEY)가 없다.");
  console.log("   railway run --service dot-web -- npx tsx engine/tools/dot_dev_link.mts");
  process.exit(0);
}

console.log(`열기: ${집}/api/dot/dev?key=${k}`);
console.log(`끄기: ${집}/api/dot/dev?off=1`);
console.log(`앱(Bearer)에서는 헤더로: x-dot-dev: ${k}`);
console.log(`\n열쇠가 어디서 왔나: ${process.env.DOT_DEV_KEY ? "DOT_DEV_KEY 변수" : "SUPABASE_SECRET_KEY 에서 딴 HMAC"}`);
