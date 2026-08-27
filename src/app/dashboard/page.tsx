import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { StartWork } from "./StartWork";
import { ensureOrganization, loadOrganization } from "@/lib/departments/service";
import { loadPolicySummary } from "@/lib/policies/service";
import { loadPlaybookSummary } from "@/lib/playbooks/service";
import { loadLearningSummary } from "@/lib/knowledge/service";
import { loadHealthSummary } from "@/lib/intelligence/service";
import { loadPlanningSummary } from "@/lib/planning/service";
import { loadEvolutionSummary } from "@/lib/evolution/service";
import { healthClass, healthLabel } from "@/lib/intelligence/types";
import { getCurrentCycle, loadCycleDetail } from "@/lib/operations/service";
import { formatUsd } from "@/lib/costs/pricing";
import { checkAllowance } from "@/lib/costs/allowance";
import { ACTIVE_ASSIGNMENT_STATUSES } from "@/lib/assignments/service";
import {
  deliverableStatusLabel,
  formatAssignedDate,
} from "@/lib/assignments/labels";
import {
  attentionBadgeClass,
  attentionLabel,
  attentionStateFor,
  compareByAttention,
  labelForDeliverableType,
  onboardingCta,
  type AttentionState,
} from "@/lib/assignments/workforce";
import { formatInZone } from "@/lib/schedule/time";
import type { RecurringAssignmentRow } from "@/lib/recurring/types";
import type {
  Assignment,
  CompanyEmployee,
  Deliverable,
  Employee,
} from "@/lib/types";

/** Lead lists are counted in verified companies; other deliverables have no
 *  equivalent single number, so nothing is shown for them. */
