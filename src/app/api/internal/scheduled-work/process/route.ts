import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runSchedulerPass, findAssignmentsToStart } from "@/lib/recurring/processor";
import { startScheduledExecution } from "@/lib/recurring/execution";
import { failStaleInternalRequests } from "@/lib/collaboration/sweeper";

// Creating assignments is quick; starting their work is not, and the loop below
// hands off rather than waiting.
export const maxDuration = 300;

/**
 * The scheduler's tick.
 *
 * Called on a timer by the hosting platform, not by a person, so it
 * authenticates with a shared secret instead of a session. It deliberately
 * returns counts and nothing else: this endpoint sits outside row level
 * security, and an error body that named companies or assignments would leak
 * across tenants to whoever holds the secret.
 */
/**
 * The same tick, reachable by a timer that can only send GET.
 *
 * Every hosted cron worth using — Vercel's, and most of the standalone
 * services — issues a plain GET. Without this the endpoint was correct and
 * unreachable, which is why nothing in this product has ever actually run
 * overnight: the scheduler existed and nobody was calling it.
 *
 * A GET that changes things is not something to do casually. It is safe here
 * only because the bearer secret gates it: nothing that merely follows links
 * or prefetches URLs can reach past the 401.
 */
export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_SCHEDULER_SECRET;

  if (!secret) {
    // Refusing is safer than running unauthenticated on a misconfigured deploy.
    return NextResponse.json({ error: "Not available." }, { status: 503 });
  }

  const provided = request.headers.get("authorization");
  if (provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let report;
  try {
    const db = createServiceClient();

    // Swept on the same tick: a request left open by a run that died holds a
    // colleague busy and a requester waiting, and neither resolves on its own.
    await failStaleInternalRequests(db);

    report = await runSchedulerPass(db);

    // Started outside the scheduling pass so a slow research run can't hold up
    // the tick or leave a half-scheduled turn behind.
    const pending = await findAssignmentsToStart(db);
    for (const assignmentId of pending) {
      await startScheduledExecution(db, assignmentId);
    }

    return NextResponse.json({ ok: true, ...report, started: pending.length });
  } catch {
    // The cause is logged by the platform; the response says nothing.
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}
