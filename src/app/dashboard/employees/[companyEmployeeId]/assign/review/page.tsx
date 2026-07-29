import { notFound, redirect } from "next/navigation";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { getActiveAssignment } from "@/lib/assignments/service";
import { NavBar } from "@/components/NavBar";
import { AssignmentReview } from "./AssignmentReview";

export default async function AssignReviewPage({
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

  const active = await getActiveAssignment(owned);
  if (active) {
    redirect(`/dashboard/assignments/${active.id}`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">Review Assignment</h1>

        <AssignmentReview
          companyEmployeeId={companyEmployee.id}
          employeeName={employee.name}
          employeeRole={employee.role}
        />
      </main>
    </div>
  );
}
