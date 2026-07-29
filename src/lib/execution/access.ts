import { createClient } from "@/lib/supabase/server";

export interface OwnedExecution {
  supabase: Awaited<ReturnType<typeof createClient>>;
  execution: {
    id: string;
    company_id: string;
    assignment_id: string;
    company_employee_id: string;
    status: string;
    current_step: string | null;
    attempt_number: number;
    error_code: string | null;
    search_request_count: number;
    source_fetch_count: number;
    /** Role-specific counts, shaped by the skill that ran. */
    metrics_json: unknown;
    started_at: string | null;
    completed_at: string | null;
    failed_at: string | null;
  };
}

/**
 * Loads a work execution the current user's company owns, or null. RLS scopes
 * work_executions by companies.owner_id, so another company's id simply misses.
 * Note what is deliberately absent from the selected columns: input_snapshot,
 * research_plan_json, and error_message never leave the server.
 */
export async function getOwnedExecution(
  executionId: string,
): Promise<OwnedExecution | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("work_executions")
    .select(
      "id, company_id, assignment_id, company_employee_id, status, current_step, attempt_number, error_code, search_request_count, source_fetch_count, metrics_json, started_at, completed_at, failed_at",
    )
    .eq("id", executionId)
    .maybeSingle();

  if (!data) return null;

  return { supabase, execution: data as OwnedExecution["execution"] };
}
