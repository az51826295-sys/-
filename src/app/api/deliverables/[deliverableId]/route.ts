import { NextResponse } from "next/server";
import { getOwnedDeliverable } from "@/lib/deliverables/access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deliverableId: string }> },
) {
  const { deliverableId } = await params;
  const owned = await getOwnedDeliverable(deliverableId);

  if (!owned) {
    return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });
  }

  const { deliverable, assignment, companyEmployee, employee, review } = owned;

  return NextResponse.json({
    deliverable,
    assignment,
    employee: {
      companyEmployeeId: companyEmployee.id,
      name: employee.name,
      role: employee.role,
      workStatus: companyEmployee.work_status,
    },
    companyId: deliverable.company_id,
    review,
  });
}
