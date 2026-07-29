"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  emptyRecurringDraft,
  getRecurringDraftServerSnapshot,
  getRecurringDraftSnapshot,
  parseRecurringDraft,
  subscribeToRecurringDraft,
  writeRecurringDraft,
  type RecurringDraft,
} from "@/lib/recurring/draft";

/**
 * Reads the recurring draft straight from sessionStorage, so a schedule the
 * manager has half-filled survives the hop to the review screen and any failed
 * submit. `hydrated` is false during the first render, letting callers tell
 * "no draft" apart from "not read yet".
 */
export function useRecurringDraft(companyEmployeeId: string, timezone: string) {
  const getSnapshot = useCallback(
    () => getRecurringDraftSnapshot(companyEmployeeId),
    [companyEmployeeId],
  );

  const raw = useSyncExternalStore(
    subscribeToRecurringDraft,
    getSnapshot,
    getRecurringDraftServerSnapshot,
  );

  const hydrated = useSyncExternalStore(
    subscribeToRecurringDraft,
    () => true,
    () => false,
  );

  const stored = useMemo(
    () => parseRecurringDraft(raw, timezone),
    [raw, timezone],
  );

  const fallback = useMemo(() => emptyRecurringDraft(timezone), [timezone]);

  const setDraft = useCallback(
    (next: RecurringDraft) => writeRecurringDraft(companyEmployeeId, next),
    [companyEmployeeId],
  );

  return { draft: stored ?? fallback, stored, hydrated, setDraft };
}
