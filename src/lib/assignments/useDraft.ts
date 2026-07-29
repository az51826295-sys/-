"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  emptyDraft,
  getDraftServerSnapshot,
  getDraftSnapshot,
  parseDraft,
  subscribeToDraft,
  writeDraft,
  type AssignmentDraft,
} from "@/lib/assignments/draft";

/**
 * Reads the assignment draft straight from sessionStorage. `hydrated` is false
 * on the server and during the hydration render, so callers can avoid acting on
 * a draft that only looks absent.
 */
export function useAssignmentDraft(companyEmployeeId: string) {
  const getSnapshot = useCallback(
    () => getDraftSnapshot(companyEmployeeId),
    [companyEmployeeId],
  );

  const raw = useSyncExternalStore(
    subscribeToDraft,
    getSnapshot,
    getDraftServerSnapshot,
  );

  const hydrated = useSyncExternalStore(
    subscribeToDraft,
    () => true,
    () => false,
  );

  const stored = useMemo(() => parseDraft(raw), [raw]);

  const setDraft = useCallback(
    (next: AssignmentDraft) => writeDraft(companyEmployeeId, next),
    [companyEmployeeId],
  );

  return { draft: stored ?? emptyDraft, stored, hydrated, setDraft };
}
