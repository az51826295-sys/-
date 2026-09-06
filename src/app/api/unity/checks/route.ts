import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { scheduleAutoRetry } from "@/lib/execution/autoRetry";
import { storeDeliverableFile } from "@/lib/deliverables/files";

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
type Body = {
  deliverableId?: string;
  scene?: string;
  passed: number;
  failed: number;
  inconclusive: number;
  cases: Case[];
  /** 시험지가 찍은 화면(PNG, base64). 사장님은 게임을 유니티에서만 볼 수 있어서,
   *  대화에는 이 한 장이 게임의 얼굴이다(09-05 저녁, Rosebud 의 게임 창을 보고). */
  screenshot?: string;
  /** 정면 얼굴 사진(PNG, base64). 휴머노이드가 씬에 있을 때만 온다. */
  portrait?: string;
  /** 걷는 모습 넉 장을 가로로 붙인 것(옆에서). 휴머노이드가 움직였을 때만 온다. */
  walk?: string;
};

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
      ? "떨어진 줄이 게임의 결함입니다. Dev 가 그 줄을 스스로 고칩니다(세 번까지). 그래도 안 되면 말씀이 필요합니다."
      : "기계가 잴 수 있는 것은 다 통과했습니다. 재미와 손맛은 사람이 봅니다.");

  // 어느 대화에 붙일까: 그 산출물이 돌아온 턴이 있는 대화. 없으면 기록만 남긴다.
  let conversationId: string | null = null;
  let files: { path: string; href: string }[] | null = null;
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
      const { screenshot: _omit, portrait: _omit2, walk: _omit3, ...rest } = body;
      void _omit; void _omit2; void _omit3;
      await db
        .from("deliverables")
        .update({ content_json: { ...(d.content_json as object), unityChecks: { ...rest, at: new Date().toISOString() } } })
        .eq("id", body.deliverableId);
    }
    const shots: [string | undefined, string, string, string][] = [
      [body.screenshot, "unity-screenshot.png", "유니티 화면", "합격 시험이 도는 동안 찍은 게임 화면"],
      [body.portrait, "unity-portrait.png", "유니티 얼굴", "같은 카메라를 얼굴 앞으로 옮겨 찍은 정면 사진 — 씬의 캐릭터 전부, 플레이어부터 나란히"],
      [body.walk, "unity-walk.png", "유니티 걷기", "키를 누르는 동안 옆에서 넉 장 — 스키닝·발·팔을 사람이 본다"],
    ];
    for (const [b64, filename, title, description] of shots) {
      if (!d || !b64) continue;
      try {
        const r = await storeDeliverableFile(db, {
          companyId: company.id as string,
          deliverableId: body.deliverableId,
          filename,
          body: new Uint8Array(Buffer.from(b64, "base64")),
          kind: "image",
          mimeType: "image/png",
          title,
          description,
          producedByBackend: "unity",
        });
        if (r.ok) (files ??= []).push({ path: `${title}.png`, href: `/api/files/${r.file.id}` });
        else console.warn("[unity/checks] 사진 저장 실패:", filename, r.error);
      } catch (e) {
        console.warn("[unity/checks] 사진 처리 실패:", filename, e);
      }
    }
  }
  if (conversationId) {
    await db.from("conversation_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: text,
      attachments: { unityChecks: { deliverableId: body.deliverableId }, files },
    });
  }
  // 계획 3 "스스로 다시": 떨어진 줄이 있으면 사람이 말하기 전에 같은 직원이 고친다(최대 3번).
  let retry: unknown = null;
  if (conversationId && body.deliverableId && body.failed > 0) {
    const failedLines = (body.cases ?? [])
      .filter((c) => c.result === "Failed")
      .map((c) => `${c.name}${c.message ? ` — ${c.message.slice(0, 300)}` : ""}`);
    retry = await scheduleAutoRetry(db, body.deliverableId, failedLines, conversationId);
    console.log("[unity/checks] 스스로 다시:", JSON.stringify(retry));
  }
  return NextResponse.json({ ok: true, postedTo: conversationId, retry });
}
