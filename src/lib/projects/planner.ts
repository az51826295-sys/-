import type { Providers } from "@/lib/execution/shared";
import type { Candidate } from "@/lib/projects/staffing";
import { buildPlanningPrompt, type CompanyContext } from "@/lib/projects/prompts";
import { validatePlan, type ValidatedWorkItem } from "@/lib/projects/validation";
import type { PolicySnapshot } from "@/lib/policies/types";
import {
  projectPlanSchema,
  type ProjectPlan,
  type ProjectFailureCode,
} from "@/lib/projects/types";

export type PlanResult =
  | { ok: true; plan: ProjectPlan; workItems: ValidatedWorkItem[] }
  | { ok: false; code: ProjectFailureCode; detail: string };

/**
 * Asks the Workforce Manager how to divide a goal, then checks the answer.
 *
 * One correction attempt, and no more. A plan that fails validation twice is
 * not a plan the model is going to reach by trying again — and each attempt is
 * a paid call, so retrying indefinitely would spend the company's money on the
 * same mistake.
 */
export async function prepareProjectPlan(
  providers: Providers,
  goal: string,
  expectedOutcome: string,
  company: CompanyContext,
  candidates: Candidate[],
  /** Which department owns each skill, so staffing goes through the
   *  organisation rather than around it. */
  routing?: Map<
    string,
    { departmentId: string; departmentName: string; candidates: Candidate[] }
  >,
  /** What the company requires of any work this plan commits people to. */
  policies?: PolicySnapshot | null,
  /** Methods the company already has, named so the plan works with them. */
  playbooks?: { name: string; version: number; skillLabel: string; stages: string[] }[],
): Promise<PlanResult> {
  if (candidates.length === 0) {
    return { ok: false, code: "NO_EMPLOYEES", detail: "nobody is onboarded" };
  }

  const { system, input } = buildPlanningPrompt(
    goal,
    expectedOutcome,
    company,
    candidates,
    policies,
    playbooks,
  );

  let lastDetail = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let plan: ProjectPlan;

    try {
      const result = await providers.ai.generateStructuredOutput({
        systemInstructions:
          attempt === 0
            ? system
            : // The second attempt is told exactly what was wrong. A bare retry
              // would just re-roll the same mistake.
              `${system}\n\n## Your previous plan was rejected\n${lastDetail}\n\nProduce a plan that does not have this problem.`,
        input,
        schema: projectPlanSchema,
        schemaName: "project_plan",
        maxTokens: 16000,
      });
      plan = result.output;
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : "planning call failed";
      continue;
    }

    if (plan.cannotPlan) {
      return {
        ok: false,
        code: "NO_MATCHING_SKILL",
        detail: plan.cannotPlanReason.trim() || "the goal needs a skill nobody has",
      };
    }

    const validation = validatePlan(plan, candidates, routing);
    if (validation.ok) {
      return { ok: true, plan, workItems: validation.workItems };
    }

    lastDetail = validation.detail;

    // A goal nobody can staff will not be fixed by rewording the plan, so the
    // retry is skipped rather than spent.
    if (validation.code === "UNKNOWN_SKILL") {
      return { ok: false, code: "NO_MATCHING_SKILL", detail: validation.detail };
    }
  }

  return { ok: false, code: "PLAN_INVALID", detail: lastDetail };
}
