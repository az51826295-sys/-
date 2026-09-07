/**
 * 되묻기 답을 대화 대신 넣는 도구(로그인 없이 시험할 때). 대화 화면에선 사장님이 '시작' 이라고 치면 같은 길로 간다.
 *   npx tsx engine/tools/approve.mts <conversationId> "<말>"
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { pendingApproval, classifyApprovalReply, resumeApproved, cancelPending } from "../../src/lib/execution/approval";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const [conversationId, said] = process.argv.slice(2);
if (!conversationId || !said) { console.error("쓰는 법: approve.mts <conversationId> \"<말>\""); process.exit(1); }

const pending = await pendingApproval(db, conversationId);
if (!pending) { console.log("확인을 기다리는 계획이 없다"); process.exit(0); }
const kind = classifyApprovalReply(said);
let reply: string;
let assignment: { id: string; title: string; queued: boolean } | null = { id: pending.assignmentId, title: pending.title, queued: true };
if (kind === "cancel") { await cancelPending(db, pending); reply = "네, 접을게요."; assignment = null; }
else if (kind === "yes") { await resumeApproved(db, pending, null); reply = "네, 그대로 시작할게요. 끝나면 여기 붙고, 유니티가 재요."; }
else { const r = await resumeApproved(db, pending, said); reply = r.mode === "replan" ? "네, 그 말을 얹어서 계획을 다시 써 볼게요." : "네, 그 말을 얹어서 이번엔 바로 만들게요."; }
await db.from("conversation_messages").insert([
  { conversation_id: conversationId, role: "user", content: said, attachments: null },
  { conversation_id: conversationId, role: "assistant", content: reply, attachments: { assignment } },
]);
console.log(kind, "→", reply, "| assignment", pending.assignmentId.slice(0, 8), "round", pending.round);