function verifiedLeadCount(deliverable: {
  deliverable_type: string;
  content_json: unknown;
}): number | null {
  if (deliverable.deliverable_type !== "lead_list") return null;
  const content = deliverable.content_json as { verifiedCount?: unknown } | null;
  return typeof content?.verifiedCount === "number" ? content.verifiedCount : null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!company) {
    redirect("/company/new");
  }

  // 서로 독립적인 조회들. 순서대로 기다릴 이유가 없다.
  const [
    { data: hireRows },
    { data: activeRows },
    { data: pendingRows },
    { data: recentRows },
    { data: unstartedRows },
    { data: recurringRows },
    { data: waitingRows },
  ] = await Promise.all([
    supabase
      .from("company_employees")
      .select("*, employees(*)")
      .eq("company_id", company.id),
    supabase
      .from("assignments")
      .select("*")
      .eq("company_id", company.id)
      .in("status", [...ACTIVE_ASSIGNMENT_STATUSES]),
    supabase
      .from("deliverables")
      .select(
        "*, assignments!inner(id, title, assignment_type), company_employees!deliverables_company_employee_id_fkey(id, employees(name, role))",
      )
      .eq("company_id", company.id)
      .eq("status", "submitted")
      // Nothing done for a colleague ever waits on the manager's review.
      .eq("assignments.assignment_type", "manager")
      .order("submitted_at", { ascending: false }),
    // The last few things that came back, whatever happened to them afterwards.
    //
    // Work and Results left the menu bar, and they had to: neither is a place
    // anybody goes. What a person actually wants is "what has this company
    // produced lately", which is a short list, not a filterable table. The
    // tables still exist and are one click from here.
    supabase
      .from("deliverables")
      .select(
        "id, title, status, submitted_at, assignments!inner(assignment_type), company_employees!deliverables_company_employee_id_fkey(employees(name))",
      )
      .eq("company_id", company.id)
      .eq("assignments.assignment_type", "manager")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(4),
    supabase
      .from("projects")
      .select("id, title")
      .eq("company_id", company.id)
      .eq("status", "plan_ready")
      .order("planned_at", { ascending: false }),
    supabase
      .from("recurring_assignments")
      .select("*, company_employees(id, employees(name))")
      .eq("company_id", company.id)
      .in("status", ["active", "paused"]),
    supabase
      .from("recurring_assignment_occurrences")
      .select("id, recurring_assignment_id, company_employee_id, scheduled_for")
      .eq("company_id", company.id)
      .eq("status", "waiting")
      .order("scheduled_for", { ascending: true })
      .limit(5),
  ]);

  const hires = (hireRows ?? []) as (CompanyEmployee & { employees: Employee })[];

  const active = (activeRows ?? []) as Assignment[];

  // An employee busy on somebody else's behalf — a colleague's errand or a
  // piece of a project — is genuinely occupied, but the manager should see who
  // or what they are working for rather than the internal task's title.
  const activeByEmployee = new Map<string, Assignment>();
  const helpingByEmployee = new Map<string, Assignment>();

  for (const assignment of active) {
    if (assignment.assignment_type === "manager") {
      activeByEmployee.set(assignment.company_employee_id, assignment);
    } else {
      helpingByEmployee.set(assignment.company_employee_id, assignment);
    }
  }

  const pending = (pendingRows ?? []) as (Deliverable & {
    assignments: Pick<Assignment, "id" | "title">;
    company_employees: { id: string; employees: Pick<Employee, "name" | "role"> };
  })[];

  const pendingByEmployee = new Map(pending.map((d) => [d.company_employee_id, d]));

  const unstartedProjects = (unstartedRows ?? []) as {
    id: string;
    title: string;
  }[];

  const recent = (recentRows ?? []) as unknown as {
    id: string;
    title: string;
    status: string;
    submitted_at: string;
    company_employees: { employees: { name: string } } | null;
  }[];

  // Each employee's state is worked out once, then used for both the counts and
  // the ordering, so the overview can never disagree with the list below it.
  const cards = hires
    .map((hire) => {
      const assignment = activeByEmployee.get(hire.id);
      const deliverable = pendingByEmployee.get(hire.id);
      const helping = helpingByEmployee.get(hire.id);
      return {
        hire,
        assignment,
        deliverable,
        helping,
        // An employee helping a colleague counts as working, so the overview
        // doesn't report them as free while they're mid-errand.
        state: attentionStateFor(
          hire,
          assignment ?? helping,
          Boolean(deliverable),
        ),
      };
    })
    .sort((a, b) => {
      const byAttention = compareByAttention(a.state, b.state);
      return byAttention !== 0
        ? byAttention
        : a.hire.employees.name.localeCompare(b.hire.employees.name);
    });

  const countOf = (...states: AttentionState[]) =>
    cards.filter((card) => states.includes(card.state)).length;

  const recurring = (recurringRows ?? []) as (RecurringAssignmentRow & {
    company_employees: { id: string; employees: { name: string } };
  })[];

  const activeRecurring = recurring.filter((row) => row.status === "active");

  // Soonest first, so the answer to "what happens next" is at the top.
  const upcoming = activeRecurring
    .filter((row) => row.next_run_at)
    .sort((a, b) => a.next_run_at!.localeCompare(b.next_run_at!))
    .slice(0, 5);

  // Two different problems, told apart because the fix differs: one needs the
  // manager to review work, the other needs them to look at the schedule.
  const pausedByFailure = recurring.filter(
    (row) => row.status === "paused" && row.pause_reason,
  );

  const waiting = (waitingRows ?? []) as {
    id: string;
    recurring_assignment_id: string;
    company_employee_id: string;
    scheduled_for: string;
  }[];

  const recurringById = new Map(recurring.map((row) => [row.id, row]));

  // What is left rather than what has gone: the allowance is the number that
  // decides whether the next click will work.
  // ── 한 번에 다녀온다 ────────────────────────────────────────────
  //
  // 아래 것들은 서로를 필요로 하지 않는다. 그런데 예전에는 한 줄씩
  // 차례로 await 해서, 원격 DB 왕복 300~400ms가 그대로 줄을 섰다.
  // 대시보드 하나 여는 데 7~10초가 걸린 이유가 이것이었다.
  //
  // 순서가 필요한 두 쌍만 안에서 이어 붙인다:
  //   ensureOrganization → loadOrganization  (조직을 맞춘 뒤 읽어야 한다)
  //   getCurrentCycle    → loadCycleDetail   (사이클을 알아야 상세를 읽는다)
  const [
    allowance,
    organization,
    standards,
    playbooks,
    learning,
    health,
    planning,
    evolution,
    operation,
    projectResult,
  ] = await Promise.all([
    checkAllowance(supabase, company.id),
    // Reconciled here too, because the dashboard is where most people land
    // first and an employee with no department would make every routing
    // decision below quietly wrong.
    ensureOrganization(supabase, company.id).then(() =>
      loadOrganization(supabase, company.id),
    ),
    loadPolicySummary(supabase, company.id),
    loadPlaybookSummary(supabase, company.id),
    loadLearningSummary(supabase, company.id),
    loadHealthSummary(supabase, company.id),
    loadPlanningSummary(supabase, company.id),
    loadEvolutionSummary(supabase, company.id),
    getCurrentCycle().then(async (current) => ({
      current,
      detail: current ? await loadCycleDetail(current.id) : null,
    })),
    supabase
      .from("projects")
      .select("id, title, goal, status")
      .eq("company_id", company.id)
      .in("status", ["planning", "working", "merging", "reviewing"])
      .order("created_at", { ascending: false }),
  ]);

  const currentOperation = operation.current;
  const operationDetail = operation.detail;
  const projectRows = projectResult.data;

  const activeProjects = (projectRows ?? []) as {
    id: string;
    title: string;
    goal: string;
    status: string;
  }[];

  const projectsNeedingReview = activeProjects.filter(
    (project) => project.status === "reviewing",
  );

  const [{ data: collaborationRows }, { data: initiativeRows }] = await Promise.all([
    supabase
      .from("internal_requests")
      .select(
        "id, title, requester:company_employees!internal_requests_requester_company_employee_id_fkey(employees(name)), assignee:company_employees!internal_requests_assignee_company_employee_id_fkey(employees(name))",
      )
      .eq("company_id", company.id)
      .in("status", ["pending", "working"])
      .limit(5),
    supabase
      .from("initiatives")
      .select("id, title, recommendation, confidence, company_employees(employees(name))")
      .eq("company_id", company.id)
      .eq("status", "new")
      .order("confidence_score", { ascending: false })
      .limit(5),
  ]);

  const collaborating = ((collaborationRows ?? []) as unknown as {
    id: string;
    title: string;
    requester: { employees: { name: string } } | null;
    assignee: { employees: { name: string } } | null;
  }[]).map((row) => ({
    id: row.id,
    title: row.title,
    requesterName: row.requester?.employees?.name ?? "An employee",
    assigneeName: row.assignee?.employees?.name ?? "a colleague",
  }));

  const initiatives = (initiativeRows ?? []) as unknown as {
    id: string;
    title: string;
    recommendation: string;
    confidence: string;
    company_employees: { employees: { name: string } } | null;
  }[];

  const overview: { label: string; value: number | string }[] = [
    { label: "Employees", value: hires.length },
    { label: "Ready", value: countOf("ready") },
    { label: "Working", value: countOf("working", "reviewing_assignment") },
    { label: "Pending Review", value: countOf("awaiting_review") },
    // Onboarding counts as needing attention but sorts near the bottom of the
    // list: it is a known todo the manager chose to leave, not an interruption
    // like a run that stopped.
    { label: "Needs Attention", value: countOf("blocked", "needs_onboarding") },
    { label: "Recurring", value: activeRecurring.length },
    { label: "Projects", value: activeProjects.length },
    { label: "Departments", value: organization.length },
    // Remaining rather than spent. "You have used $2.40" makes the manager do
    // the subtraction; "$0.60 left" is the number that changes what they do next.
    {
      label: `Left of ${formatUsd(allowance.limitUsd)}`,
      value: formatUsd(allowance.remainingUsd),
    },
  ];

  /*
   * What is actually waiting on the manager, named by person and ordered by
   * what it costs to leave undone.
   *
   * Reviewing comes first because an unreviewed deliverable holds its author
   * hostage — that employee cannot take anything else until the manager
   * decides. Idle employees come next: capacity already paid for and not used.
   * Everything after that can wait a day without costing anything.
   */
  const todo: { text: string; href: string; cta: string }[] = [];

  for (const item of pending.slice(0, 3)) {
    todo.push({
      text: `${item.company_employees?.employees?.name ?? "Someone"} finished "${item.assignments.title}" and is waiting on you.`,
      href: `/dashboard/deliverables/${item.id}`,
      cta: "Review",
    });
  }

  /*
   * A project that has been planned and not started, second only to reviewing.
   *
   * This is work the manager began and then walked away from mid-decision. It
   * costs nothing to leave, which is exactly why it disappears: nobody is
   * blocked, no employee is idle because of it, and it will sit there
   * indefinitely unless something says so. Somebody typed a sentence because
   * they wanted the thing; the plan being ready is the moment that becomes
   * one click away.
   */
  for (const project of unstartedProjects.slice(0, 2)) {
    todo.push({
      text: `"${project.title}" is planned and waiting for you to start it.`,
      href: `/dashboard/projects/${project.id}/plan`,
      cta: "Read the plan",
    });
  }

  for (const card of cards.filter((row) => row.state === "ready").slice(0, 2)) {
    todo.push({
      text: `${card.hire.employees.name} is free. ${card.hire.employees.role}.`,
      href: `/dashboard/employees/${card.hire.id}/assign`,
      cta: "Assign work",
    });
  }

  for (const card of cards.filter((row) => row.state === "needs_onboarding")) {
    todo.push({
      text: `${card.hire.employees.name} hasn't been trained yet and can't work until they are.`,
      href: `/dashboard/employees/${card.hire.id}`,
      cta: "Train",
    });
  }

  if (hires.length === 0) {
    todo.push({
      text: "You have no employees yet. Hiring one takes a couple of minutes.",
      href: "/employees",
      cta: "Hire",
    });
  }

  /*
   * Things an employee found without being asked.
   *
   * This is the only item on the list the manager did not set in motion, which
   * makes it the one worth coming back for — the others are consequences of
   * their own clicks. It sat tenth on the page until now, which is a strange
   * place to put the only thing that happened while they were away.
   */
  for (const initiative of initiatives.slice(0, 2)) {
    todo.push({
      text: `${initiative.company_employees?.employees?.name ?? "Someone"} noticed something: ${initiative.title}`,
      href: "/dashboard/initiatives",
      cta: "Look",
    });
  }

  if (learning.pending > 0) {
    todo.push({
      text: `${learning.pending} ${learning.pending === 1 ? "thing" : "things"} your employees learned are waiting for you to adopt or turn down.`,
      href: "/dashboard/learning",
      cta: "Decide",
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <p className="text-sm text-zinc-500">내 회사</p>
        <h1 className="text-2xl font-semibold text-zinc-900">{company.name}</h1>

        {/*
          일을 시키는 자리를 맨 위에 둔다.

          이 화면은 **이미 시킨 일을 다시 찾는** 곳이지 시키는 곳이 아니다.
          그런데 지금까지 여기가 첫 화면이라, 무언가 시키려면 아래로 스크롤해
          직원 목록에서 사람을 고르고 "Assign Work" 를 눌러야 했다 — 누구에게
          맡길지 매니저가 먼저 정해야 하는 구조다. 대화는 그걸 묻지 않는다.
        */}
        <Link
          href="/ask"
          className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4 hover:border-zinc-400"
        >
          <span>
            <span className="block font-medium text-zinc-900">
              말로 시키기
            </span>
            <span className="block text-sm text-zinc-500">
              필요한 것을 말하면 누가 할지는 회사가 정합니다
            </span>
          </span>
          <span className="text-zinc-400">→</span>
        </Link>

        {/*
          How the company is doing, in the first thing anybody reads.

          The detail lives further down and stays there — nobody opens this
          page to study a diagnosis. But whether anything is wrong is the one
          fact worth knowing before deciding what to type into the box below,
          and it was previously nine sections away behind the word "View".

          The finding is named rather than counted. "1 thing worth knowing" is
          a status light with no bulb in it: the manager learns only that
          something exists, and cannot tell "a department is slightly ahead"
          from "nothing has been reviewed in nine days" without clicking. Every
          word of this was already computed, and computed for free.
        */}
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={`rounded-full px-3 py-0.5 text-xs font-medium ${healthClass[health.health]}`}
          >
            {healthLabel[health.health]}
          </span>
          <p className="text-sm text-zinc-600">
            {health.top ? (
              <>
                {health.top.title}.{" "}
                <Link
                  href="/dashboard/intelligence"
                  className="underline hover:text-zinc-900"
                >
                  Why
                </Link>
              </>
            ) : (
              "Nothing stands out."
            )}
          </p>
        </div>

        {/*
          The way in.

          Projects have always divided work up and routed it to whoever can do
          it. Until now the manager reached that by finding "Projects" in a
          menu and filling in four labelled fields. The capability was never the
          missing part; the sentence was.
        */}
        <div className="mt-8">
          <StartWork
            canStart={hires.some(
              (hire) => hire.onboarding_status === "completed",
            )}
          />
        </div>

        {/*
          What to do, before anything to look at.

          This section used to be tenth. Everything above it — counts,
          organisation, standards, methods — is worth reading occasionally and
          nothing on it is the reason somebody opened this page. A manager opens
          a dashboard to find out what is waiting on them, and if the answer is
          nine scrolls down, the answer may as well not be there.
        */}
        <section className="mt-8 rounded-lg border border-zinc-900 px-5 py-4">
          <h2 className="text-sm font-medium text-zinc-900">Today</h2>
          {todo.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              Nothing waiting on you. Your employees are either working or ready
              for something new.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {todo.map((item) => (
                <li
                  key={item.href}
                  className="flex items-start justify-between gap-4"
                >
                  <p className="text-sm text-zinc-700">{item.text}</p>
                  <Link
                    href={item.href}
                    className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    {item.cta}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {recent.length > 0 && (
          <section className="mt-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-medium text-zinc-900">Recent work</h2>
              <div className="flex gap-4 text-xs">
                <Link
                  href="/dashboard/deliverables"
                  className="text-zinc-500 underline hover:text-zinc-900"
                >
                  All results
                </Link>
                <Link
                  href="/dashboard/assignments"
                  className="text-zinc-500 underline hover:text-zinc-900"
                >
                  All work
                </Link>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {recent.map((item) => (
                <li key={item.id} className="px-5 py-3">
                  <Link
                    href={`/dashboard/deliverables/${item.id}`}
                    className="text-sm font-medium text-zinc-900 hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {item.company_employees?.employees?.name ?? "Someone"} ·{" "}
                    {deliverableStatusLabel[
                      item.status as keyof typeof deliverableStatusLabel
                    ] ?? item.status}{" "}
                    · {formatAssignedDate(item.submitted_at)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-medium text-zinc-900">Workforce Overview</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {overview.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-zinc-200 px-4 py-3"
              >
                <dt className="text-xs text-zinc-500">{item.label}</dt>
                <dd className="mt-1 text-xl font-semibold text-zinc-900">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Above everything else the manager could look at: this is what the
            company is currently working through, and the rest is detail
            underneath it. */}
        {operationDetail && (
          <section className="mt-8 rounded-lg border border-zinc-900 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-zinc-500">Current operation</p>
                <p className="mt-1 font-medium text-zinc-900">
                  {operationDetail.cycle.name}
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  {operationDetail.projects.length}{" "}
                  {operationDetail.projects.length === 1 ? "project" : "projects"}
                  {operationDetail.review?.recommendations[0] && (
                    <>
                      {" · next: "}
                      {operationDetail.review.recommendations[0].title}
                    </>
                  )}
                </p>
              </div>
              <Link
                href={`/dashboard/operations/${operationDetail.cycle.id}`}
                className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {operationDetail.review ? "Review" : "Open"}
              </Link>
            </div>
          </section>
        )}

        {projectsNeedingReview.length > 0 && (
          <section className="mt-8 rounded-lg border border-zinc-900 px-5 py-4">
            <p className="text-sm font-medium text-zinc-900">
              {projectsNeedingReview.length}{" "}
              {projectsNeedingReview.length === 1 ? "project" : "projects"} waiting
              for your review
            </p>
            <ul className="mt-3 space-y-3">
              {projectsNeedingReview.map((project) => (
                <li key={project.id} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{project.title}</p>
                    <p className="mt-0.5 text-sm text-zinc-600">{project.goal}</p>
                  </div>
                  <Link
                    href={`/dashboard/projects/${project.id}`}
                    className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Not something to act on — the manager reviews one deliverable at the
            end. Shown so a colleague marked busy is explained rather than
            looking stuck. */}
        {organization.length > 0 && (
          <section className="mt-8 rounded-lg border border-zinc-200 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-zinc-900">Organization</p>
              <Link
                href="/dashboard/organization"
                className="text-xs text-zinc-600 underline"
              >
                View
              </Link>
            </div>
            <ul className="mt-2 space-y-1">
              {organization.map((department) => (
                <li key={department.id} className="text-sm text-zinc-600">
                  {department.name} &middot; {department.employeeCount}{" "}
                  {department.employeeCount === 1 ? "employee" : "employees"}
                  {department.waitingCount > 0 &&
                    ` · ${department.waitingCount} waiting`}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Sits beside the organization: how the company is arranged and how it
            works are the two things that outlive any single assignment. */}
        {/* Above everything the manager could set up, because this is the only
            card that says whether any of it is working. */}
        <section className="mt-8 rounded-lg border border-zinc-200 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-zinc-900">
                How the company is running
              </p>
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-medium ${healthClass[health.health]}`}
              >
                {healthLabel[health.health]}
              </span>
            </div>
            <Link
              href="/dashboard/intelligence"
              className="text-xs text-zinc-600 underline"
            >
              {health.open > 0 ? "Review" : "View"}
            </Link>
          </div>
          {/* Built as a list and joined, so a missing piece leaves no orphan
              separator behind it. */}
          <p className="mt-2 text-sm text-zinc-600">
            {[
              health.insights === 0
                ? "Nothing stands out."
                : health.insights > 1
                  ? `${health.insights - 1} other ${health.insights === 2 ? "thing" : "things"} worth knowing`
                  : null,
              health.open > 0
                ? `${health.open} ${health.open === 1 ? "suggestion" : "suggestions"} waiting on you`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {planning.overCapacity === 0
              ? `Nobody short-handed · ${planning.free} free`
              : `${planning.overCapacity} ${planning.overCapacity === 1 ? "department has" : "departments have"} nobody free`}
            {planning.openPlans > 0 && (
              <>
                {" · "}
                <Link href="/dashboard/planning" className="underline">
                  {planning.openPlans} {planning.openPlans === 1 ? "plan" : "plans"} to
                  choose from
                </Link>
              </>
            )}
          </p>
          {evolution.openGaps > 0 && (
            <p className="mt-1 text-sm text-zinc-600">
              <Link href="/dashboard/evolution" className="underline">
                {evolution.openGaps} {evolution.openGaps === 1 ? "gap" : "gaps"} between
                the work you need and the people you have
              </Link>
              {evolution.recommendedHires > 0 &&
                ` · ${evolution.recommendedHires} ${evolution.recommendedHires === 1 ? "role" : "roles"} suggested`}
            </p>
          )}
        </section>

        {/* Above the methods and the standards, because this is the only one of
            the three that asks the manager for a decision. */}
        {(learning.pending > 0 || learning.adopted > 0) && (
          <section className="mt-8 rounded-lg border border-zinc-200 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-zinc-900">
                Company Brain
              </p>
              <Link href="/dashboard/learning" className="text-xs text-zinc-600 underline">
                {learning.pending > 0 ? "Review" : "View"}
              </Link>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              {learning.pending > 0
                ? `${learning.pending} ${learning.pending === 1 ? "proposal" : "proposals"} waiting on you`
                : "Nothing waiting"}
              {learning.adopted > 0 && ` · ${learning.adopted} adopted`}
              {learning.playbookDrafts > 0 &&
                ` · ${learning.playbookDrafts} method ${learning.playbookDrafts === 1 ? "change" : "changes"} proposed`}
            </p>
          </section>
        )}

        <section className="mt-8 rounded-lg border border-zinc-200 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-zinc-900">Playbooks</p>
            <Link href="/dashboard/playbooks" className="text-xs text-zinc-600 underline">
              {playbooks.activeCount === 0 ? "Write one" : "View"}
            </Link>
          </div>
          {playbooks.activeCount === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              None in use. The same job done twice can come back two different
              ways until you write down how this company does it.
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">
              {playbooks.activeCount} in use
              {playbooks.mostUsed && ` · most used: ${playbooks.mostUsed}`}
            </p>
          )}
        </section>

        <section className="mt-8 rounded-lg border border-zinc-200 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-zinc-900">Company Standards</p>
            <Link href="/dashboard/policies" className="text-xs text-zinc-600 underline">
              {standards.policyCount === 0 ? "Set them" : "View"}
            </Link>
          </div>
          {standards.policyCount === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              None set. Your employees work to their own judgement until you say
              how this company does things.
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">
              {standards.policyCount}{" "}
              {standards.policyCount === 1 ? "policy" : "policies"} &middot;{" "}
              {standards.ruleCount} {standards.ruleCount === 1 ? "rule" : "rules"}
              {standards.latestUpdate && ` · changed ${formatStandardsDay(standards.latestUpdate)}`}
            </p>
          )}
        </section>

        {collaborating.length > 0 && (
          <section className="mt-8 rounded-lg border border-zinc-200 px-5 py-4">
            <p className="text-sm font-medium text-zinc-900">
              Employees collaborating
            </p>
            <ul className="mt-2 space-y-1">
              {collaborating.map((row) => (
                <li key={row.id} className="text-sm text-zinc-600">
                  {row.requesterName} &harr; {row.assigneeName} &middot; {row.title}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Placed above everything else the manager could do: this is work the
            employees found on their own, and it is only useful if it's read. */}
        {initiatives.length > 0 && (
          <section className="mt-8 rounded-lg border border-zinc-900 px-5 py-4">
            <p className="text-sm font-medium text-zinc-900">
              {initiatives.length}{" "}
              {initiatives.length === 1 ? "recommendation" : "recommendations"} for
              you
            </p>
            <ul className="mt-3 space-y-3">
              {initiatives.map((initiative) => (
                <li key={initiative.id} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {initiative.title}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600">
                      {initiative.company_employees?.employees?.name} &middot;{" "}
                      {initiative.recommendation}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/initiatives/${initiative.id}`}
                    className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {waiting.length > 0 && (
          <section className="mt-8 rounded-lg bg-amber-50 px-5 py-4">
            <p className="text-sm font-medium text-amber-900">
              Scheduled work is waiting
            </p>
            <ul className="mt-2 space-y-1">
              {waiting.map((occurrence) => {
                const schedule = recurringById.get(occurrence.recurring_assignment_id);
                const name = schedule?.company_employees?.employees?.name ?? "An employee";
                return (
                  <li key={occurrence.id} className="text-sm text-amber-800">
                    {name}&apos;s {schedule?.title ?? "recurring work"} is waiting for
                    the current work to be reviewed.
                  </li>
                );
              })}
            </ul>
            {pending.length > 0 && (
              <Link
                href={`/dashboard/deliverables/${pending[0].id}`}
                className="mt-3 inline-block rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Review Deliverable
              </Link>
            )}
          </section>
        )}

        {pausedByFailure.length > 0 && (
          <section className="mt-8 rounded-lg bg-amber-50 px-5 py-4">
            <p className="text-sm font-medium text-amber-900">
              Recurring work needs attention
            </p>
            <ul className="mt-2 space-y-2">
              {pausedByFailure.map((row) => (
                <li key={row.id} className="text-sm text-amber-800">
                  {row.title} was paused. {row.pause_reason}{" "}
                  <Link
                    href={`/dashboard/recurring-assignments/${row.id}`}
                    className="font-medium underline"
                  >
                    Review Schedule
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-zinc-900">Upcoming Work</h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {upcoming.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {formatInZone(new Date(row.next_run_at!), row.timezone)}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600">
                      {row.company_employees?.employees?.name} &middot; {row.title}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/recurring-assignments/${row.id}`}
                    className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pending.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-zinc-900">Pending Review</h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {pending.map((deliverable) => (
                <li
                  key={deliverable.id}
                  className="flex items-center justify-between px-5 py-4"
                >
                  <div>
                    <p className="font-medium text-zinc-900">
                      {deliverable.title}
                      {deliverable.version > 1 && (
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          Version {deliverable.version}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      Submitted by {deliverable.company_employees?.employees?.name}
                      {" · "}
                      {labelForDeliverableType(deliverable.deliverable_type)}
                    </p>
                    {/* A lead list's headline number is how many companies
                        survived verification, not how long the document is. */}
                    {verifiedLeadCount(deliverable) !== null && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {verifiedLeadCount(deliverable)} verified{" "}
                        {verifiedLeadCount(deliverable) === 1 ? "company" : "companies"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-400">
                      Assignment: {deliverable.assignments?.title}
                    </p>
                    {deliverable.version > 1 && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Changes:{" "}
                        {(
                          (deliverable.revision_summary_json ?? []) as {
                            change: string;
                          }[]
                        )
                          .slice(0, 2)
                          .map((item) => item.change)
                          .join(" · ") || "Revised after your feedback"}
                      </p>
                    )}
                    {deliverable.submitted_at && (
                      <p className="text-xs text-zinc-400">
                        Submitted {formatAssignedDate(deliverable.submitted_at)}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/dashboard/deliverables/${deliverable.id}`}
                    className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {deliverable.version > 1
                      ? "Review Revision"
                      : deliverable.deliverable_type === "lead_list"
                        ? "Review Lead List"
                        : "Review"}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h2 className="mt-8 text-sm font-medium text-zinc-900">Your Workforce</h2>

        {hires.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            You haven&apos;t hired any employees yet.{" "}
            <Link href="/employees" className="underline">
              Browse Employees
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {cards.map(({ hire, assignment, deliverable, helping, state }) => {
              const employee = hire.employees;
              const isOnboarded = hire.onboarding_status === "completed";

              // The employee's internal state stays "working" during a
              // revision; the assignment is what tells us it's a revision.
              const isRevising =
                assignment !== undefined &&
                ["needs_changes", "revision_queued", "revising"].includes(
                  assignment.status,
                );

              const statusLabel = isRevising
                ? "Revising deliverable"
                : state === "working" && assignment?.current_progress_step
                  ? attentionLabel[state]
                  : attentionLabel[state];

              const badgeClass = attentionBadgeClass[state];

              let cta = "Assign Work";
              let href = `/dashboard/employees/${hire.id}/assign`;

              if (!isOnboarded) {
                // 교육은 대화로 한다. 서식으로 보내면 매니저 입장에서 일을
                // 맡기려다 숙제를 받은 것이고, 폰에서는 특히 거기서 멈춘다.
                // 회사 모드 대화가 교육이 안 끝난 직원을 먼저 붙잡아 한 번에
                // 하나씩 묻는다.
                cta = "대화로 교육하기";
                href = "/ask";
              } else if (deliverable) {
                cta = "Review Deliverable";
                href = `/dashboard/deliverables/${deliverable.id}`;
              } else if (assignment) {
                cta =
                  hire.work_status === "blocked"
                    ? "Review Issue"
                    : isRevising || hire.work_status === "working"
                      ? "View Progress"
                      : "View Assignment";
                href = `/dashboard/assignments/${assignment.id}`;
              }

              return (
                <li key={hire.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <Link
                      href={`/dashboard/employees/${hire.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {employee.name}
                    </Link>
                    <p className="text-sm text-zinc-500">{employee.role}</p>

                    <span
                      className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass}`}
                    >
                      {statusLabel}
                    </span>

                    {isOnboarded && (
                      <p className="mt-2 text-xs text-zinc-500">
                        {/* An internal errand is described by who it's for,
                            never by its title — that title is between the two
                            employees. */}
                        {helping ? (
                          <>
                            {helping.assignment_type === "project"
                              ? "Working on a project"
                              : "Helping a colleague"}
                          </>
                        ) : (
                          <>
                            Current Assignment:{" "}
                            <span className="text-zinc-700">
                              {assignment ? assignment.title : "No assignment"}
                            </span>
                          </>
                        )}
                      </p>
                    )}

                    {deliverable && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {labelForDeliverableType(deliverable.deliverable_type)}:{" "}
                        <span className="text-zinc-700">{deliverable.title}</span>
                      </p>
                    )}

                    {!deliverable && assignment?.started_at && (
                      <p className="mt-0.5 text-xs text-zinc-400">
                        Started {formatAssignedDate(assignment.started_at)}
                      </p>
                    )}
                  </div>

                  <Link
                    href={href}
                    className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {cta}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

/** "Today" reads as current in a way a date never does, which is the point of
 *  putting it on a card the manager glances at. */
function formatStandardsDay(iso: string): string {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) return "today";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
