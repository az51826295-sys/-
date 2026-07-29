import { NextResponse } from "next/server";
import { loadCompanyView } from "@/lib/company/report";

export async function GET() {
  const view = await loadCompanyView();
  if (!view) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(view);
}
