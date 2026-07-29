import { NextResponse } from "next/server";
import { loadEvolution } from "@/lib/evolution/service";

export async function GET() {
  const evolution = await loadEvolution();
  if (!evolution) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(evolution);
}
