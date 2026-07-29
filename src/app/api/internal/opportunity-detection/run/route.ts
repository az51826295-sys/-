import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runOpportunityDetection } from "@/lib/initiatives/detection";

// Observation plus one round of judgement, per employee.
export const maxDuration = 300;

/**
 * The looking-around tick.
 *
 * Called on a timer, so it authenticates with a shared secret rather than a
 * session, and returns counts only — it sits outside row level security, and a
 * body naming companies or proposals would leak across tenants to whoever holds
 * the secret.
 *
 * Produces proposals and nothing else. No assignment is created here however
 * good the opportunity looks; that decision belongs to a person.
 */
export async function POST(request: Request) {
  const secret = process.env.INTERNAL_SCHEDULER_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Not available." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createServiceClient();

    // Employees who can actually work. An un-onboarded employee has no company
    // knowledge to judge anything against.
    const { data: hires } = await db
      .from("company_employees")
      .select("id")
      .eq("onboarding_status", "completed")
      .limit(50);

    let created = 0;
    let suppressed = 0;
    let failed = 0;

    for (const hire of hires ?? []) {
      const result = await runOpportunityDetection(db, hire.id as string);
      if (result.ok) {
        created += result.created;
        suppressed += result.suppressed;
      } else {
        failed += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      employeesChecked: (hires ?? []).length,
      created,
      suppressed,
      failed,
    });
  } catch {
    return NextResponse.json({ error: "Detection failed." }, { status: 500 });
  }
}
