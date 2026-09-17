/** 대화 사례 모양 (100회차 09-14) — 폐쇄 고리 학습 재료. npx tsx engine/tools/rookery_env.mts engine/tools/genesis_chat_shape.mts */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const m = await svc.from("conversation_messages").select("*").limit(1);
console.log("conversation_messages 열:", Object.keys((m.data?.[0] ?? {}) as object).join(", "));
const { data: roles } = await svc.from("conversation_messages").select("role");
const tally: Record<string, number> = {};
for (const r of (roles ?? []) as { role: string }[]) tally[r.role] = (tally[r.role] ?? 0) + 1;
console.log("역할별", JSON.stringify(tally));
const words = ["다시", "아니", "틀렸", "잘못", "이상해", "안 돼", "안돼"];
for (const w of words) {
  const { count } = await svc.from("conversation_messages").select("*", { count: "exact", head: true }).eq("role", "user").ilike("content", `%${w}%`);
  console.log(`사용자 줄에 '${w}'`, count);
}
const a = await svc.from("assignments").select("*").limit(1);
console.log("assignments 열:", Object.keys((a.data?.[0] ?? {}) as object).join(", "));
