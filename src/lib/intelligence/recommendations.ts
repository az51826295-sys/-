import type { CompanySnapshot } from "@/lib/intelligence/snapshot";
import type { DetectorResult } from "@/lib/intelligence/detectors";
import {
  RECOMMENDATION_PRIORITY,
  type ActionType,
  type RecommendationCategory,
} from "@/lib/intelligence/types";

export interface ProposedRecommendation {
  signalKey: string;
  insightSignalKey: string | null;
  category: RecommendationCategory;
  title: string;
  description: string;
  reasoning: string;
  priority: number;
  action: { type: ActionType; payload: Record<string, unknown> };
}

/**
 * What to do about what the company noticed.
 *
 * The order is the argument. A department drowning has five possible answers,
 * and hiring is the only one that adds a cost every month afterwards — so it is
 * offered last, and only once the cheaper answers have been checked and found
 * not to apply. A system that reached for "hire someone" first would be
 * expensive advice dressed as intelligence.
 *
 * Nothing here calls a model. Each rule is a reading of facts the detectors
 * already established, which is why the manager can be shown exactly what was
 * counted underneath every suggestion.
 */
export function proposeRecommendations(
  snapshot: CompanySnapshot,
  insights: DetectorResult[],
): ProposedRecommendation[] {
  const proposals: ProposedRecommendation[] = [];

  const backlogs = insights.filter((insight) =>
    insight.signalKey.startsWith("department_backlog:"),
  );
  const idle = insights.filter((insight) =>
    insight.signalKey.startsWith("department_idle:"),
  );

  for (const backlog of backlogs) {
    const department = snapshot.departments.find(
      (row) => row.id === backlog.subjectId,
    );
    if (!department) continue;

    // Cheapest first: somebody in the same department is free.
    if (department.readyCount > 0) {
      proposals.push({
        signalKey: `redistribute:${department.id}`,
        insightSignalKey: backlog.signalKey,
        category: "capacity",
        title: `Give ${department.name}'s waiting work to whoever is free`,
        description: `${department.waitingCount} ${department.waitingCount === 1 ? "piece" : "pieces"} of work is queued for ${department.name} while ${department.readyCount} of them ${department.readyCount === 1 ? "is" : "are"} free. It should be moving already — check whether something is holding it.`,
        reasoning:
          "The department has the capacity for this work, so nothing needs to change about the organisation.",
        priority: RECOMMENDATION_PRIORITY.redistribute_work,
        action: {
          type: "open_department",
          payload: { departmentId: department.id },
        },
      });
      continue;
    }

    // Next cheapest: another department has people sitting idle.
    const spare = idle.find((row) => row.subjectId !== department.id);
    if (spare) {
      const spareDepartment = snapshot.departments.find(
        (row) => row.id === spare.subjectId,
      );
      proposals.push({
        signalKey: `cross_department:${department.id}`,
        insightSignalKey: backlog.signalKey,
        category: "capacity",
        title: `Have ${spareDepartment?.name ?? "another department"} help ${department.name}`,
        description: `${department.name} has ${department.waitingCount} waiting and nobody free, while ${spareDepartment?.name ?? "another department"} has nobody working at all. Some of this may be work they can take.`,
        reasoning:
          "Borrowing capacity you already pay for costs nothing, and is worth checking before adding anyone.",
        priority: RECOMMENDATION_PRIORITY.cross_department_support,
        action: {
          type: "open_department",
          payload: { departmentId: spareDepartment?.id ?? department.id },
        },
      });
      continue;
    }

    // Last: everybody in the company is busy and work keeps arriving.
    proposals.push({
      signalKey: `hire:${department.id}`,
      insightSignalKey: backlog.signalKey,
      category: "hiring",
      title: `Consider hiring into ${department.name}`,
      description: `${department.waitingCount} ${department.waitingCount === 1 ? "piece" : "pieces"} of work is waiting on ${department.name}, nobody there is free, and no other department has spare capacity.`,
      reasoning:
        "Everything cheaper has been checked: nobody in the department is free, and no other department is idle. Hiring is the remaining answer, and it is the only one that costs money every month afterwards — so it is your call, not a conclusion.",
      priority: RECOMMENDATION_PRIORITY.hire_employee,
      action: { type: "open_hiring", payload: { departmentId: department.id } },
    });
  }

  const revisions = insights.find((insight) => insight.signalKey === "revision_rate");
  if (revisions) {
    const percent = revisions.measurements.percent;
    proposals.push({
      signalKey: "improve_playbook",
      insightSignalKey: revisions.signalKey,
      category: "playbook",
      title: "Look at how this work is being done",
      description: `${percent}% of reviewed work came back for changes. Where the same correction keeps recurring, it belongs in the method rather than in your feedback each time.`,
      reasoning:
        "Rewriting a method is cheaper than reviewing the same mistake repeatedly, and it fixes the problem for everyone rather than for one person.",
      priority: RECOMMENDATION_PRIORITY.improve_playbook,
      action: { type: "review_playbook", payload: {} },
    });
  }

  const review = insights.find((insight) => insight.signalKey === "review_backlog");
  if (review && (review.severity === "high" || review.severity === "medium")) {
    proposals.push({
      signalKey: "clear_review_backlog",
      insightSignalKey: review.signalKey,
      category: "review",
      title: "Clear the review queue",
      description: `Work is finished and waiting on you. Every employee holding a submitted deliverable is blocked until you decide, so this is the cheapest thing on this page to fix.`,
      reasoning:
        "Nothing else the company could change would free up as much capacity as quickly, and it costs nothing.",
      priority: RECOMMENDATION_PRIORITY.review_backlog,
      action: { type: "review_deliverables", payload: {} },
    });
  }

  const learning = insights.find(
    (insight) => insight.signalKey === "unreviewed_learning",
  );
  if (learning) {
    proposals.push({
      signalKey: "decide_learning",
      insightSignalKey: learning.signalKey,
      category: "learning",
      title: "Decide on what the company has learned",
      description:
        "Proposals are waiting. Until you adopt or turn them down, the company keeps working the way it did before it learned anything.",
      reasoning:
        "These came from work you already approved, so the evidence is in and the only thing missing is your decision.",
      priority: RECOMMENDATION_PRIORITY.improve_playbook,
      action: { type: "review_learning", payload: {} },
    });
  }

  const blocked = insights.find(
    (insight) => insight.signalKey === "blocked_by_standards",
  );
  if (blocked) {
    proposals.push({
      signalKey: "resolve_blocked",
      insightSignalKey: blocked.signalKey,
      category: "review",
      title: "Work is held up by a standard you set",
      description:
        "Some finished work does not meet a required standard. Either ask for changes, or decide the rule does not apply here and turn it off — but it will not clear itself.",
      reasoning:
        "A standard nobody can meet stops being a standard and starts being a queue.",
      priority: RECOMMENDATION_PRIORITY.review_backlog,
      action: { type: "review_deliverables", payload: {} },
    });
  }

  return proposals.sort((a, b) => a.priority - b.priority);
}
