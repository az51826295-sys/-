import { NextResponse } from "next/server";
import { addStage } from "@/lib/playbooks/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const result = await addStage(
    id,
    String(body?.title ?? ""),
    String(body?.intent ?? ""),
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, { status: 201 });
}
