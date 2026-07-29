import { notFound, redirect } from "next/navigation";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import { NavBar } from "@/components/NavBar";
import { RecurringReview } from "./RecurringReview";

export default async function RecurringReviewPage({
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

  if (companyEmployee.onboarding_status !== "completed") {
    redirect(`/dashboard/employees/${companyEmployeeId}`);
  }

  const company = await getCompanyContext();
  if (!company) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Review Recurring Assignment
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Nothing starts until the first scheduled time arrives.
        </p>

        <RecurringReview
          companyEmployeeId={companyEmployee.id}
          employeeName={employee.name}
          employeeRole={employee.role}
          timezone={company.timezone}
        />
      </main>
    </div>
  );
}
