// Genesis 연결 검증 — 스키마가 실제로 주장한 대로 동작하는지 본다.
// 모델 호출 없음. 검사용 행 1건을 넣었다 지우는 것 외에 데이터를 바꾸지 않는다.
//
//   node scripts/genesis-verify.mjs
//
// 검증하는 주장은 세 가지다.
//   1. 예측 원장과 채점 뷰가 존재한다
//   2. 커밋된 예측은 **수정할 수 없다** (여기가 Genesis 전체의 토대)
//   3. 추정기가 근거 없이도 합리적인 사전 확률을 낸다
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);

let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`   ✓ ${name}`);
  passed += 1;
}
function bad(name, detail) {
  console.log(`   ✗ ${name}`);
  if (detail) console.log(`     ${detail}`);
  failed += 1;
}

console.log("\nGenesis 연결 검증\n");
console.log("── 스키마 ───────────────────────────────────────────");

const { error: tableError } = await db.from("work_predictions").select("id").limit(1);
if (tableError) {
  bad("work_predictions 테이블 존재", tableError.message);
  console.log("\n   마이그레이션이 아직 적용되지 않았습니다:");
  console.log("   node scripts/run-sql.mjs supabase/schema_genesis.sql\n");
  process.exit(1);
}
ok("work_predictions 테이블 존재");

const { error: viewError } = await db
  .from("work_prediction_scores")
  .select("prediction_id")
  .limit(1);
if (viewError) bad("work_prediction_scores 뷰 존재", viewError.message);
else ok("work_prediction_scores 뷰 존재");

// ── 예측 잠금 ────────────────────────────────────────────────────
//
// 이게 이 스크립트의 존재 이유다. 결과를 본 뒤에 예측을 고칠 수 있는
// 시스템에서 "예측 오차"는 아무 의미도 없는 숫자다.
console.log("\n── 예측 잠금 (가장 중요) ────────────────────────────");

const { data: exec } = await db
  .from("work_executions")
  .select("id, company_id, assignment_id, company_employee_id")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (!exec) {
  console.log("   ⓘ 실행 기록이 없어 잠금 검사를 건너뜁니다.");
  console.log("     업무를 한 건 실행한 뒤 다시 돌려주세요.");
} else {
  // 이미 예측이 있는 실행이면 검사용 행을 못 넣는다 (unique 제약).
  const { data: existing } = await db
    .from("work_predictions")
    .select("id")
    .eq("work_execution_id", exec.id)
    .maybeSingle();

  let testId = existing?.id ?? null;
  let inserted = false;

  if (!testId) {
    const { data: created, error: insertError } = await db
      .from("work_predictions")
      .insert({
        company_id: exec.company_id,
        assignment_id: exec.assignment_id,
        work_execution_id: exec.id,
        company_employee_id: exec.company_employee_id,
        skill_id: "__verify__",
        p_approved: 0.5,
        basis: { verify: true },
      })
      .select("id")
      .single();

    if (insertError) {
      bad("예측 삽입", insertError.message);
    } else {
      testId = created.id;
      inserted = true;
      ok("예측 삽입");
    }
  } else {
    console.log("   ⓘ 이 실행에는 이미 예측이 있어 그 행으로 검사합니다.");
  }

  if (testId) {
    // 결과를 본 뒤 유리하게 고치려는 시도. 반드시 거부되어야 한다.
    const { error: updateError } = await db
      .from("work_predictions")
      .update({ p_approved: 0.95 })
      .eq("id", testId);

    if (updateError) ok(`커밋된 예측 수정 거부 — "${updateError.message.slice(0, 60)}"`);
    else bad("커밋된 예측 수정 거부", "수정이 통과했다. 트리거가 없거나 동작하지 않는다.");

    // 값이 실제로 안 바뀌었는지 확인
    const { data: after } = await db
      .from("work_predictions")
      .select("p_approved")
      .eq("id", testId)
      .maybeSingle();

    if (after && Number(after.p_approved) !== 0.95) ok("예측 값이 그대로 유지됨");
    else bad("예측 값이 그대로 유지됨", `현재 값 ${after?.p_approved}`);

    if (inserted) {
      await db.from("work_predictions").delete().eq("id", testId);
      console.log("   ⓘ 검사용 행을 정리했습니다.");
    }
  }
}

// ── 추정기 ───────────────────────────────────────────────────────
console.log("\n── 추정기 ───────────────────────────────────────────");

const { estimateApproval } = await import("../src/lib/genesis/predict.ts");

const { data: anyCompany } = await db.from("companies").select("id").limit(1).maybeSingle();

if (!anyCompany) {
  console.log("   ⓘ 회사가 없어 건너뜁니다.");
} else {
  const result = await estimateApproval(db, anyCompany.id, {
    skillId: "market_research",
    assignmentType: "manager",
    recurring: false,
    memoryCount: 0,
  });
  if (result.pApproved > 0 && result.pApproved < 1) {
    ok(`확률이 (0,1) 범위 — ${result.pApproved.toFixed(2)}, 약한 고리 ${result.weakest}`);
  } else {
    bad("확률 범위", String(result.pApproved));
  }
}

console.log(`\n${"─".repeat(52)}`);
console.log(`   통과 ${passed} / 실패 ${failed}\n`);
if (failed > 0) process.exitCode = 1;
