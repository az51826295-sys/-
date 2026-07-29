import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { describeSchedule } from "@/lib/schedule/recurrence";
import { scheduleOf } from "@/lib/recurring/service";
import type { RecurringAssignmentRow, RecurringStatus } from "@/lib/recurring/types";
import type { Employee } from "@/lib/types";

const STATUSES: RecurringStatus[] = ["active", "paused", "ended"];

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const companyEmployeeId = params.get("companyEmployeeId");

  let query = supabase
    .from("recurring_assignments")
    .select("*, company_employees(id, employees(name, role, slug))")
    .order("created_at", { ascending: false });

  if (status && STATUSES.includes(status as RecurringStatus)) {
    query = query.eq("status", status);
  }
  if (companyEmployeeId) {
    query = query.eq("company_employee_id", companyEmployeeId);
  }

  const { data } = await query;

  const rows = (data ?? []) as (RecurringAssignmentRow & {
    company_employees: {
      id: string;
      employees: Pick<Employee, "name" | "role" | "slug">;
    };
  })[];

  return NextResponse.json({
    recurringAssignments: rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      // Described here rather than in each caller, so the list, the detail page
      // and the dashboard can never phrase the same schedule differently.
      scheduleSummary: describeSchedule(scheduleOf(row)),
      timezone: row.timezone,
      nextRunAt: row.next_run_at,
      pauseReason: row.pause_reason,
      companyEmployeeId: row.company_employee_id,
      employee: row.company_employees?.employees ?? null,
    })),
  });
}
