/** 실패 실행의 종류 (100회차 09-14). npx tsx engine/tools/rookery_env.mts engine/tools/genesis_failure_kinds.mts */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const { data } = await svc.from("work_executions").select("error_code, error_message, execution_type, created_at").eq("status", "failed").order("created_at");
const byCode: Record<string, number> = {};
for (const r of (data ?? []) as { error_code: string | null; error_message: string | null; execution_type: string | null }[]) byCode[`${r.execution_type ?? "?"} | ${r.error_code ?? "(코드 없음)"}`] = (byCode[`${r.execution_type ?? "?"} | ${r.error_code ?? "(코드 없음)"}`] ?? 0) + 1;
console.log(JSON.stringify(byCode, null, 1));
for (const r of ((data ?? []) as { error_message: string | null; created_at: string }[]).slice(-6)) console.log(r.created_at.slice(0, 10), "|", (r.error_message ?? "").replace(/\s+/g, " ").slice(0, 160));
