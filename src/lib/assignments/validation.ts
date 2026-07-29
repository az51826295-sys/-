import type { AssignmentPriority } from "@/lib/types";

// Kept free of server imports so client components can share these rules.

export const TITLE_MIN = 5;
export const TITLE_MAX = 120;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 3000;
export const OUTCOME_MAX = 1000;

export interface AssignmentInput {
  title: string;
  description: string;
  expectedOutcome?: string;
  priority: AssignmentPriority;
  /** Role-specific fields, shaped by the employee's assignment input schema and
   *  validated on the server. Left untyped here so this file stays free of
   *  server imports and can be shared with the form. */
  roleInput?: unknown;
}

export function validateAssignmentInput(input: Partial<AssignmentInput>): string | null {
  const title = (input.title ?? "").trim();
  const description = (input.description ?? "").trim();
  const expectedOutcome = (input.expectedOutcome ?? "").trim();

  if (title.length < TITLE_MIN) {
    return `Give the assignment a title of at least ${TITLE_MIN} characters.`;
  }
  if (title.length > TITLE_MAX) {
    return `Keep the title under ${TITLE_MAX} characters.`;
  }
  if (description.length < DESCRIPTION_MIN) {
    return `Add at least ${DESCRIPTION_MIN} characters of context.`;
  }
  if (description.length > DESCRIPTION_MAX) {
    return `Keep the context under ${DESCRIPTION_MAX} characters.`;
  }
  if (expectedOutcome.length > OUTCOME_MAX) {
    return `Keep the expected result under ${OUTCOME_MAX} characters.`;
  }
  if (input.priority && !["low", "normal", "high"].includes(input.priority)) {
    return "Choose a valid priority.";
  }
  return null;
}
