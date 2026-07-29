import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * A client that acts as the service itself rather than as a logged-in person.
 *
 * Used by exactly one caller: the scheduler, which runs on a timer with no user
 * session and must see every company's due schedules. Because this bypasses row
 * level security, anything reached through it has to check the company
 * relationship in code — there is no policy underneath to catch a mistake.
 *
 * Never import this into a request handler that serves a user.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Scheduler credentials are not configured.");
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
