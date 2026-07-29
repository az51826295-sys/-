import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { createRecurringAssignment } from "@/lib/recurring/service";

export async function POST(
  request: Request,
  // Named to match the sibling routes under this path — Next.js requires one
  // parameter name per segment across the whole directory.
  { params }: { params: Promise<{ id: string }> },
) {
  const companyEmployeeId = (await params).id;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await createRecurringAssignment(companyEmployeeId, {
    title: String(body.title ?? ""),
    description: String(body.description ?? ""),
    expectedOutcome: body.expectedOutcome ? String(body.expectedOutcome) : undefined,
    priority: body.priority ?? "normal",
    // Both are validated in the service against the employee's own schemas,
    // which is the only place that knows what shape they should have.
    roleInput: body.roleInput,
    schedule: body.schedule,
    conflictPolicy: body.conflictPolicy,
  });

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, { status: 201 });
}
