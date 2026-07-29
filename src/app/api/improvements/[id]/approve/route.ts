import { NextResponse } from "next/server";
import { captureBefore } from "@/lib/company/improvements";

/** Takes the reading this change is meant to improve, now, so there is
 *  something honest to compare against later. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await captureBefore(id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
