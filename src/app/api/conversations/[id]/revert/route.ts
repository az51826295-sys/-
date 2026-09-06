import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listVersions } from "@/lib/chat/versions";

export const dynamic = "force-dynamic";

/**
 * 지난 판으로 되돌린다.
 *
 * 새 표도, 지우기도 없다. 그 판을 가리키는 결과 턴을 하나 더 붙일 뿐이다(`revert: true`).
 * 그러면 현재 판이 그것이 되고, 다음 "고쳐 줘" 는 그 판 위에서 고치고, 유니티 창도 그 판을
 * 받는다. 되돌린 사실이 대화에 남으니 "언제 왜 돌아갔는지" 도 남는다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: owned } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body: { deliverableId?: unknown } = {};
  try { body = await request.json(); } catch { /* 아래에서 거른다 */ }
  const deliverableId = typeof body.deliverableId === "string" ? body.deliverableId : null;
  if (!deliverableId) return NextResponse.json({ error: "deliverableId 가 필요합니다." }, { status: 400 });

  const versions = await listVersions(supabase, id);
  const target = versions.find((v) => v.deliverableId === deliverableId);
  if (!target) return NextResponse.json({ error: "이 대화의 판이 아닙니다." }, { status: 404 });
  if (target.current) return NextResponse.json({ ok: true, already: true, n: target.n });

  // 그 판이 처음 돌아왔을 때의 파일 목록을 그대로 다시 붙인다 — 화면이 파일을 턴에서 읽는다.
  const { data: first } = await supabase
    .from("conversation_messages")
    .select("files:attachments->files")
    .eq("conversation_id", id)
    .contains("attachments", { returned: { deliverableId } })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: d } = await supabase.from("deliverables").select("title").eq("id", deliverableId).maybeSingle();

  const { error } = await supabase.from("conversation_messages").insert({
    conversation_id: id,
    role: "assistant",
    content: `**v${target.n} 으로 복원했어요 · ${d?.title ?? ""}**

다음 수정은 이 버전 위에서 해요. 유니티도 이 버전을 받아요.`,
    attachments: {
      returned: { assignmentId: target.assignmentId, deliverableId },
      revert: true,
      files: (first as { files?: unknown } | null)?.files ?? null,
    },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, n: target.n });
}
