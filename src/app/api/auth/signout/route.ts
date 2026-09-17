import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/http/origin";

/** 로그아웃하고 대화창으로 돌아간다 — 로그인 화면이 아니라. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 두근도트 설정(95회차)은 next=/login 을 보낸다. 같은 사이트 경로만 받는다.
  const next = (await request.formData().catch(() => null))?.get("next");
  const to = typeof next === "string" && /^\/[a-z]/.test(next) ? next : "/ask";
  return NextResponse.redirect(new URL(to, publicOrigin(request)), { status: 303 });
}
