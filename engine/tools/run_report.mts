/** 무인 판 판정 — 잠근 다섯 조건을 함수로 돌린다. 읽기만 한다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { judgeRun } = await import("../../src/lib/genesis/unattendedVerdict");
type Run = import("../../src/lib/genesis/unattended").UnattendedRun;
const db = createServiceClient();
const { data: row } = await db.from("genesis_runs").select("id, run_date, result").eq("kind", "unattended").order("run_date", { ascending: false }).limit(1).maybeSingle();
const run = row!.result as Run;
const endAt = run.stoppedAt ?? new Date().toISOString();
const { count: userTurns } = await db.from("conversation_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", run.startedAt).lte("created_at", endAt);
const r = judgeRun(run, { userTurns: userTurns ?? 0, attested: { 개입있었나: false, 배포했나: false } });
console.log(`판 ${row!.run_date} · ${run.startedAt.slice(11,19)} → ${endAt.slice(11,19)} · 멈춤 이유: ${run.stopReason}`);
for (const c of r.conds) console.log(`  ${c.verdict === "통과" ? "통과 " : c.verdict} ${c.n}. ${c.name} — ${c.value} [${c.how}]`);
console.log(`판정: **${r.overall}**`);
console.log(`관찰: 못 붙인 결과 최대 ${run.tally?.maxUnposted} · 진행없음 최대 ${run.tally?.maxStall}분 · 신호 공백 최대 ${run.tally?.maxGapSec}초 · 창 닫음 ${run.closedAt ?? "안 함"}`);
// 왜 실패했나
const { data: fails } = await db.from("work_executions").select("error_code, error_message, created_at").gte("created_at", run.startedAt).eq("status", "failed").order("created_at");
console.log(`\n실패한 실행 ${fails?.length ?? 0}개`);
for (const f of (fails ?? []).slice(-5)) console.log(`  ${f.created_at.slice(11,19)} ${f.error_code}: ${String(f.error_message ?? "").slice(0, 120)}`);
const { data: dls } = await db.from("deliverables").select("id").gte("created_at", run.startedAt);
const { data: mu } = await db.from("model_usage").select("cost_usd").gte("created_at", run.startedAt);
console.log(`\n산출물 ${dls?.length ?? 0}개 · 지출 $${(mu ?? []).reduce((a, x) => a + Number(x.cost_usd ?? 0), 0).toFixed(3)}`);
const { count: left } = await db.from("assignments").select("id", { count: "exact", head: true }).eq("role_input_json->>unattended", "true").eq("status", "waiting");
const { data: held } = await db.from("company_employees").select("id").neq("work_status", "ready");
console.log(`남은 무인 대기열 ${left} · 묶인 직원 ${held?.length ?? 0}명`);
