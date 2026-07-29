import type { Candidate } from "@/lib/projects/staffing";
import { selectForSkill } from "@/lib/projects/staffing";
import {
  MAX_EMPLOYEES_PER_PROJECT,
  MAX_PROJECT_DEPENDENCY_DEPTH,
  MAX_PROJECT_WORK_ITEMS,
  MIN_PROJECT_WORK_ITEMS,
  type PlanValidationCode,
  type PlanWorkItem,
  type ProjectPlan,
} from "@/lib/projects/types";

export interface ValidatedWorkItem extends PlanWorkItem {
  /** Who is expected to do it. Confirmed by the department when the work
   *  actually starts — if this person is busy by then and a colleague in the
   *  same department is free, the department reassigns. */
  assignee: Candidate;
  /** Whether the person above is the one the plan named. False when the
   *  department that owns the skill put the work on somebody else, which makes
   *  "assigneeRationale" a reason for a different colleague. */
  followedRecommendation: boolean;
  /** The department responsible, resolved from the skill. Set when the company
   *  has an organisation; null while it is still just a list of employees. */
  departmentId: string | null;
  departmentName: string | null;
  /** Depth in the dependency graph, and the order work items are created in. */
  depth: number;
  sequenceOrder: number;
}

export type PlanValidation =
  | { ok: true; workItems: ValidatedWorkItem[] }
  | { ok: false; code: PlanValidationCode; detail: string };

/**
 * Checks a plan before anybody is asked to carry it out.
 *
 * The model proposes; this decides. Every failure here is one that would
 * otherwise surface as work that silently never starts — a task waiting on
 * something that does not exist, two tasks waiting on each other, a skill
 * nobody has. Finding them now costs one rejected plan; finding them later
 * costs a project that hangs with no explanation.
 */
