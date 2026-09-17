/** 실패 신호 목록 (100회차 09-14) — 폐쇄 고리 학습의 재료가 몇 개인가. npx tsx engine/tools/rookery_env.mts engine/tools/genesis_failures.mts */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const c = async (t: string, f?: (q: any) => any) => { let q = svc.from(t).select("*", { count: "exact", head: true }); if (f) q = f(q); const r = await q; return r.error ? `ERR ${r.error.message.slice(0, 50)}` : r.count; };
console.log("work_executions 전체", await c("work_executions"));
for (const s of ["failed", "error", "cancelled", "completed", "succeeded"]) console.log("  status=" + s, await c("work_executions", (q) => q.eq("status", s)));
console.log("revision_requests", await c("revision_requests"));
console.log("대화 '수정 요청' 줄", await c("conversation_messages", (q) => q.ilike("content", "%수정 요청%")));
console.log("대화 '다시' 포함 사용자 줄", await c("conversation_messages", (q) => q.eq("role", "user").ilike("content", "%다시%")));
const we = await svc.from("work_executions").select("*").limit(1);
console.log("work_executions 열:", Object.keys((we.data?.[0] ?? {}) as object).join(", "));
const ok = await svc.from("organization_knowledge").select("*").limit(1);
console.log("organization_knowledge 열:", Object.keys((ok.data?.[0] ?? {}) as object).join(", "));
