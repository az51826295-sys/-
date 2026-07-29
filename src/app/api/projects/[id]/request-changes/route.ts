import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { requestProjectChanges } from "@/lib/projects/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await requestProjectChanges(id, String(body.feedback ?? ""));

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
