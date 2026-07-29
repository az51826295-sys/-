import { createClient } from "@/lib/supabase/server";
import { getOwnedDeliverable } from "@/lib/deliverables/access";
import { learnFromApprovedDeliverable } from "@/lib/memory/learning";
import {
  memoryCategoryLabel,
  type MemoryCategory,
  type MemoryStatus,
} from "@/lib/memory/types";
import type { Result } from "@/lib/assignments/service";

export interface MemoryView {
  id: string;
  category: MemoryCategory;
  categoryLabel: string;
  title: string;
  content: string;
  status: MemoryStatus;
  confidence: "low" | "medium" | "high";
  conflictReason: string | null;
  firstLearnedAt: string;
  lastConfirmedAt: string | null;
  validUntil: string | null;
  expired: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  sources: { type: string; id: string }[];
}

/**
 * Opens a learning session for an approved deliverable and runs it. Called
 * after approval; a deliverable already learned from returns "skipped" rather
 * than an error, because approving is allowed to happen more than once.
 */
export async function startLearning(
  deliverableId: string,
): Promise<Result<{ learningSessionId: string | null; status: string }>> {
  const owned = await getOwnedDeliverable(deliverableId);
  if (!owned) return { error: "Deliverable not found.", status: 404 };

  if (owned.deliverable.status !== "approved") {
    return { error: "This work has not been approved yet.", status: 409 };
  }

  const { data: sessionId, error } = await owned.supabase.rpc(
    "start_learning_session",
    { p_deliverable_id: deliverableId },
  );

  if (error) return { error: "Could not start learning.", status: 500 };

  if (!sessionId) {
    return { learningSessionId: null, status: "skipped" };
  }

  const result = await learnFromApprovedDeliverable(sessionId as string);

  return {
    learningSessionId: sessionId as string,
    status: result.ok ? "completed" : "failed",
  };
}

/**
 * Runs a failed session again. The row is reset rather than replaced, so the
 * one-session-per-deliverable rule still holds and the manager keeps seeing a
 * single entry for this piece of work.
 */
export async function retryLearning(
  learningSessionId: string,
): Promise<Result<{ status: string }>> {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("employee_learning_sessions")
    .select("id, status, deliverable_id")
    .eq("id", learningSessionId)
    .maybeSingle();

  if (!session) return { error: "Learning session not found.", status: 404 };

  if (session.status !== "failed") {
    return {
      error:
        session.status === "completed"
          ? "This work has already been learned from."
          : "Learning is already in progress.",
      status: 409,
    };
  }

  const { error } = await supabase
    .from("employee_learning_sessions")
    .update({
      status: "pending",
      error_code: null,
      error_message: null,
      failed_at: null,
    })
    .eq("id", learningSessionId)
    .eq("status", "failed");

  if (error) return { error: "Could not retry learning.", status: 500 };

  const result = await learnFromApprovedDeliverable(learningSessionId);
  return { status: result.ok ? "completed" : "failed" };
}

async function getOwnedHire(companyEmployeeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS scopes company_employees by the owning company, so a miss here is both
  // "no such hire" and "not yours" — the caller answers 404 either way.
  const { data } = await supabase
    .from("company_employees")
    .select("id, company_id, employees(name, role, slug)")
    .eq("id", companyEmployeeId)
    .maybeSingle();

  if (!data) return null;
  return { supabase, hire: data };
}

export async function listMemories(
  companyEmployeeId: string,
  statuses: MemoryStatus[] = ["active", "pending_review", "archived"],
): Promise<Result<{ memories: MemoryView[] }>> {
  const owned = await getOwnedHire(companyEmployeeId);
  if (!owned) return { error: "Employee not found.", status: 404 };

  const { data: rows } = await owned.supabase
    .from("employee_memories")
    .select(
      "*, employee_memory_sources(source_type, source_id)",
    )
    .eq("company_employee_id", companyEmployeeId)
    .in("status", statuses)
    .order("first_learned_at", { ascending: false });

  const now = Date.now();

  const memories: MemoryView[] = (rows ?? []).map((row) => {
    const validUntil = (row.valid_until as string | null) ?? null;
    return {
      id: row.id as string,
      category: row.category as MemoryCategory,
      categoryLabel: memoryCategoryLabel[row.category as MemoryCategory],
      title: row.title as string,
      content: row.content as string,
      status: row.status as MemoryStatus,
      confidence: row.confidence as "low" | "medium" | "high",
      conflictReason: (row.conflict_reason as string | null) ?? null,
      firstLearnedAt: row.first_learned_at as string,
      lastConfirmedAt: (row.last_confirmed_at as string | null) ?? null,
      validUntil,
      expired: validUntil !== null && new Date(validUntil).getTime() < now,
      usageCount: (row.usage_count as number) ?? 0,
      lastUsedAt: (row.last_used_at as string | null) ?? null,
      sources: ((row.employee_memory_sources ?? []) as {
        source_type: string;
        source_id: string;
      }[]).map((source) => ({ type: source.source_type, id: source.source_id })),
    };
  });

  return { memories };
}

const ALLOWED_TRANSITIONS: Record<string, { from: MemoryStatus[]; to: MemoryStatus }> = {
  confirm: { from: ["pending_review", "archived"], to: "active" },
  reject: { from: ["pending_review"], to: "rejected" },
  archive: { from: ["active", "pending_review"], to: "archived" },
};

/**
 * The manager's decision on a single lesson. Rejecting and archiving both stop
 * a memory being used, but they are kept apart: rejected means "this was never
 * right", archived means "this no longer applies", and only the second is
 * something the manager would sensibly bring back.
 */
export async function decideMemory(
  memoryId: string,
  action: "confirm" | "reject" | "archive",
): Promise<Result<{ status: MemoryStatus }>> {
  const supabase = await createClient();

  const transition = ALLOWED_TRANSITIONS[action];
  if (!transition) return { error: "Unknown action.", status: 400 };

  const { data: memory } = await supabase
    .from("employee_memories")
    .select("id, status")
    .eq("id", memoryId)
    .maybeSingle();

  if (!memory) return { error: "Memory not found.", status: 404 };

  if (!transition.from.includes(memory.status as MemoryStatus)) {
    return { error: "This memory can't be changed that way.", status: 409 };
  }

  // The status filter is the lock: two managers deciding at once means one of
  // them updates nothing and is told the state moved.
  const { data: updated } = await supabase
    .from("employee_memories")
    .update({
      status: transition.to,
      // Confirming is the manager vouching for it, which is what the freshness
      // date is measured from.
      last_confirmed_at:
        transition.to === "active" ? new Date().toISOString() : undefined,
      conflict_type: transition.to === "active" ? null : undefined,
      conflict_reason: transition.to === "active" ? null : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", memoryId)
    .in("status", transition.from)
    .select("status")
    .maybeSingle();

  if (!updated) {
    return { error: "This memory was already decided.", status: 409 };
  }

  return { status: updated.status as MemoryStatus };
}

export async function getLearningSessionForDeliverable(deliverableId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("employee_learning_sessions")
    .select("*")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
