/**
 * **검사가 못 돌았으면 통과가 아니다** (204회차 09-21). 고장을 심어 잡히는지 본다. 모델 0, 돈 0.
 * 어젯밤 무인 판에서 HTML 이 없어 고리가 `no_run` 으로 멈춘 6판이 채점표에 **통과로** 들어갔다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { headWins } = await import("../../src/lib/skills/appBuild/seats");
const { pendingReview, REVIEW_SINCE } = await import("../../src/lib/genesis/reviewQueue");
const db = createServiceClient();
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const CO = "00add05a-e81d-4e04-9980-34bb412a8780", DEV = "e660c68b-5cdf-47ba-9673-5dded5cb8d83";
const { data: co } = await db.from("companies").select("owner_id").eq("id", CO).single();
const made: string[] = [];
const conv = (await db.from("conversations").insert({ owner_id: co!.owner_id, title: "자 시험 — 안 돈 검사" }).select("id").single()).data!.id as string;
const t0 = Math.max(Date.now(), Date.parse(REVIEW_SINCE)) + 60_000;
const mk = async (title: string, loop: unknown) => {
  const { data: a } = await db.from("assignments").insert({ company_id: CO, company_employee_id: DEV, title, description: "자 시험", status: "cancelled",
    role_input_json: { approved: true }, role_input_schema_id: "small_app_assignment_v1", priority: "normal" }).select("id").single();
  made.push(a!.id as string);
  await db.from("deliverables").insert({ company_id: CO, assignment_id: a!.id, company_employee_id: DEV, title, deliverable_type: "app_build",
    status: "submitted", version: 1, deliverable_scope: "assignment", content_markdown: "자 시험",
    content_json: { loop, seats: { fixMode: "best", fix: "gpt-5.6-luna" } } });
  await db.from("conversation_messages").insert({ conversation_id: conv, role: "assistant", content: "자 시험", created_at: new Date(t0).toISOString(), attachments: { assignment: { id: a!.id, title, queued: true } } });
  return a!.id as string;
};
const before = await headWins(db, 1);
const beforeRev = await pendingReview(db, CO);
try {
  // (가) **고장을 심는다** — 고리가 안 돈 판(no_run)
  await mk("자 시험 — 안 돈 검사", { usd: 0, facts: null, rounds: [], verdict: null, bestRound: 0, stoppedBy: "no_run" });
  const after = await headWins(db, 1);
  check("**안 돈 판은 채점표 통과로 안 센다**", after.best.ok === before.best.ok, { 전: before.best, 후: after.best });
  check("**분모에도 안 들어간다**", after.best.n === before.best.n, { 전: before.best.n, 후: after.best.n });
  const rev = await pendingReview(db, CO);
  check("**안 돈 판은 '기계가 판정함' 에서 빠진다(사람 몫으로 남는다)**", rev.n === beforeRev.n + 1, { 전: beforeRev.n, 후: rev.n });
  // (나) 진짜로 돈 판은 그대로 통과로 센다
  await mk("자 시험 — 돈 검사", { usd: 0.01, rounds: [{ met: 3, unmet: 0, broken: 0 }], stoppedBy: "done" });
  const after2 = await headWins(db, 1);
  check("돈 판은 통과로 센다", after2.best.ok === before.best.ok + 1 && after2.best.n === before.best.n + 1, { 전: before.best, 후: after2.best });
  const rev2 = await pendingReview(db, CO);
  check("돈 판은 사람 몫에서 빠진다", rev2.n === rev.n, { 전: rev.n, 후: rev2.n });
} finally {
  await db.from("deliverables").delete().in("assignment_id", made);
  await db.from("conversation_messages").delete().eq("conversation_id", conv);
  await db.from("conversations").delete().eq("id", conv);
  await db.from("assignments").delete().in("id", made);
  console.log("치움");
}
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
