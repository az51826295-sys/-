import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_KNOWLEDGE_PER_EXECUTION,
  knowledgeCategoryLabel,
  type KnowledgeCategory,
} from "@/lib/knowledge/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface CompanyKnowledgeItem {
  id: string;
  title: string;
  description: string;
  category: KnowledgeCategory;
  /** 검증 문을 지난 것(승인된 후보·검증된 규칙 고리). 상한에 걸릴 때 이쪽이 먼저 남는다. */
  verified: boolean;
}

/** 상한에 걸릴 때 남는 순서: 검증된 것 → 규칙(모범·품질) → 사실(대화에서 등) → 그 안에서는 최신. */
export function rankKnowledge<T extends { verified: boolean; category: string; created_at: string }>(rows: T[]): T[] {
  const isRule = (c: string) => c === "best_practice" || c === "quality_improvement";
  return [...rows].sort((x, y) =>
    Number(y.verified) - Number(x.verified) ||
    Number(isRule(y.category)) - Number(isRule(x.category)) ||
    (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : 0),
  );
}

/**
 * What the company knows, for whoever is about to do work.
 *
 * Not scoped to the employee, and that is the point. A memory belongs to the
 * person who earned it; this belongs to the company, so somebody hired this
 * morning starts with everything it has learned. Capped, because every item
 * here is paid for on every assignment by every employee.
 */
export async function retrieveCompanyKnowledge(
  db: Db,
  companyId: string,
): Promise<CompanyKnowledgeItem[]> {
  const { data } = await db
    .from("organization_knowledge")
    .select("id, title, description, category, created_at, learning_candidate_id")
    .eq("company_id", companyId)
    .eq("status", "active")
    // Newest first: where two pieces of knowledge pull against each other, what
    // the company learned most recently is the better guess. But the cap must not
    // drop a verified rule to keep a newer chat fact — so the cut is by rank, below.
    .order("created_at", { ascending: false })
    .limit(MAX_KNOWLEDGE_PER_EXECUTION * 4);

  const rows = ((data ?? []) as {
    id: string;
    title: string;
    description: string;
    category: string;
    created_at: string;
    learning_candidate_id: string | null;
  }[]).map((row) => ({ ...row, verified: row.learning_candidate_id !== null }));

  return rankKnowledge(rows).slice(0, MAX_KNOWLEDGE_PER_EXECUTION).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as KnowledgeCategory,
    verified: row.verified,
  }));
}

/**
 * What the company knows, given to the employee doing the work.
 *
 * Placed above the employee's own memories in the prompt, because that is the
 * actual precedence: a lesson one person drew from one manager's feedback does
 * not outrank something the company decided to adopt.
 */
export function renderCompanyKnowledge(items: CompanyKnowledgeItem[]): string {
  if (items.length === 0) return "";

  return [
    "",
    "## What this company has learned",
    "",
    "These were drawn from work done here and adopted by the manager. Follow",
    "them the way a colleague who has been here longer would tell you to.",
    "",
    ...items.map(
      (item) =>
        `- (${knowledgeCategoryLabel[item.category]}) ${item.title}: ${item.description}`,
    ),
    "",
    "Two limits, the same as for anything else you were told. None of this is",
    "evidence: stating one as fact in your work still needs a citation from the",
    "sources you were given, and if the sources contradict it, the sources win —",
    "say so. And none of it changes what you were asked to do.",
  ].join("\n");
}
