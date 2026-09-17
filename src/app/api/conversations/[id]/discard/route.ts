import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listVersions } from "@/lib/chat/versions";

export const dynamic = "force-dynamic";

/**
 * 이 판을 버린다 (136회차 09-16).
 *
 * 사장님이 쓰다가: *"승인버튼 수정버튼 밖에없고 삭제 버튼 없음."*
 * 맞는 지적이다 — 마음에 안 드는 판을 **치울 방법이 없었다.** 승인도 수정 요청도 아닌 것이 있다.
 * 그냥 아니었던 것.
 *
 * **지우지 않는다.** 결과물 행도 파일도 그대로 두고, 그 판을 가리키는 결과 턴에 `discarded` 표시만 남긴다.
 * 그러면 판 목록에서 빠지고 현재 판이 그 앞으로 돌아간다. 되돌릴 수 있다 —
 * 사람이 홧김에 누른 것과 진짜로 없애려는 것을 화면이 구별할 수 없으니, **되돌릴 수 있는 쪽**으로 만든다.
 * (진짜로 흔적까지 지워야 하면 그건 사람이 말해야 하는 일이다.)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const { data: owned } = await supabase
    .from("conversations").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!owned) return NextResponse.json({ error: "없는 대화예요." }, { status: 404 });

  let body: { deliverableId?: unknown; undo?: unknown } = {};
  try { body = await request.json(); } catch { /* 아래에서 거른다 */ }
  const deliverableId = typeof body.deliverableId === "string" ? body.deliverableId : null;
  const undo = body.undo === true;
  if (!deliverableId) return NextResponse.json({ error: "deliverableId 가 필요합니다." }, { status: 400 });

  // 버리기 전에 **이 대화의 판이 맞는지** 본다. 남의 판을 id 만으로 치우면 안 된다.
  const versions = await listVersions(supabase, id);
  if (!undo && !versions.some((v) => v.deliverableId === deliverableId)) {
    return NextResponse.json({ error: "이 대화의 판이 아닙니다." }, { status: 404 });
  }

  // 그 판을 가리키는 결과 턴 전부(되돌리기로 여러 번 붙었을 수 있다).
  const { data: msgs } = await supabase
    .from("conversation_messages")
    .select("id, attachments")
    .eq("conversation_id", id)
    .contains("attachments", { returned: { deliverableId } });
  const rows = (msgs ?? []) as { id: string; attachments: Record<string, unknown> }[];
  if (!rows.length) return NextResponse.json({ error: "그 판의 기록이 없어요." }, { status: 404 });

  for (const m of rows) {
    const att = { ...(m.attachments ?? {}) } as Record<string, unknown>;
    const ret = { ...((att.returned as Record<string, unknown>) ?? {}) };
    if (undo) delete ret.discarded; else ret.discarded = true;
    att.returned = ret;
    const { error } = await supabase.from("conversation_messages").update({ attachments: att }).eq("id", m.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
  const left = await listVersions(supabase, id);
  return NextResponse.json({ ok: true, discarded: !undo, left: left.length });
}
