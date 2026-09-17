/** 자동 판정이 붙은 결과물 중 예측과 이어지는 것 (100회차 09-14). npx tsx engine/tools/rookery_env.mts engine/tools/genesis_verdict_links.mts */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const { data: dels } = await svc.from("deliverables").select("id, assignment_id, work_execution_id, verdict:content_json->verdict->>verdict");
const { data: preds } = await svc.from("work_predictions").select("id, assignment_id, work_execution_id, p_approved");
const P = (preds ?? []) as { assignment_id: string | null; work_execution_id: string | null; p_approved: number }[];
const byExec = new Set(P.map((p) => p.work_execution_id).filter(Boolean));
const byAssign = new Set(P.map((p) => p.assignment_id).filter(Boolean));
const D = (dels ?? []) as { assignment_id: string | null; work_execution_id: string | null; verdict: string | null }[];
const decided = D.filter((d) => d.verdict === "PASS" || d.verdict === "FAIL" || d.verdict === "PARTIAL");
const linkedExec = decided.filter((d) => d.work_execution_id && byExec.has(d.work_execution_id)).length;
const linkedAssign = decided.filter((d) => d.assignment_id && byAssign.has(d.assignment_id)).length;
const assignIds = new Set(decided.filter((d) => d.assignment_id && byAssign.has(d.assignment_id)).map((d) => d.assignment_id));
console.log("판정 있는 결과물(PASS/FAIL/PARTIAL)", decided.length);
console.log("  예측과 실행 id 로 이어짐", linkedExec);
console.log("  예측과 업무 id 로 이어짐", linkedAssign, "| 서로 다른 업무", assignIds.size);
const ps = P.map((p) => p.p_approved).filter((x) => typeof x === "number");
console.log("예측 확률 분포: n", ps.length, "평균", (ps.reduce((a, b) => a + b, 0) / Math.max(1, ps.length)).toFixed(3), "최소", Math.min(...ps).toFixed(3), "최대", Math.max(...ps).toFixed(3));
