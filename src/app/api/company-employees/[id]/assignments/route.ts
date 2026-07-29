import { NextResponse } from "next/server";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { createAssignment, isFailure } from "@/lib/assignments/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owned = await getOwnedCompanyEmployee(id);

  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);

  const result = await createAssignment(owned, {
    title: String(body?.title ?? ""),
    description: String(body?.description ?? ""),
    expectedOutcome: body?.expectedOutcome ? String(body.expectedOutcome) : undefined,
    priority: body?.priority ?? "normal",
    // Passed through unchecked on purpose — createAssignment validates it
    // against the employee's own schema, which is the only place that knows
    // what shape this role's input should have.
    roleInput: body?.roleInput,
  });

  if (isFailure(result)) {
    return NextResponse.json(
      { error: result.error, assignmentId: result.assignmentId },
      { status: result.status },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
