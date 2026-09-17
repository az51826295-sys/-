import { createClient } from "@/lib/supabase/server";
import { loadWorkContext, type EmployeeWorkContextV5 } from "@/lib/execution/context";
import {
  defaultProviders,
  ExecutionError,
  setStep,
  type Providers,
  type Supabase,
} from "@/lib/execution/shared";
import {
  recordMemoryUse,
  retrieveMemoriesForAssignment,
  type RetrievedMemory,
} from "@/lib/memory/retrieval";
import { getEmployeeSkill } from "@/lib/skills/registry";
import { loadRecurringHistory } from "@/lib/recurring/history";
import { SkillNotFoundError } from "@/lib/skills/types";
import { executionStepLabel, type ExecutionErrorCode } from "@/lib/execution/types";
import { meterProviders } from "@/lib/costs/meter";
import { placeLine, DEFAULT_PLACE, type Placement } from "@/lib/providers/place";
import { decide, headFacts, decisionLines, type Decision } from "@/lib/genesis/head";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { ensureAssignmentPolicySnapshot } from "@/lib/policies/resolve";
import { ensureAssignmentPlaybookSnapshot } from "@/lib/playbooks/resolve";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { recordPolicyFindings } from "@/lib/policies/validation";
import { commitPrediction } from "@/lib/genesis/predict";
import { judgeSelection, selectionNote } from "@/lib/execution/selection";
import { WaitingForApproval } from "@/lib/execution/approval";
import { selfRetryFromVerdict } from "@/lib/execution/selfRetry";
import { scheduleMechanicalRetry } from "@/lib/execution/mechanicalRetry";

export { defaultProviders };
export type { Providers };

/**
 * Runs one assignment end to end.
 *
 * Everything here is the same for every employee: marking the run started,
 * loading what the employee knows, recalling what they've learned, and
 * recording failure honestly. The part that differs — how the work is actually
 * done and what gets handed in — belongs to the employee's skill, which this
 * function selects by id and never inspects.
 */
