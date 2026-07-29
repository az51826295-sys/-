import type { AssignmentPriority } from "@/lib/types";

export interface AssignmentDraft {
  title: string;
  description: string;
  expectedOutcome: string;
  priority: AssignmentPriority;
  /** Role-specific fields. Shape belongs to the employee's assignment input
   *  schema; the draft just carries it across the review hop. */
  roleInput: unknown;
}

export const emptyDraft: AssignmentDraft = {
  title: "",
  description: "",
  expectedOutcome: "",
  priority: "normal",
  roleInput: {},
};

/**
 * The draft lives in sessionStorage rather than the database — Day 3 has no
 * concept of a saved draft, but the user's typing must survive the hop to the
 * review screen and any failed submit.
 *
 * Exposed as a subscribable store so components can read it with
 * useSyncExternalStore instead of copying it into local state on mount.
 */
function key(companyEmployeeId: string) {
  return `assignment-draft:${companyEmployeeId}`;
}

const listeners = new Set<() => void>();

export function subscribeToDraft(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Raw JSON string, so the snapshot is a stable primitive across reads. */
export function getDraftSnapshot(companyEmployeeId: string): string | null {
  return window.sessionStorage.getItem(key(companyEmployeeId));
}

export function getDraftServerSnapshot(): string | null {
  return null;
}

export function parseDraft(raw: string | null): AssignmentDraft | null {
  if (!raw) return null;
  try {
    return { ...emptyDraft, ...(JSON.parse(raw) as Partial<AssignmentDraft>) };
  } catch {
    return null;
  }
}

export function writeDraft(companyEmployeeId: string, draft: AssignmentDraft) {
  window.sessionStorage.setItem(key(companyEmployeeId), JSON.stringify(draft));
  listeners.forEach((listener) => listener());
}

export function clearDraft(companyEmployeeId: string) {
  window.sessionStorage.removeItem(key(companyEmployeeId));
  listeners.forEach((listener) => listener());
}
