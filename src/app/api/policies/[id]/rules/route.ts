import { NextResponse } from "next/server";
import { addRule } from "@/lib/policies/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const result = await addRule(id, {
    title: body?.title !== undefined ? String(body.title) : undefined,
    instruction:
      body?.instruction !== undefined ? String(body.instruction) : undefined,
    priority: body?.priority !== undefined ? String(body.priority) : undefined,
    checkId: body?.checkId ? String(body.checkId) : null,
    checkConfig:
      body?.checkConfig && typeof body.checkConfig === "object"
        ? body.checkConfig
        : undefined,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, { status: 201 });
}
