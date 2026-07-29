import { NextResponse } from "next/server";
import { addStep, deleteStage } from "@/lib/playbooks/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ stageId: string }> },
) {
  const { stageId } = await params;
  const body = await request.json().catch(() => null);

  const result = await addStep(
    stageId,
    String(body?.instruction ?? ""),
    String(body?.expectedOutput ?? ""),
    body?.required === undefined ? true : Boolean(body.required),
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, { status: 201 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ stageId: string }> },
) {
  const { stageId } = await params;

  const result = await deleteStage(stageId);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
