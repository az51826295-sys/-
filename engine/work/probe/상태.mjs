/** 지금 두 DB 가 진짜 어떤 상태인가 — 셈으로만 답한다. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const 도트 = JSON.parse(readFileSync(뿌리 + "/.keys/dot-new.json", "utf8"));

/** 로키 열쇠는 rookery_env 가 찾는 자리에서 집는다 */
const 후보 = [
  process.env.LOCALAPPDATA && process.env.LOCALAPPDATA + "/rookery-dot/rookery-main-keys.json",
  process.env.USERPROFILE && process.env.USERPROFILE + "/.rookery/rookery-main-keys.json",
].filter(Boolean);
let 로키키 = null;
for (const p of 후보) { try { 로키키 = JSON.parse(readFileSync(p, "utf8")); break; } catch { /* 다음 */ } }

const 재기 = async (라벨, k, 표들) => {
  console.log("── " + 라벨 + " " + (k ? k.url.replace(/https:\/\/([a-z]{6}).*/, "$1…") : "(열쇠 없음)"));
  if (!k) return;
  const db = createClient(k.url, k.service, { auth: { persistSession: false } });
  for (const t of 표들) {
    const r = await db.from(t).select("*", { count: "exact", head: true });
    console.log("   " + t.padEnd(26) + (r.error ? "오류 " + r.status + " " + (r.error.message || "(본문 없음)") : String(r.count)));
  }
};

await 재기("두근도트 새 DB", 도트, ["dot_characters", "dot_messages", "dot_bonds", "dot_push_subs", "dot_posts"]);
await 재기("로키", 로키키, ["assignments", "deliverables", "model_calls", "conversation_messages"]);

/** 최근 것이 있나 — 날짜별로 */
if (로키키) {
  const db = createClient(로키키.url, 로키키.service, { auth: { persistSession: false } });
  const { data, error } = await db.from("model_calls").select("created_at").order("created_at", { ascending: false }).limit(1);
  console.log("\n로키 마지막 모델 호출: " + (error ? "오류 " + error.message : (data?.[0]?.created_at ?? "없음")));
}
const ddb = createClient(도트.url, 도트.service, { auth: { persistSession: false } });
const { data: dm } = await ddb.from("dot_messages").select("created_at").order("created_at", { ascending: false }).limit(1);
console.log("도트 마지막 말: " + (dm?.[0]?.created_at ?? "없음"));
