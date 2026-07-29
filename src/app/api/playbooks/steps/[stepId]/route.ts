import { NextResponse } from "next/server";
import { deleteStep } from "@/lib/playbooks/service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ stepId: string }> },
) {
  const { stepId } = await params;

  const result = await deleteStep(stepId);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