export function validatePlan(
  plan: ProjectPlan,
  candidates: Candidate[],
  /** Which department owns each skill. Absent for a company that has not been
   *  organised into departments yet, in which case staffing falls back to
   *  picking from everyone who can do the work. */
  routing?: Map<string, { departmentId: string; departmentName: string; candidates: Candidate[] }>,
): PlanValidation {
  const items = plan.workItems;

  if (items.length < MIN_PROJECT_WORK_ITEMS) {
    return { ok: false, code: "NO_WORK_ITEMS", detail: "the plan has no work" };
  }
  if (items.length > MAX_PROJECT_WORK_ITEMS) {
    return {
      ok: false,
      code: "TOO_MANY_WORK_ITEMS",
      detail: `${items.length} work items, limit ${MAX_PROJECT_WORK_ITEMS}`,
    };
  }

  const byClientId = new Map<string, PlanWorkItem>();
  for (const item of items) {
    const key = item.clientId.trim();
    if (!key) {
      return { ok: false, code: "SCHEMA_INVALID", detail: "work item has no id" };
    }
    if (byClientId.has(key)) {
      return {
        ok: false,
        code: "SCHEMA_INVALID",
        detail: `two work items share the id "${key}"`,
      };
    }
    byClientId.set(key, { ...item, clientId: key });
  }

  // Staffing first: a dependency on a task nobody can do is not worth checking
  // the shape of.
  const assignees = new Map<string, Candidate>();
  const departments = new Map<string, { id: string; name: string }>();

  for (const [clientId, item] of byClientId) {
    // The department that owns the skill decides who does the work. Only when
    // the company has no organisation does this fall back to picking from
    // everyone who happens to be able to.
    const owning = routing?.get(item.requiredSkillId);

    if (owning) {
      departments.set(clientId, {
        id: owning.departmentId,
        name: owning.departmentName,
      });
    }

    const pool = owning ? owning.candidates : candidates;

    const assignee = owning
      ? (pool.find(
          (candidate) =>
            candidate.companyEmployeeId === item.recommendedCompanyEmployeeId,
        ) ?? pool[0])
      : selectForSkill(
          candidates,
          item.requiredSkillId,
          item.recommendedCompanyEmployeeId,
        );

    if (!assignee) {
      return {
        ok: false,
        code: "UNKNOWN_SKILL",
        detail: owning
          ? `${owning.departmentName} owns "${item.requiredSkillId}" but has nobody who can do it`
          : `no employee can do "${item.requiredSkillId}"`,
      };
    }

    assignees.set(clientId, assignee);
  }

  const distinctEmployees = new Set(
    [...assignees.values()].map((candidate) => candidate.companyEmployeeId),
  );
  if (distinctEmployees.size > MAX_EMPLOYEES_PER_PROJECT) {
    return {
      ok: false,
      code: "TOO_MANY_EMPLOYEES",
      detail: `${distinctEmployees.size} employees, limit ${MAX_EMPLOYEES_PER_PROJECT}`,
    };
  }

  for (const [clientId, item] of byClientId) {
    for (const dependency of item.dependencyClientIds) {
      const key = dependency.trim();
      if (!key) continue;
      if (key === clientId) {
        return {
          ok: false,
          code: "DEPENDENCY_SELF",
          detail: `"${clientId}" waits for itself`,
        };
      }
      if (!byClientId.has(key)) {
        return {
          ok: false,
          code: "DEPENDENCY_NOT_FOUND",
          detail: `"${clientId}" waits for "${key}", which is not in the plan`,
        };
      }
    }
  }

  const depths = resolveDepths(byClientId);
  if (depths.cycle) {
    return {
      ok: false,
      code: "DEPENDENCY_CYCLE",
      detail: `these wait on each other: ${depths.cycle.join(" -> ")}`,
    };
  }

  for (const [clientId, depth] of depths.byClientId) {
    if (depth >= MAX_PROJECT_DEPENDENCY_DEPTH) {
      return {
        ok: false,
        code: "DEPENDENCY_DEPTH_EXCEEDED",
        detail: `"${clientId}" is ${depth + 1} steps deep, limit ${MAX_PROJECT_DEPENDENCY_DEPTH}`,
      };
    }
  }

  // Shallowest first, so creating rows in this order means a dependency always
  // exists before the thing that waits on it.
  const ordered = [...byClientId.values()].sort((a, b) => {
    const byDepth =
      (depths.byClientId.get(a.clientId) ?? 0) -
      (depths.byClientId.get(b.clientId) ?? 0);
    return byDepth !== 0 ? byDepth : a.clientId.localeCompare(b.clientId);
  });

  return {
    ok: true,
    workItems: ordered.map((item, index) => ({
      ...item,
      // Dependencies the plan named but that carry no declared input still
      // order the work; they just pass nothing along.
      dependencyClientIds: item.dependencyClientIds
        .map((id) => id.trim())
        .filter(Boolean),
      assignee: assignees.get(item.clientId)!,
      // The department owns the skill, so it can put the work on somebody
      // other than the person named in the plan. When that happens the
      // reasoning above is about a different colleague, and the review screen
      // has to say so rather than presenting it as the reason for this one.
      followedRecommendation:
        assignees.get(item.clientId)?.companyEmployeeId ===
        item.recommendedCompanyEmployeeId,
      departmentId: departments.get(item.clientId)?.id ?? null,
      departmentName: departments.get(item.clientId)?.name ?? null,
      depth: depths.byClientId.get(item.clientId) ?? 0,
      sequenceOrder: index,
    })),
  };
}

/**
 * How deep each work item sits, and whether the graph is acyclic.
 *
 * A depth-first walk rather than a queue-based topological sort, because when
 * it does find a cycle the path it is standing on *is* the cycle — which is
 * what the failure message needs to name.
 */
function resolveDepths(items: Map<string, PlanWorkItem>): {
  byClientId: Map<string, number>;
  cycle: string[] | null;
} {
  const byClientId = new Map<string, number>();
  let cycle: string[] | null = null;

  const visit = (clientId: string, path: string[]): number => {
    const known = byClientId.get(clientId);
    if (known !== undefined) return known;

    if (path.includes(clientId)) {
      cycle = [...path.slice(path.indexOf(clientId)), clientId];
      return 0;
    }

    const item = items.get(clientId);
    if (!item) return 0;

    const dependencies = item.dependencyClientIds
      .map((id) => id.trim())
      .filter((id) => id && items.has(id));

    let depth = 0;
    for (const dependency of dependencies) {
      const parent = visit(dependency, [...path, clientId]);
      if (cycle) return 0;
      depth = Math.max(depth, parent + 1);
    }

    byClientId.set(clientId, depth);
    return depth;
  };

  for (const clientId of items.keys()) {
    visit(clientId, []);
    if (cycle) return { byClientId, cycle };
  }

  return { byClientId, cycle: null };
}