export async function executeEmployeeAssignment(
  executionId: string,
  providers: Providers = defaultProviders(),
  /** Supplied by the scheduler, which runs on a timer and has no session to
   *  build a client from. Everything else uses the caller's own client, where
   *  row level security is doing the access check. */
  db?: Supabase,
): Promise<{ ok: true; deliverableId: string } | { ok: false; code: ExecutionErrorCode }> {
  const supabase = db ?? (await createClient());

  const { data: execution } = await supabase
    .from("work_executions")
    .select("*")
    .eq("id", executionId)
    .maybeSingle();

  if (!execution) {
    return { ok: false, code: "UNKNOWN_ERROR" };
  }

  // Before anything is spent. Checked here rather than inside the provider
  // because a run stopped halfway leaves a half-written deliverable and an
  // employee stuck mid-assignment — worse for the manager than the small
  // overshoot of letting a started piece of work finish.
  const blocked = await blockedBySpendLimit(supabase, execution.company_id);
  if (blocked) {
    await supabase.rpc("fail_work_execution", {
      p_execution_id: executionId,
      p_error_code: "SPEND_LIMIT_REACHED",
      p_error_message: blocked,
    });
    return { ok: false, code: "SPEND_LIMIT_REACHED" };
  }

  /**
   * **어느 AI를 이 일에 앉힐 것인가 — 판단이 정한다** (152회차 09-16).
   *
   * 사장님 09-16: *"판단자 ai 잘 만들면 모든 에이아이를 적재적소에 쓰며 더 높은 효율을 낼 수 있다."*
   * 여기까지는 자리가 내가 손으로 적은 집합 하나였다. 이제 일마다 한 번, **싼 자리에서** 골라 놓고 시작한다.
   *
   * 문이 아니다 — 고르기가 안 되면 하던 자리로 간다. 고른 것은 실행 기록에 남겨서 나중에 되물을 수 있게 한다.
   * 켜는 스위치를 따로 두지 않는다: 어느 자리를 골라도 일은 나오고(값과 성질만 다르다), 깨질 선택은 난간이 막는다.
   */
  // Every model call this run makes — whatever skill makes it, and whether or
  // not the skill knows it is being counted — is recorded against this run.
  providers = meterProviders(providers, supabase, {
    companyId: execution.company_id,
    workExecutionId: executionId,
    companyEmployeeId: execution.company_employee_id,
  });

  /**
   * **머리** (161회차) — 판단자 AI 의 한 자리. 배치(152)만 따로 돌던 자리를 머리가 이어받는다:
   * 어느 모델·어느 기계·얼마나 크게·진짜 재료가 필요한지 + **사장님이 시작 전에 보는 한 줄**을 한 번에 정한다.
   * 정하지 못하면 하던 대로 간다(문이 아니다). 정한 것은 실행 기록에 남고 계획 카드 맨 위에 뜬다.
   */
  let placement: Placement | null = null;
  let decision: Decision | null = null;
  {
    const { data: asg } = await supabase
      .from("assignments").select("title, description").eq("id", execution.assignment_id).maybeSingle();
    const order = `${(asg?.title as string | null) ?? ""}\n${(asg?.description as string | null) ?? ""}`.trim();
    // 목(mock)으로 도는 판에는 손대지 않는다. 자리를 갈아 끼우면 **목 파일럿이 진짜 모델을 부르게 된다** —
    // 목 먼저라는 계약이 바로 그 자리에서 깨진다.
    if (order && providers.ai.name !== "mock") {
      const facts = await headFacts(supabase, execution.company_id);
      decision = await decide(providers.ai, { order, kind: String(execution.current_step ?? "work"), facts });
      placement = decision.placement;
      if (placement.place !== DEFAULT_PLACE) {
        // 자리를 갈아 끼우면 **계량도 다시 씌운다.** 152회차에 이 한 줄이 없어서 배치 호출의 값이
        // 원장에 안 남았다 — "회복된 고장은 원장에만 남는다" 의 반대편: 원장에 없으면 없는 일이 된다.
        providers = meterProviders(defaultProviders(placement.place), supabase, {
          companyId: execution.company_id,
          workExecutionId: executionId,
          companyEmployeeId: execution.company_employee_id,
        });
      }
      console.log(`[배치] ${placeLine(placement)}`);
      for (const l of decisionLines(decision)) console.log(`[머리] ${l}`);
    }
  }

  try {
    await supabase
      .from("work_executions")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        model_provider: providers.ai.name,
        model_name: providers.ai.model,
        // 152회차: 왜 이 모델이었나를 같이 남긴다. 값만 남기면 나중에 "왜 비싼 자리로 갔나" 를 못 되묻는다.
        ...(placement
          ? { metrics_json: { ...((execution.metrics_json as Record<string, unknown> | null) ?? {}), placement, decision } }
          : {}),
      })
      .eq("id", executionId);

    await supabase
      .from("assignments")
      .update({ status: "working", started_at: new Date().toISOString() })
      .eq("id", execution.assignment_id);

    await supabase
      .from("company_employees")
      .update({ work_status: "working" })
      .eq("id", execution.company_employee_id);

    // Before the context is assembled, so the employee is given the standard
    // and judged by the same one. Taken once per assignment: a retry or a
    // revision inherits the rules the work started under.
    await ensureAssignmentPolicySnapshot(
      supabase,
      execution.company_id,
      execution.assignment_id,
      execution.company_employee_id,
    );

    // The method is chosen by the work, so the skill has to be known before the
    // context is assembled — the context reads the snapshot rather than taking
    // one, which is what keeps a read path from deciding how work was done.
    const skillId = await skillForHire(supabase, execution.company_employee_id);
    if (skillId) {
      await ensureAssignmentPlaybookSnapshot(
        supabase,
        execution.company_id,
        execution.assignment_id,
        skillId,
        execution.company_employee_id,
      );
    }

    const context = await loadContextOrFail(
      supabase,
      executionId,
      execution.assignment_id,
    );

    const memories = await recallMemories(executionId, context, supabase);

    const skill = getEmployeeSkill(context.skillId);

    // Only recurring work has a previous turn to build on. A one-off assignment
    // has no history and should not be told about unrelated past work.
    const { data: assignment } = await supabase
      .from("assignments")
      .select("recurring_assignment_id, assignment_type")
      .eq("id", execution.assignment_id)
      .maybeSingle();

    const recurringId = assignment?.recurring_assignment_id as string | null;
    const rawType = assignment?.assignment_type;
    const assignmentType =
      rawType === "internal" || rawType === "project" ? rawType : "manager";
    const history = recurringId
      ? await loadRecurringHistory(recurringId, execution.assignment_id, supabase)
      : undefined;

    // ── 예측 잠금 ────────────────────────────────────────────────
    //
    // 일을 시작하기 전에, 이 일이 매니저의 수정 요청 없이 승인될
    // 확률을 적어 둔다. 여기가 유일하게 가능한 자리다 — 산출물을
    // 본 뒤에 적은 예측은 예측이 아니고, 그런 오차는 아무것도 재지
    // 못한다.
    //
    // 실패해도 일은 계속한다. 기억 회상과 같은 규칙이다: 예측을
    // 남기지 못하는 것은 할 수 있는 일을 거부할 이유가 아니다.
    await commitPrediction(supabase, {
      companyId: execution.company_id,
      assignmentId: execution.assignment_id,
      workExecutionId: executionId,
      companyEmployeeId: execution.company_employee_id,
      features: {
        skillId: context.skillId,
        assignmentType,
        recurring: Boolean(recurringId),
        memoryCount: memories.length,
      },
    });

    const result = await skill.run({
      supabase,
      executionId,
      execution: {
        company_id: execution.company_id,
        assignment_id: execution.assignment_id,
        company_employee_id: execution.company_employee_id,
      },
      providers,
      context,
      memories,
      history,
      assignmentType,
      runChildAssignment: (childId) =>
        runChildAssignment(supabase, providers, childId),
    });

    // How the answer was chosen travels with the numbers it was chosen from.
    // Recorded rather than enforced: work that selected from too few is still
    // work the manager should see, and refusing it would leave them with
    // nothing instead of with something they can judge.
    const selection = judgeSelection(skill, result.metrics);

    await supabase
      .from("work_executions")
      .update({
        metrics_json: {
          // 42회차: 여기서 통째로 덮어써 단계 저장(steps)이 사라졌다 — 계획 카드도 같이 사라진다.
          // 152회차: 그때 **steps 만** 골라 살린 것이 화근이었다. 새로 넣은 배치 기록(placement)이 같은 자리에서
          // 또 지워졌다 — 같은 고장을 두 번 겪었다. 이제 **있던 것을 다 살리고** 이번 것만 위에 덮는다.
          ...(await (async () => {
            const { data } = await supabase.from("work_executions").select("metrics_json").eq("id", executionId).maybeSingle();
            return (data?.metrics_json ?? {}) as Record<string, unknown>;
          })()),
          ...result.metrics,
          selection: {
            kind: selection.kind,
            note: selectionNote(selection),
          },
        },
      })
      .eq("id", executionId);

    // After the deliverable exists, never instead of it. Work that misses the
    // company's standard is still work the manager should see — the finding
    // tells them what is wrong with it, and a failed run would tell them
    // nothing.
    try {
      await recordPolicyFindings(
        supabase,
        execution.company_id,
        execution.assignment_id,
        result.deliverableId,
      );
    } catch {
      // The deliverable stands. An unchecked one is better than a lost one.
    }

    // 자가 떨어뜨린 줄이 있으면 스스로 다시(41회차). 게임(app_build)은 유니티 검사 문이 따로 부른다 —
    // 그쪽 판정은 여기서가 아니라 사장님 PC 의 유니티가 낸 뒤에 나온다.
    try {
      await selfRetryFromVerdict(supabase, result.deliverableId, result.deliverableType);
    } catch (e) {
      // 스스로 다시가 안 걸려도 산출물은 산출물이다. 조용히 삼키지는 않는다.
      console.warn("[selfRetry] 못 걸었다:", e instanceof Error ? e.message : e);
    }

    return { ok: true, deliverableId: result.deliverableId };
  } catch (error) {
    // 되묻기(35회차): 실패가 아니라 멈춤. 실행은 WAITING_APPROVAL 로 적고, 업무는 waiting — 사장님이 '시작' 하면
    // approval.resumeApproved 가 새 실행(단계 저장 복사)을 만든다.
    if (error instanceof WaitingForApproval) {
      await supabase.rpc("fail_work_execution", {
        p_execution_id: executionId,
        p_error_code: "WAITING_APPROVAL",
        p_error_message: "계획을 보이고 사장님 확인을 기다린다",
      });
      // 42회차: 대기열(`startNextQueued`)도 'waiting' 을 "차례를 기다리는 일" 로 알고 집어간다. 표시가 없으면
      // 화면이 6초마다 부르는 폴링이 확인 대기 판을 꺼내 **승인 없이** 돌리고 계획을 다시 산다($0.2/판).
      // 그래서 업무에 "이건 사람 답을 기다리는 것" 이라고 적어 둔다 — 대기열과 폴링이 둘 다 이 표시를 본다.
      const { data: cur } = await supabase.from("assignments").select("role_input_json").eq("id", execution.assignment_id).maybeSingle();
      await supabase
        .from("assignments")
        .update({ status: "waiting", role_input_json: { ...((cur?.role_input_json as Record<string, unknown> | null) ?? {}), awaitingApproval: true } })
        .eq("id", execution.assignment_id);
      await supabase.from("company_employees").update({ work_status: "ready" }).eq("id", execution.company_employee_id);
      return { ok: false, code: "WAITING_APPROVAL" };
    }
    const code =
      error instanceof ExecutionError
        ? error.code
        : error instanceof SkillNotFoundError
          ? ("CONTEXT_INCOMPLETE" as const)
          : ("UNKNOWN_ERROR" as const);
    const message = error instanceof Error ? error.message : String(error);

    await supabase.rpc("fail_work_execution", {
      p_execution_id: executionId,
      p_error_code: code,
      // Kept server-side for debugging; never rendered to the user.
      p_error_message: message.slice(0, 500),
    });

    // 117회차: 기계적인 고장(출력 잘림·저장 시간 초과)이면 한 번은 조용히 다시 — 65회차에 "싸게 실패하고 다시 한다" 고
    // 정해 놓고 다시 하는 쪽을 안 만들었었다. 뜻이 있는 실패는 그대로 사람에게 간다.
    const again = await scheduleMechanicalRetry(supabase, execution, code, message);
    if (again.retried) console.log(`[다시] ${executionId.slice(0, 8)} ${code} — 기계적인 고장이라 한 번 더 돌린다`);

    return { ok: false, code };
  }
}

