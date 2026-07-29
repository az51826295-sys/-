import type { AssignmentPriority } from "@/lib/types";
import type { Weekday } from "@/lib/schedule/time";

export interface RecurringDraft {
  title: string;
  description: string;
  expectedOutcome: string;
  priority: AssignmentPriority;
  roleInput: unknown;
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  daysOfWeek: Weekday[];
  dayOfMonth: number;
  localTime: string;
  startDate: string;
  conflictPolicy: "wait" | "skip";
}

/** Today's date in the company's zone, so the default start isn't yesterday for
 *  a manager whose evening is the server's tomorrow. */
export function todayIn(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

export function emptyRecurringDraft(timezone: string): RecurringDraft {
  return {
    title: "",
    description: "",
    expectedOutcome: "",
    priority: "normal",
    roleInput: {},
    frequency: "weekly",
    interval: 1,
    daysOfWeek: ["MO"],
    dayOfMonth: 1,
    localTime: "09:00",
    startDate: todayIn(timezone),
    // Waiting is the safer default: a manager who set up recurring work wants
    // it to happen, and silently dropping a turn because the employee was busy
    // is the surprising outcome.
    conflictPolicy: "wait",
  };
}

/** The shape the API expects, derived from the draft rather than stored twice. */
export function scheduleFromDraft(draft: RecurringDraft) {
  return {
    frequency: draft.frequency,
    interval: draft.frequency === "weekly" ? draft.interval : 1,
    daysOfWeek: draft.frequency === "weekly" ? draft.daysOfWeek : undefined,
    dayOfMonth: draft.frequency === "monthly" ? draft.dayOfMonth : undefined,
    localTime: draft.localTime,
    startDate: draft.startDate,
  };
}

function key(companyEmployeeId: string) {
  return `recurring-draft:${companyEmployeeId}`;
}

const listeners = new Set<() => void>();

export function subscribeToRecurringDraft(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRecurringDraftSnapshot(companyEmployeeId: string): string | null {
  return window.sessionStorage.getItem(key(companyEmployeeId));
}

export function getRecurringDraftServerSnapshot(): string | null {
  return null;
}

export function parseRecurringDraft(
  raw: string | null,
  timezone: string,
): RecurringDraft | null {
  if (!raw) return null;
  try {
    return {
      ...emptyRecurringDraft(timezone),
      ...(JSON.parse(raw) as Partial<RecurringDraft>),
    };
  } catch {
    return null;
  }
}

export function writeRecurringDraft(
  companyEmployeeId: string,
  draft: RecurringDraft,
) {
  window.sessionStorage.setItem(key(companyEmployeeId), JSON.stringify(draft));
  listeners.forEach((listener) => listener());
}

export function clearRecurringDraft(companyEmployeeId: string) {
  window.sessionStorage.removeItem(key(companyEmployeeId));
  listeners.forEach((listener) => listener());
}
