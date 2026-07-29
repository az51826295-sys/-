import { NextResponse } from "next/server";
import { applyPlaybookDraft, dismissPlaybookDraft } from "@/lib/knowledge/service";

/** Applying adds the step to the method as an unpublished change. The manager
 *  still has to publish — learning gets no shortcut around that gate. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const result = await applyPlaybookDraft(draftId);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const result = await dismissPlaybookDraft(draftId);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
