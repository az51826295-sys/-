import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteConversation, loadConversation } from "@/lib/chat/conversations";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const found = await loadConversation(supabase, user.id, id);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(found);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const ok = await deleteConversation(supabase, user.id, id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
