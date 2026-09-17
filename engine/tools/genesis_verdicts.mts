/** 결과물 자동 판정 개수 (100회차 09-14) — 예측을 사람 판정 없이 채점할 수 있는가. npx tsx engine/tools/rookery_env.mts engine/tools/genesis_verdicts.mts */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const { data, error } = await svc.from("deliverables").select("id, deliverable_type, created_at, verdict:content_json->verdict->>verdict, checks:content_json->unityChecks");
if (error) { console.log("ERR", error.message); process.exit(1); }
const rows = (data ?? []) as { deliverable_type: string; created_at: string; verdict: string | null; checks: { cases?: { result: string }[] } | null }[];
const byVerdict: Record<string, number> = {}; const byType: Record<string, number> = {};
let withCases = 0, passedAll = 0;
for (const r of rows) {
  byVerdict[r.verdict ?? "(없음)"] = (byVerdict[r.verdict ?? "(없음)"] ?? 0) + 1;
  byType[r.deliverable_type] = (byType[r.deliverable_type] ?? 0) + 1;
  const cases = r.checks?.cases ?? [];
  if (cases.length) { withCases++; if (cases.every((c) => c.result === "Passed")) passedAll++; }
}
console.log("결과물", rows.length, "| 판정별", JSON.stringify(byVerdict));
console.log("검사 케이스 있는 결과물", withCases, "| 전부 통과", passedAll);
console.log("종류별", JSON.stringify(byType));
const newest = rows.map((r) => r.created_at).sort().slice(-1)[0];
console.log("가장 최근 결과물", newest);
