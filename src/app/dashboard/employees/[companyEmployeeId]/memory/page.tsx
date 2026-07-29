import { notFound } from "next/navigation";
import Link from "next/link";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { listMemories, type MemoryView } from "@/lib/memory/service";
import { isFailure } from "@/lib/assignments/service";
import { formatAssignedDate } from "@/lib/assignments/labels";
import { NavBar } from "@/components/NavBar";
import { MEMORY_CATEGORIES, memoryCategoryLabel } from "@/lib/memory/types";
import { MemoryActions } from "./MemoryActions";

export default async function EmployeeMemoryPage({
  params,
}: {
  params: Promise<{ companyEmployeeId: string }>;
}) {
  const { companyEmployeeId } = await params;
  const owned = await getOwnedCompanyEmployee(companyEmployeeId);

  if (!owned) {
    notFound();
  }

  const { companyEmployee, employee } = owned;

  const result = await listMemories(companyEmployeeId);
  if (isFailure(result)) {
    notFound();
  }

  const { memories } = result;

  const pending = memories.filter((memory) => memory.status === "pending_review");
  const active = memories.filter((memory) => memory.status === "active");
  const archived = memories.filter((memory) => memory.status === "archived");

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              What {employee.name} Has Learned
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{employee.role}</p>
          </div>
          <Link
            href={`/dashboard/employees/${companyEmployee.id}`}
            className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Back to {employee.name}
          </Link>
        </div>

        <p className="mt-4 text-sm text-zinc-600">
          These are the things {employee.name} picked up from work you approved. They
          are kept separate from the company knowledge you gave during onboarding, and
          you decide what stays.
        </p>

        {memories.length === 0 && (
          <div className="mt-8 rounded-lg border border-zinc-200 px-5 py-8 text-center">
            <p className="text-sm text-zinc-600">
              {`${employee.name} hasn't learned anything yet.`}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Approve a piece of work and {employee.name} will start building this up.
            </p>
          </div>
        )}

        {pending.length > 0 && (
          <MemorySection
            title={`${employee.name} wants to confirm`}
            description="These need your say-so before they get used in future work."
            memories={pending}
            employeeName={employee.name}
          />
        )}

        {active.length > 0 && (
          <MemorySection
            title="Being used in future work"
            memories={active}
            employeeName={employee.name}
            groupByCategory
          />
        )}

        {archived.length > 0 && (
          <MemorySection
            title="No longer used"
            memories={archived}
            employeeName={employee.name}
          />
        )}
      </main>
    </div>
  );
}

function MemorySection({
  title,
  description,
  memories,
  employeeName,
  groupByCategory = false,
}: {
  title: string;
  description?: string;
  memories: MemoryView[];
  employeeName: string;
  groupByCategory?: boolean;
}) {
  if (!groupByCategory) {
    return (
      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-900">{title}</h2>
        {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
        <ul className="mt-3 space-y-3">
          {memories.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} employeeName={employeeName} />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-zinc-900">{title}</h2>
      {MEMORY_CATEGORIES.map((category) => {
        const group = memories.filter((memory) => memory.category === category);
        if (group.length === 0) return null;

        return (
          <div key={category} className="mt-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              {memoryCategoryLabel[category]}
            </h3>
            <ul className="mt-2 space-y-3">
              {group.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  employeeName={employeeName}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function MemoryCard({
  memory,
  employeeName,
}: {
  memory: MemoryView;
  employeeName: string;
}) {
  return (
    <li className="rounded-lg border border-zinc-200 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-900">{memory.title}</p>
        <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600">
          {memory.categoryLabel}
        </span>
      </div>

      <p className="mt-1 text-sm text-zinc-700">{memory.content}</p>

      {/* Why the manager might disagree with it, said plainly rather than as a
          confidence score. */}
      {memory.conflictReason && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {memory.conflictReason}
        </p>
      )}

      {memory.expired && memory.status === "active" && (
        <p className="mt-2 text-xs text-zinc-500">
          Learned a while ago — {employeeName} treats this as out of date until you
          confirm it.
        </p>
      )}

      <p className="mt-2 text-xs text-zinc-400">
        Learned {formatAssignedDate(memory.firstLearnedAt)}
        {memory.usageCount > 0 &&
          ` · used in ${memory.usageCount} ${memory.usageCount === 1 ? "assignment" : "assignments"}`}
      </p>

      {memory.status !== "rejected" && (
        <MemoryActions
          memoryId={memory.id}
          status={memory.status as "active" | "pending_review" | "archived"}
          employeeName={employeeName}
        />
      )}
    </li>
  );
}
