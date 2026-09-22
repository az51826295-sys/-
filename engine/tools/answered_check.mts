/**
 * **응답이 말한 이름이 원장까지 흐르는가** (205회차 09-22).
 *
 *   --order   데모 회사에 아주 작은 고치는 판 하나를 넣는다(모델을 실제로 부른다)
 *   (없으면)  최근 원장 줄의 `부른 이름 → 응답이 말한 이름 · 지문` 을 편다
 *
 * **왜 시험 호출로 안 되나**: 시험 호출은 회사 범위가 없어 원장에 안 적힌다.
 * 09-21 에 딥시크를 직접 불러 지문(aeb56401…)을 받고도 "원장까지 흐른다" 고
 * 적었는데, 실제 판을 보니 딥시크 줄은 전부 빈 채였다 — 공급자 파일이 달랐다.
 * 그래서 **실제 판의 딥시크 줄을 눈으로 보는 것**만 증거로 센다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const CO = "00add05a-e81d-4e04-9980-34bb412a8780";
const DEV = "e660c68b-5cdf-47ba-9673-5dded5cb8d83";

if (process.argv.includes("--order")) {
  // 고칠 재료 — 데모 회사의 최근 앱 결과물
  const { data: pick } = await db.from("deliverables").select("id, title, created_at")
    .eq("company_id", CO).not("content_json->>files", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!pick) { console.error("고칠 재료가 없다"); process.exit(1); }
  const { data: a, error } = await db.from("assignments").insert({
    company_id: CO, company_employee_id: DEV,
    title: `확인용 판 — ${pick.title}`,
    description: "화면 맨 위 제목 글자를 조금 키워 줘. 고칠 곳만 고쳐.",
    status: "assigned", current_progress_step: "assignment_received",
    role_input_json: { approved: true, verify: true, previousDeliverableId: pick.id },
    role_input_schema_id: "small_app_assignment_v1", priority: "normal",
  }).select("id").single();
  if (error) { console.error(`못 넣음: ${error.message}`); process.exit(1); }
  await db.from("work_executions").insert({ company_id: CO, assignment_id: a!.id, company_employee_id: DEV, status: "queued", current_step: "context_loaded", attempt_number: 1 });
  console.log(`주문: ${a!.id} · 재료 ${pick.title} (${pick.id.slice(0, 8)})`);
  process.exit(0);
}

const since = new Date(Date.now() - 40 * 60_000).toISOString();
const { data: rows } = await db.from("model_usage")
  .select("model, answered_by, answered_fingerprint, purpose, created_at")
  .gte("created_at", since).order("created_at");
if (!rows?.length) { console.log("최근 40분에 원장 줄이 없다"); process.exit(0); }
console.log(`원장 — 부른 이름 → 응답이 말한 이름 · 지문 (최근 40분 ${rows.length}줄)`);
for (const r of rows) {
  console.log(`  ${String(r.model).padEnd(20)} → ${r.answered_by ?? "(빔)"} · ${r.answered_fingerprint ? String(r.answered_fingerprint).slice(0, 8) + "…" : "(빔)"} · ${r.purpose}`);
}
const named = rows.filter((r) => r.answered_by);
console.log(`\n**응답 이름이 찍힌 줄 ${named.length}/${rows.length}**`);
// 갈라서 센다 — 한 덩어리로 세면 luna 가 채워서 딥시크의 0 을 덮는다(09-22 에 실제로 그랬다)
for (const v of ["deepseek", "gpt-", "claude"]) {
  const mine = rows.filter((r) => String(r.model).startsWith(v));
  if (!mine.length) { console.log(`  ${v}: 이번 판에 줄이 없다 — 못 잼`); continue; }
  const ok = mine.filter((r) => r.answered_by).length;
  const fp = mine.filter((r) => r.answered_fingerprint).length;
  console.log(`  ${v}: 이름 ${ok}/${mine.length} · 지문 ${fp}/${mine.length}${ok ? ` (예: ${mine.find((r) => r.answered_by)!.answered_by})` : ""}`);
}
