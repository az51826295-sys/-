// 대화 화면이 열려 있지 않을 때, 끝난 일을 대화에 붙이는 제품 코드(collectWorkReturns)를 그대로 부른다.
// 실행: npx tsx engine/tools/post_returns.mts <conversationId>
import fs from "node:fs";
const NL = String.fromCharCode(10), CR = String.fromCharCode(13);
for (const raw of fs.readFileSync(".env.local", "utf8").split(NL)) {
  const l = raw.replace(CR, ""); const i = l.indexOf("=");
  if (i < 0 || l.startsWith("#")) continue;
  const k = l.slice(0, i).trim(); if (!(k in process.env)) process.env[k] = l.slice(i + 1).trim();
}
const [{ createServiceClient }, { collectWorkReturns }] = await Promise.all([import("@/lib/supabase/service"), import("@/lib/chat/workReturns")]);
const r = await collectWorkReturns(createServiceClient(), process.argv[2]);
console.log(JSON.stringify({ pending: r.pending, posted: r.posted.map((p) => p.content.slice(0, 80)), steps: r.steps }, null, 1));
