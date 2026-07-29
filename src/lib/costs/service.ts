import { createClient } from "@/lib/supabase/server";
import { costOf } from "@/lib/costs/pricing";

export interface UsageLine {
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
}

export interface UsageSummary {
  totalUsd: number;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  lines: UsageLine[];
}

const EMPTY: UsageSummary = {
  totalUsd: 0,
  callCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  lines: [],
};

interface Row {
  purpose: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string | number;
  created_at: string;
}

function summarize(rows: Row[]): UsageSummary {
  const lines = rows.map((row) => ({
    purpose: row.purpose,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    // Postgres numeric arrives as a string. Recomputing from the stored token
    // counts would re-price at today's rate, so the stored figure is parsed
    // rather than recalculated.
    costUsd: Number(row.cost_usd),
    createdAt: row.created_at,
  }));

  return {
    totalUsd: lines.reduce((sum, line) => sum + line.costUsd, 0),
    callCount: lines.length,
    inputTokens: lines.reduce((sum, line) => sum + line.inputTokens, 0),
    outputTokens: lines.reduce((sum, line) => sum + line.outputTokens, 0),
    lines,
  };
}

/** What one assignment cost, across every model call its run made. */
export async function usageForAssignment(
  assignmentId: string,
): Promise<UsageSummary> {
  const supabase = await createClient();

  const { data: executions } = await supabase
    .from("work_executions")
    .select("id")
    .eq("assignment_id", assignmentId);

  const ids = (executions ?? []).map((row) => row.id as string);
  if (ids.length === 0) return EMPTY;

  const { data } = await supabase
    .from("model_usage")
    .select("purpose, model, input_tokens, output_tokens, cost_usd, created_at")
    .in("work_execution_id", ids)
    .order("created_at", { ascending: true });

  return summarize((data ?? []) as Row[]);
}

/**
 * What a project cost in total.
 *
 * Two sources, because a project's spend is split: the planning and merge calls
 * are charged to the project, and each member's own calls are charged to their
 * run. Reporting only the first would make a multi-employee project look nearly
 * free.
 */
export async function usageForProject(projectId: string): Promise<UsageSummary> {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("assignments")
    .select("last_execution_id")
    .eq("project_id", projectId);

  const executionIds = (members ?? [])
    .map((row) => row.last_execution_id as string | null)
    .filter((id): id is string => Boolean(id));

  const [own, memberUsage] = await Promise.all([
    supabase
      .from("model_usage")
      .select("purpose, model, input_tokens, output_tokens, cost_usd, created_at")
      .eq("project_id", projectId),
    executionIds.length > 0
      ? supabase
          .from("model_usage")
          .select("purpose, model, input_tokens, output_tokens, cost_usd, created_at")
          .in("work_execution_id", executionIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const rows = [...((own.data ?? []) as Row[]), ...((memberUsage.data ?? []) as Row[])];
  rows.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return summarize(rows);
}

/**
 * What the company has spent recently.
 *
 * The window is given in days and resolved here rather than by the caller,
 * because the caller is a server component and reading the clock during render
 * is exactly the kind of impurity that makes a page disagree with itself
 * between renders.
 */
export async function usageForCompany(
  companyId: string,
  withinDays?: number,
): Promise<UsageSummary> {
  const supabase = await createClient();

  let query = supabase
    .from("model_usage")
    .select("purpose, model, input_tokens, output_tokens, cost_usd, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (withinDays !== undefined) {
    const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
    query = query.gte("created_at", since.toISOString());
  }

  const { data } = await query;
  return summarize((data ?? []) as Row[]);
}

/** Re-priced at today's rates, for "what would this cost if I ran it again".
 *  Kept separate from the stored figure so the two can never be confused. */
export function repriceAtCurrentRates(summary: UsageSummary): number {
  return summary.lines.reduce((sum, line) => {
    try {
      return (
        sum +
        costOf({
          backend: line.model,
          inputTokens: line.inputTokens,
          outputTokens: line.outputTokens,
        })
      );
    } catch {
      // Lenient here, and only here. Pricing refuses unknown backends so a
      // paid call can never be recorded as free — but this is a "what would
      // this cost today" figure over rows that may name a model since retired
      // from the sheet. Skipping one is a slightly low estimate on a screen;
      // throwing would take down the whole usage page over old history. The
      // spend limit does not read this — it reads the cost stored at the time.
      return sum;
    }
  }, 0);
}