/** Which kind of work this employee does, by their definition rather than by
 *  their name. */
async function skillForHire(
  db: Supabase,
  companyEmployeeId: string,
): Promise<string | null> {
  const { data } = await db
    .from("company_employees")
    .select("employees(slug)")
    .eq("id", companyEmployeeId)
    .maybeSingle();

  const slug = (data as unknown as { employees: { slug: string } | null } | null)
    ?.employees?.slug;

  return slug ? (getEmployeeDefinition(slug)?.skillId ?? null) : null;
}

async function loadContextOrFail(
  supabase: Supabase,
  executionId: string,
  assignmentId: string,
): Promise<EmployeeWorkContextV5> {
  await setStep(supabase, executionId, "context_loaded");

  const result = await loadWorkContext(assignmentId, supabase);
  if (!result.ok) {
    throw new ExecutionError(
      "CONTEXT_INCOMPLETE",
      `missing: ${result.missing.join(", ")}`,
    );
  }

  // Reading the company's knowledge profile *is* the "company context
  // reviewed" step, so close it here rather than leaving a pending marker
  // stranded between completed ones.
  await supabase
    .from("assignment_progress_events")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("assignment_id", assignmentId)
    .eq("event_type", "company_context_reviewed")
    .neq("status", "completed");

  // Snapshot the inputs so a later edit to company knowledge doesn't rewrite
  // the record of why this deliverable said what it said.
  await supabase
    .from("work_executions")
    .update({
      input_snapshot: {
        capturedAt: new Date().toISOString(),
        employee: result.context.employee,
        company: result.context.company,
        companyKnowledge: result.context.companyKnowledge,
        roleKnowledge: result.context.roleKnowledge,
        assignment: result.context.assignment,
        roleInput: result.context.roleInput,
      },
    })
    .eq("id", executionId);

  return result.context;
}

