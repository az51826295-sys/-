import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/chat/conversations";

/** 내 대화 목록. 로그인 안 했으면 빈 목록 — 오류가 아니다. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ conversations: [] });
  return NextResponse.json({
    conversations: await listConversations(supabase, user.id),
  });
}
