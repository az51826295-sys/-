import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * 유니티 창이 **재 본 결과**를 로키로 돌려준다.
 *
 * 로키 서버는 유니티를 못 돌린다. 그래서 자(합격 시험지)는 사장님 유니티 안에서
 * 돌고, 그 결과가 이 문으로 와서 **그 산출물이 돌아온 대화에 한 턴으로** 붙는다.
 * 09-05 저녁까지는 내가 배치 명령으로 손으로 돌렸다 — 이제 창 버튼 하나다.
 *
 * 결과는 판정이지 통과가 아니다: 떨어진 줄과 못 잰 줄을 그대로 적는다.
 */
type Case = { name: string; result: "Passed" | "Failed" | "Inconclusive" | "Skipped" | string; message?: string | null };
type Body = { deliverableId?: string; scene?: string; passed: number; failed: number; inconclusive: number; cases: Case[] };

export async function POST(request: Request) {
  const key = request.headers.get("x-rookery-key");
  if (!key) return NextResponse.json({ error: "x-rookery-key 헤더가 필요합니다." }, { status: 401 });
  const db = createServiceClient();
  const { data: company } = await db.from("companies").select("id, name").eq("unity_key", key).maybeSingle();
  if (!company) return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON 이 아닙니다." }, { status: 400 });
  }

  const mark = (r: string) => (r === "Passed" ? "✅" : r === "Failed" ? "❌" : "◻︎");
  const lines = (body.cases ?? [])
    .map((c) => `- ${mark(c.result)} ${c.name}` + (c.message ? ` — ${c.message.slice(0, 200)}` : ""))
    .join("\n");
  const text =
    `**유니티에서 재 봤습니다** — 통과 ${body.passed} · 떨어짐 ${body.failed} · 못 잼 ${body.inconclusive}` +
    (body.scene ? ` (씬 ${body.scene})` : "") +
    `\n\n${lines}\n\n` +
    (body.failed > 0
      ? "떨어진 줄이 게임의 결함입니다. 고쳐 달라고 말씀하시면 그 줄이 다음 판의 입력이 됩니다."
      : "기계가 잴 수 있는 것은 다 통과했습니다. 재미와 손맛은 사람이 봅니다.");

  // 어느 대화에 붙일까: 그 산출물이 돌아온 턴이 있는 대화. 없으면 기록만 남긴다.
  let conversationId: string | null = null;
  if (body.deliverableId) {
    const { data: msg } = await db
      .from("conversation_messages")
      .select("conversation_id")
      .contains("attachments", { returned: { deliverableId: body.deliverableId } })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    conversationId = (msg?.conversation_id as string | undefined) ?? null;

    const { data: d } = await db.from("deliverables").select("content_json").eq("id", body.deliverableId).eq("company_id", company.id).maybeSingle();
    if (d) {
      await db
        .from("deliverables")
        .update({ content_json: { ...(d.content_json as object), unityChecks: { ...body, at: new Date().toISOString() } } })
        .eq("id", body.deliverableId);
    }
  }
  if (conversationId) {
    await db.from("conversation_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: text,
      attachments: { unityChecks: { deliverableId: body.deliverableId } },
    });
  }
  return NextResponse.json({ ok: true, postedTo: conversationId });
}
