import { NextResponse } from "next/server";
import { deleteRule, updateRule } from "@/lib/policies/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const { ruleId } = await params;
  const body = await request.json().catch(() => null);

  const result = await updateRule(ruleId, {
    title: body?.title !== undefined ? String(body.title) : undefined,
    instruction:
      body?.instruction !== undefined ? String(body.instruction) : undefined,
    priority: body?.priority !== undefined ? String(body.priority) : undefined,
    enabled: body?.enabled !== undefined ? Boolean(body.enabled) : undefined,
    // Null is meaningful here — it turns an automatic check back into something
    // only a person can judge — so it has to survive the undefined test.
    checkId:
      body?.checkId === undefined
        ? undefined
        : body.checkId === null
          ? null
          : String(body.checkId),
    checkConfig:
      body?.checkConfig && typeof body.checkConfig === "object"
        ? body.checkConfig
        : undefined,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const { ruleId } = await params;

  const result = await deleteRule(ruleId);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
