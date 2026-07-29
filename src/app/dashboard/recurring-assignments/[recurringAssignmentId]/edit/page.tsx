import { notFound, redirect } from "next/navigation";
import { getOwnedRecurring } from "@/lib/recurring/access";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { NavBar } from "@/components/NavBar";
import type { RecurringDraft } from "@/lib/recurring/draft";
import type { Weekday } from "@/lib/schedule/time";

export default async function EditRecurringPage({
  params,
}: {
  params: Promise<{ recurringAssignmentId: string }>;
}) {
  const { recurringAssignmentId } = await params;

  const owned = await getOwnedRecurring(recurringAssignmentId);
  if (!owned) notFound();

  const { supabase, recurring, employee, companyEmployeeId } = owned;

  // An ended schedule is a record, not a thing to change.
  if (recurring.status === "ended") {
    redirect(`/dashboard/recurring-assignments/${recurringAssignmentId}`);
  }

  const definition = getEmployeeDefinition(employee.slug);

  const { data: profile } = await supabase
    .from("employee_knowledge_profiles")
    .select("role_knowledge_json")
    .eq("company_employee_id", companyEmployeeId)
    .maybeSingle();

  const roleKnowledge = profile?.role_knowledge_json as
    | { idealCustomerProfile?: Record<string, unknown>; buyingSignals?: string[] }
    | null;

  const roleDefaults = roleKnowledge
    ? { ...roleKnowledge.idealCustomerProfile, buyingSignals: roleKnowledge.buyingSignals }
    : {};

  const { data: waiting } = await supabase
    .from("recurring_assignment_occurrences")
    .select("id")
    .eq("recurring_assignment_id", recurringAssignmentId)
    .eq("status", "waiting")
    .maybeSingle();

  const initial: RecurringDraft = {
    title: recurring.title,
    description: recurring.description,
    expectedOutcome: recurring.expected_outcome ?? "",
    priority: recurring.priority,
    roleInput: recurring.role_input_json ?? {},
    frequency: recurring.frequency,
    interval: recurring.interval_count,
    daysOfWeek: (recurring.days_of_week ?? []) as Weekday[],
    dayOfMonth: recurring.day_of_month ?? 1,
    // Stored as "09:00:00"; the time input wants "09:00".
    localTime: recurring.local_time.slice(0, 5),
    startDate: recurring.start_date,
    conflictPolicy: recurring.conflict_policy,
  };

  const { EditRecurringForm } = await import("./EditRecurringForm");

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Edit recurring assignment
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Changes apply to future assignments. Work already done is left as it is.
        </p>

        <EditRecurringForm
          recurringAssignmentId={recurring.id}
          employeeName={employee.name}
          skillId={definition?.skillId ?? ""}
          roleDefaults={roleDefaults}
          timezone={recurring.timezone}
          initial={initial}
          hasWaiting={Boolean(waiting)}
        />
      </main>
    </div>
  );
}
