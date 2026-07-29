import { NextResponse } from "next/server";
import { loadPlanning } from "@/lib/planning/service";

export async function GET() {
  const planning = await loadPlanning();
  if (!planning) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(planning);
}
