import { NextResponse } from "next/server";
import { loadIntelligence } from "@/lib/intelligence/service";

/** Free to call, so it is refreshed on read rather than on a schedule. */
export async function GET() {
  const intelligence = await loadIntelligence();
  if (!intelligence) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(intelligence);
}
