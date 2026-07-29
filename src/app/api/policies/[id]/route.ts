import { NextResponse } from "next/server";
import { loadPolicyDetail, updatePolicy } from "@/lib/policies/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const detail = await loadPolicyDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Policy not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const result = await updatePolicy(id, {
    name: body?.name !== undefined ? String(body.name) : undefined,
    description:
      body?.description !== undefined ? String(body.description) : undefined,
    status: body?.status !== undefined ? String(body.status) : undefined,
    departmentIds: Array.isArray(body?.departmentIds)
      ? body.departmentIds.map(String)
      : undefined,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
