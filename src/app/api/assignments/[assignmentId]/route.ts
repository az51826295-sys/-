import { NextResponse } from "next/server";
import { getOwnedAssignment } from "@/lib/assignments/access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await params;
  const owned = await getOwnedAssignment(assignmentId);

  if (!owned) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  const { supabase, assignment, companyEmployee, employee } = owned;

  const { data: progress } = await supabase
    .from("assignment_progress_events")
    .select("*")
    .eq("assignment_id", assignment.id)
    .order("sequence");

  return NextResponse.json({
    assignment,
    employee: {
      companyEmployeeId: companyEmployee.id,
      name: employee.name,
      role: employee.role,
      workStatus: companyEmployee.work_status,
    },
    companyId: assignment.company_id,
    progress: progress ?? [],
  });
}
