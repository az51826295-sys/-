import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 로그아웃하고 대화창으로 돌아간다 — 로그인 화면이 아니라. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/ask", request.url), { status: 303 });
}
