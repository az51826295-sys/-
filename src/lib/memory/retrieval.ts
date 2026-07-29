import { createClient } from "@/lib/supabase/server";
import { normalizeForComparison } from "@/lib/memory/validation";
import {
  MAX_MEMORIES_PER_EXECUTION,
  RETRIEVAL_CAPS,
  type MemoryCategory,
} from "@/lib/memory/types";

export interface RetrievedMemory {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  relevance: number;
  firstLearnedAt: string;
  lastConfirmedAt: string | null;
}

/** Words that match everything and therefore distinguish nothing. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "is",
  "are", "be", "that", "this", "it", "as", "at", "by", "from", "our", "we",
  "you", "your", "their", "them", "should", "would", "when", "what", "how",
  "report", "research", "market", "analysis", "work", "company", "customer",
]);

function keywords(text: string): Set<string> {
  return new Set(
    normalizeForComparison(text)
      .split(" ")
      .filter((word) => word.length > 3 && !STOPWORDS.has(word)),
  );
}

/**
 * Scores a memory against the assignment at hand. Deliberately simple keyword
 * overlap plus recency — an employee with twenty lessons does not need semantic
 * search, and a scoring rule the manager can be told in one sentence is worth
 * more here than one that is slightly better but unexplainable.
 */
function scoreMemory(
  memory: { category: MemoryCategory; title: string; content: string; lastConfirmedAt: string | null; firstLearnedAt: string },
  assignmentWords: Set<string>,
): number {
  const words = keywords(`${memory.title} ${memory.content}`);

  let overlap = 0;
  for (const word of words) {
    if (assignmentWords.has(word)) overlap += 1;
  }
  const topical = words.size > 0 ? overlap / words.size : 0;

  // How this manager wants work done applies to every assignment, whether or
  // not the words happen to match; a market finding only applies when it does.
  const alwaysRelevant =
    memory.category === "manager_preference" || memory.category === "work_pattern";

  const confirmedAt = memory.lastConfirmedAt ?? memory.firstLearnedAt;
  const ageDays = (Date.now() - new Date(confirmedAt).getTime()) / 86_400_000;
  const recency = Math.max(0, 1 - ageDays / 365);

  const base = alwaysRelevant ? 0.5 : 0;
  return Math.round((base + topical * 0.4 + recency * 0.1) * 100);
}

/**
 * Picks what the employee should have in mind for this assignment. Only active
 * memories are used: anything awaiting the manager's decision, archived, or
 * past its validity date stays out of the work entirely.
 */
export async function retrieveMemoriesForAssignment(
  params: {
    companyEmployeeId: string;
    assignmentTitle: string;
    assignmentDescription: string;
    expectedOutcome?: string;
  },
  db?: Awaited<ReturnType<typeof createClient>>,
): Promise<RetrievedMemory[]> {
  const supabase = db ?? (await createClient());

  const nowIso = new Date().toISOString();

  const { data: rows } = await supabase
    .from("employee_memories")
    .select(
      "id, category, title, content, first_learned_at, last_confirmed_at, valid_until",
    )
    .eq("company_employee_id", params.companyEmployeeId)
    .eq("status", "active")
    .or(`valid_until.is.null,valid_until.gt.${nowIso}`);

  if (!rows || rows.length === 0) return [];

  const assignmentWords = keywords(
    [params.assignmentTitle, params.assignmentDescription, params.expectedOutcome ?? ""].join(" "),
  );

  const scored: RetrievedMemory[] = rows
    .map((row) => {
      const memory = {
        id: row.id as string,
        category: row.category as MemoryCategory,
        title: row.title as string,
        content: row.content as string,
        firstLearnedAt: row.first_learned_at as string,
        lastConfirmedAt: (row.last_confirmed_at as string | null) ?? null,
      };
      return { ...memory, relevance: scoreMemory(memory, assignmentWords) };
    })
    .sort((a, b) => b.relevance - a.relevance);

  // Per-category caps first, so a pile of research findings can't crowd out the
  // one preference the manager actually stated.
  const used: Record<string, number> = {};
  const selected: RetrievedMemory[] = [];

  for (const memory of scored) {
    if (selected.length >= MAX_MEMORIES_PER_EXECUTION) break;
    const count = used[memory.category] ?? 0;
    if (count >= RETRIEVAL_CAPS[memory.category]) continue;
    used[memory.category] = count + 1;
    selected.push(memory);
  }

  return selected;
}

/**
 * Records which memories went into an execution and freezes a copy of their
 * wording. A memory can later be edited or archived; the record of why a past
 * deliverable said what it said must not change with it.
 */
export async function recordMemoryUse(
  executionId: string,
  memories: RetrievedMemory[],
  db?: Awaited<ReturnType<typeof createClient>>,
): Promise<void> {
  const supabase = db ?? (await createClient());

  await supabase
    .from("work_executions")
    .update({
      memory_count: memories.length,
      memory_context_snapshot: {
        capturedAt: new Date().toISOString(),
        memories: memories.map((memory) => ({
          id: memory.id,
          category: memory.category,
          title: memory.title,
          content: memory.content,
          relevance: memory.relevance,
        })),
      },
    })
    .eq("id", executionId);

  if (memories.length === 0) return;

  await supabase.from("work_execution_memories").upsert(
    memories.map((memory) => ({
      work_execution_id: executionId,
      employee_memory_id: memory.id,
      relevance_score: memory.relevance,
      usage_type: "included_in_context",
    })),
    { onConflict: "work_execution_id,employee_memory_id" },
  );
}

/**
 * Marks the memories the deliverable says it actually used. Ids the model
 * invented, or that belong to another employee, are dropped rather than
 * trusted — the model reports what it applied, it does not get to decide what
 * counts as a memory.
 */
export async function recordAppliedMemories(
  executionId: string,
  deliverableId: string,
  claimedIds: string[],
  available: RetrievedMemory[],
  db?: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  const supabase = db ?? (await createClient());

  const allowed = new Set(available.map((memory) => memory.id));
  const applied = [...new Set(claimedIds)].filter((id) => allowed.has(id));

  await supabase
    .from("deliverables")
    .update({ applied_memory_ids: applied })
    .eq("id", deliverableId);

  if (applied.length === 0) return applied;

  const { error } = await supabase
    .from("work_execution_memories")
    .update({ usage_type: "applied" })
    .eq("work_execution_id", executionId)
    .in("employee_memory_id", applied);

  // Thrown rather than ignored: a write that RLS refuses returns an error and
  // no rows, which is indistinguishable from success unless it is checked. The
  // caller treats this as bookkeeping and keeps the deliverable either way.
  if (error) throw new Error(`applied memory update failed: ${error.message}`);

  // usage_count is what the manager sees as "used in N assignments", so it
  // counts applications, not retrievals.
  for (const id of applied) {
    await supabase.rpc("increment_memory_usage", { p_memory_id: id });
  }

  return applied;
}
