import { createClient } from "@/lib/supabase/server";

export interface OwnedRevisionRequest {
  supabase: Awaited<ReturnType<typeof createClient>>;
  request: {
    id: string;
    company_id: string;
    assignment_id: string;
    source_deliverable_id: string;
    company_employee_id: string;
    feedback: string;
    status: string;
    target_version: number;
    requested_at: string;
  };
}

/**
 * Loads a revision request the current user's company owns, or null. RLS scopes
 * revision_requests by companies.owner_id, so another company's id simply
 * misses and callers surface 404.
 */
export async function getOwnedRevisionRequest(
  revisionRequestId: string,
): Promise<OwnedRevisionRequest | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("revision_requests")
    .select(
      "id, company_id, assignment_id, source_deliverable_id, company_employee_id, feedback, status, target_version, requested_at",
    )
    .eq("id", revisionRequestId)
    .maybeSingle();

  if (!data) return null;

  return { supabase, request: data as OwnedRevisionRequest["request"] };
}
