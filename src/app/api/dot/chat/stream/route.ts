import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { streamDotTurn } from "@/lib/dot/turn";
import { isUserSticker } from "@/lib/dot/stickers";

/**
 * 도트 채팅 한 턴 — **글자를 흘려보내는 판.**
 *
 * 한 줄에 JSON 하나, 줄바꿈으로 나눈다(로키 /api/chat 과 같은 모양). 받는 쪽은 반쪽짜리
 * 줄을 붙잡고 있다가 다음 조각이 와야 읽는다 — 중간에 끊겨도 이미 읽은 줄까지는 멀쩡하다.
 *
 *   {"type":"delta","text":"오늘"}      ← reply 의 글자가 나오는 대로
 *   {"type":"done", ...TurnResult}     ← 마지막에 한 번. 표정·친밀도·남은 횟수
 *   {"type":"error", ...}              ← 한도·실패
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  let body: { characterId?: unknown; message?: unknown; postId?: unknown; sticker?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return Response.json({ error: "요청을 읽지 못했어요." }, { status: 400 }); }
  const characterId = typeof body.characterId === "string" ? body.characterId : "";
  const message = typeof body.message === "string" ? body.message : "";
  if (!characterId || !message.trim()) return Response.json({ error: "characterId 와 message 가 필요해요." }, { status: 400 });
  if (message.length > 1000) return Response.json({ error: "메시지가 너무 길어요(1000자)." }, { status: 400 });

  // 피드 답장: 그 게시물의 한 줄을 모델에게 건넨다(사진은 못 보니 장면 글로).
  let postCaption: string | null = null;
  if (typeof body.postId === "number" && body.postId > 0) {
    const { data: p } = await createServiceClient().from("dot_posts").select("caption").eq("id", body.postId).eq("character_id", characterId).maybeSingle();
    postCaption = (p?.caption as string) ?? null;
  }

  const userSticker = isUserSticker(body.sticker) ? body.sticker : null;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* 창을 닫았다 */ } };
      try {
        const r = await streamDotTurn(createServiceClient(), userId, characterId, message, (text) => send({ type: "delta", text }), { postCaption, userSticker });
        if (r.ok) send({ type: "done", ...r });
        else if (r.reason === "limit") send({ type: "error", ...r });
        else { console.error("[dot] 턴 실패:", r.message); send({ type: "error", reason: "failed", message: "잠깐 문제가 생겼어요. 다시 말해 줄래요?" }); }
      } catch (e) {
        console.error("[dot] 흘려보내기 예외:", e instanceof Error ? e.message : e);
        send({ type: "error", reason: "failed", message: "잠깐 문제가 생겼어요." });
      } finally {
        try { controller.close(); } catch { /* 이미 닫힘 */ }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