/**
 * Runs work one employee is doing for another.
 *
 * The same engine, recursively — a colleague's assignment is an ordinary
 * assignment with an ordinary execution, and gets the same evidence rules and
 * the same skill. What stops this recursing without end is upstream: only a
 * manager-facing assignment is allowed to ask for help in the first place.
 */
async function runChildAssignment(
  supabase: Supabase,
  providers: Providers,
  childAssignmentId: string,
): Promise<boolean> {
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, company_id, company_employee_id")
    .eq("id", childAssignmentId)
    .maybeSingle();

  if (!assignment) return false;

  const { data: created } = await supabase
    .from("work_executions")
    .insert({
      company_id: assignment.company_id,
      assignment_id: childAssignmentId,
      company_employee_id: assignment.company_employee_id,
      status: "queued",
      current_step: "context_loaded",
      attempt_number: 1,
    })
    .select("id")
    .single();

  if (!created) return false;

  await supabase
    .from("assignments")
    .update({ status: "queued", last_execution_id: created.id as string })
    .eq("id", childAssignmentId);

  const result = await executeEmployeeAssignment(
    created.id as string,
    providers,
    supabase,
  );

  return result.ok;
}

/**
 * Recalls what this employee has learned. Deliberately swallowing failures:
 * being unable to remember is not a reason to refuse work the employee could
 * otherwise do.
 */
async function recallMemories(
  executionId: string,
  context: EmployeeWorkContextV5,
  db: Supabase,
): Promise<RetrievedMemory[]> {
  try {
    const memories = await retrieveMemoriesForAssignment(
      {
        companyEmployeeId: context.employee.id,
        assignmentTitle: context.assignment.title,
        assignmentDescription: context.assignment.description,
        expectedOutcome: context.assignment.expectedOutcome,
      },
      db,
    );
    await recordMemoryUse(executionId, memories, db);
    return memories;
  } catch {
    return [];
  }
}

export { executionStepLabel };
