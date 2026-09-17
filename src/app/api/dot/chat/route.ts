import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { runDotTurn } from "@/lib/dot/turn";

/**
 * 도트 채팅 한 턴. 웹과 안드로이드 앱이 같이 쓴다.
 *
 * **서비스 열쇠로 쓴다.** 사용자 열쇠로 쓰면 사용자가 자기 친밀도를 직접 올릴 수
 * 있고, 그러면 친밀도라는 것이 없어진다. 대신 누구인지는 여기서 확실히 정하고
 * (`userIdFrom` 이 토큰을 검증한다), 그 아래 코드는 그 id 로만 손댄다.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  let body: { characterId?: unknown; message?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "요청을 읽지 못했어요." }, { status: 400 });
  }
  const characterId = typeof body.characterId === "string" ? body.characterId : "";
  const message = typeof body.message === "string" ? body.message : "";
  if (!characterId || !message.trim()) {
    return Response.json({ error: "characterId 와 message 가 필요해요." }, { status: 400 });
  }
  if (message.length > 1000) {
    return Response.json({ error: "메시지가 너무 길어요(1000자)." }, { status: 400 });
  }

  const result = await runDotTurn(createServiceClient(), userId, characterId, message);
  if (result.ok) return Response.json(result);
  if (result.reason === "limit") return Response.json(result, { status: 429 });
  if (result.reason === "no_character") return Response.json(result, { status: 404 });
  console.error("[dot] 턴 실패:", result.message);
  return Response.json({ ok: false, reason: "failed", message: "잠깐 문제가 생겼어요. 다시 말해 줄래요?" }, { status: 500 });
}
