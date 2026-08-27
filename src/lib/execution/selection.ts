import type { EmployeeSkill, SkillMetrics } from "@/lib/skills/types";

/**
 * Whether a result was chosen, and from how many.
 *
 * A skill that picks one answer out of several is doing something different
 * from a skill that produces the only answer there was. The first can be wrong
 * in a way the manager can see — a better candidate was there and got dropped —
 * and the second cannot. The engine records which happened so that difference
 * survives into the deliverable rather than being lost in the wording.
 *
 * The rule this enforces came from a sister project's art pipeline, where every
 * asset in the game had been generated once and used as-is. The work looked
 * inconsistent and the cause was not the prompts or the model: with one
 * candidate there is nothing to select against, so quality is whatever the
 * generator happened to produce that time. Selecting from one is not selection.
 */

/** Below this, calling something a selection is a courtesy rather than a fact. */
export const MIN_CANDIDATES = 3;

export type SelectionVerdict =
  /** Selected from enough candidates that dropping the others meant something. */
  | { kind: "selected"; candidates: number; selected: number }
  /** Chose from too few. Recorded, not refused — a thin answer beats none. */
  | { kind: "thin"; candidates: number; selected: number; why: string }
  /** The skill does not select, so there is nothing to judge here. */
  | { kind: "not_a_selection" }
  /** The skill says it selects but reported no counts. */
  | { kind: "unreported"; why: string };

/**
 * Reads the counts a skill reported and says what they mean.
 *
 * Deliberately never throws and never fails the run. A skill that selected
 * badly still produced something the manager should see, and hiding it would
 * cost them the one view they have of how it was chosen. The finding rides
 * along with the deliverable instead.
 */
export function judgeSelection(
  skill: Pick<EmployeeSkill, "selects">,
  metrics: SkillMetrics,
): SelectionVerdict {
  if (!skill.selects) return { kind: "not_a_selection" };

  const candidates = metrics.candidateCount;
  const selected = metrics.selectedCount;

  if (typeof candidates !== "number" || typeof selected !== "number") {
    return {
      kind: "unreported",
      why: "This skill selects but reported no candidate counts, so there is no way to tell whether anything was actually chosen.",
    };
  }

  if (candidates < MIN_CANDIDATES) {
    return {
      kind: "thin",
      candidates,
      selected,
      why:
        candidates <= 1
          ? "Chosen from a single candidate, which means it was not chosen at all — whatever the generator produced is what was handed in."
          : `Chosen from ${candidates} candidates, below the ${MIN_CANDIDATES} it takes for the choice to carry information.`,
    };
  }

  return { kind: "selected", candidates, selected };
}

/** What the manager reads on the deliverable. Empty when there is nothing worth saying. */
export function selectionNote(v: SelectionVerdict): string | null {
  switch (v.kind) {
    case "selected":
      return `Chose ${v.selected} of ${v.candidates}.`;
    case "thin":
      return v.why;
    case "unreported":
      return v.why;
    case "not_a_selection":
      return null;
  }
}
