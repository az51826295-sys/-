import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { decideMemory } from "@/lib/memory/service";

const ACTIONS = ["confirm", "reject", "archive"] as const;
type Action = (typeof ACTIONS)[number];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memoryId: string }> },
) {
  const { memoryId } = await params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!ACTIONS.includes(body.action as Action)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const result = await decideMemory(memoryId, body.action as Action);

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
