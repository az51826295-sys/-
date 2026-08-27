import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { executeEmployeeAssignment } from "@/lib/execution/engine";

/**
 * 임시 — 학습 루프 준비.
 *
 * 하는 일 세 가지:
 *   1. Emma 재가동 — 실패(목표 20건은 mock에선 불가능했다)로 블록된
 *      것을 풀고, 달성 가능한 목표(3건)의 새 업무를 만들어 실행한다.
 *   2. Alex 대기열 적재 — 지금은 검토 대기라 새 일을 못 받으므로,
 *      waiting 상태로 쌓아 두면 매니저가 검토할 때마다 자동으로
 *      다음 것이 시작된다 (앱의 기존 동작).
 *   3. 실행은 현재 프로바이더로 돈다 — AI_PROVIDER가 anthropic이면
 *      실제 모델. 지출은 회사 한도($3/30일)가 막는다.
 *
 * 검증이 끝나면 삭제한다.
 */
export async function POST(request: Request) {
  const secret = process.env.INTERNAL_SCHEDULER_SECRET;
  if (!secret || request.headers.get("x-internal-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const report: Record<string, unknown> = { provider: process.env.AI_PROVIDER };

  // ── 1. Emma 재가동 ────────────────────────────────────────────────
  const { data: emmaFailed } = await db
    .from("assignments")
    .select("id, company_id, company_employee_id, description, expected_outcome, priority, role_input_json, role_input_schema_id")
    .eq("id", (await db.from("work_predictions").select("assignment_id").eq("seq", 6).maybeSingle()).data?.assignment_id ?? "")
    .maybeSingle();

  if (emmaFailed) {
    await db.from("company_employees").update({ work_status: "ready" }).eq("id", emmaFailed.company_employee_id);

    const roleInput = {
      ...(emmaFailed.role_input_json as Record<string, unknown>),
      targetCount: 3,
    };

    const { data: assignment } = await db
      .from("assignments")
      .insert({
        company_id: emmaFailed.company_id,
        company_employee_id: emmaFailed.company_employee_id,
        title: "Find 3 SaaS companies matching our ICP",
        description: emmaFailed.description,
        expected_outcome: emmaFailed.expected_outcome,
        priority: emmaFailed.priority,
        status: "assigned",
        current_progress_step: "assignment_received",
        role_input_json: roleInput,
        role_input_schema_id: emmaFailed.role_input_schema_id,
      })
      .select("id")
      .single();

    if (assignment) {
      const { data: execution } = await db
        .from("work_executions")
        .insert({
          company_id: emmaFailed.company_id,
          assignment_id: assignment.id,
          company_employee_id: emmaFailed.company_employee_id,
          status: "queued",
          current_step: "context_loaded",
          attempt_number: 1,
        })
        .select("id")
        .single();

      if (execution) {
        await db.from("assignments").update({ last_execution_id: execution.id }).eq("id", assignment.id);
        const run = await executeEmployeeAssignment(execution.id as string, undefined, db);
        report.emma = { assignmentId: assignment.id, run };
      }
    }
  }

  // ── 2. Alex 대기열 (이미 적재됐으면 건너뜀) ──────────────────────
  const { data: alreadyQueued } = await db
    .from("assignments")
    .select("id")
    .eq("status", "waiting")
    .limit(1);

  const { data: alexTemplate } = await db
    .from("assignments")
    .select("company_id, company_employee_id, description, expected_outcome, priority, role_input_json, role_input_schema_id")
    .eq("id", "2b846d88-3b25-4882-893c-23ec80137229")
    .maybeSingle();

  if (alexTemplate && (alreadyQueued ?? []).length === 0) {
    const queued: string[] = [];
    for (const title of [
      "Compare pricing pages of top 3 meeting-notes tools",
      "Summarise this week's competitor changes",
    ]) {
      const { data: q } = await db
        .from("assignments")
        .insert({
          company_id: alexTemplate.company_id,
          company_employee_id: alexTemplate.company_employee_id,
          title,
          description: alexTemplate.description,
          expected_outcome: alexTemplate.expected_outcome,
          priority: alexTemplate.priority,
          status: "waiting",
          current_progress_step: null,
          role_input_json: alexTemplate.role_input_json,
          role_input_schema_id: alexTemplate.role_input_schema_id,
        })
        .select("id")
        .single();
      if (q) queued.push(q.id as string);
    }
    report.alexQueued = queued;
  }

  return NextResponse.json(report);
}
