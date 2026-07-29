import { createClient } from "@/lib/supabase/server";

export interface CompanyContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  companyId: string;
  companyName: string;
  timezone: string;
}

/** Falls back to a real zone rather than UTC when a company predates the
 *  setting, so a schedule set up before the field existed still means a
 *  sensible local time. */
export const FALLBACK_TIMEZONE = "Asia/Seoul";

export async function getCompanyContext(): Promise<CompanyContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, timezone")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!company) return null;

  return {
    supabase,
    companyId: company.id as string,
    companyName: company.name as string,
    timezone: (company.timezone as string | null) ?? FALLBACK_TIMEZONE,
  };
}
