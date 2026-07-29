import { NextResponse } from "next/server";
import { choosePlanOption } from "@/lib/planning/service";

/** Records which way the manager decided. Carries nothing out. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const optionId = String(body?.optionId ?? "");

  if (!optionId) {
    return NextResponse.json({ error: "Choose an option." }, { status: 400 });
  }

  const result = await choosePlanOption(id, optionId);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
