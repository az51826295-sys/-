import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { conversationsIn } from "@/lib/chat/tasks";

/** 이 과제 안의 대화들. 과제를 열면 이것만 보인다. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ conversations: [] });
  return NextResponse.json({
    conversations: await conversationsIn(supabase, user.id, id),
  });
}
