import { NextResponse } from "next/server";
import { isFailure } from "@/lib/assignments/service";
import { listMemories } from "@/lib/memory/service";
import type { MemoryStatus } from "@/lib/memory/types";

const VISIBLE_STATUSES: MemoryStatus[] = ["active", "pending_review", "archived"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const requested = new URL(request.url).searchParams.getAll("status");
  const statuses = requested.filter((status): status is MemoryStatus =>
    (VISIBLE_STATUSES as string[]).includes(status),
  );

  const result = await listMemories(
    id,
    statuses.length > 0 ? statuses : VISIBLE_STATUSES,
  );

  if (isFailure(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
