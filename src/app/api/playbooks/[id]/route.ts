import { NextResponse } from "next/server";
import { loadPlaybookDetail, updatePlaybook } from "@/lib/playbooks/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const detail = await loadPlaybookDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Playbook not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const result = await updatePlaybook(id, {
    name: body?.name !== undefined ? String(body.name) : undefined,
    description:
      body?.description !== undefined ? String(body.description) : undefined,
    status: body?.status !== undefined ? String(body.status) : undefined,
    // Null is meaningful — it hands the method to the whole company rather than
    // to one department — so it has to survive the undefined test.
    departmentId:
      body?.departmentId === undefined
        ? undefined
        : body.departmentId === null
          ? null
          : String(body.departmentId),
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
