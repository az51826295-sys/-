/**
 * **대화방 나가기 전용 문** (227회차 09-29).
 *
 * 처음엔 나가기를 `/api/dot/follow` 의 "팔로우 끄기" 로 했다. 그런데 그러면 **두 가지 다른 일**이
 * 한 줄에 얹힌다 — "피드에서 안 볼래"(언팔로우)와 "이 방 그만 볼래"(나가기). 실제로 사고가 났다:
 * 채팅 목록을 팔로우 기준으로 바꾸자 **팔로우한 적 없이 쓰던 사람 6명의 방 7개가 사라졌다.**
 *
 * 그래서 갈랐다. 나가기는 여기서만 일어나고, `dot_bonds.left_at` 에 **사람이 누른 시각**을 찍는다.
 * 목록은 그 표시가 있는 방만 내린다. 대화도 친밀도도 그대로 남는다 — 다시 추가하면 이어진다.
 */
import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { characterId?: string };
  const characterId = body.characterId ?? "";
  if (!characterId) return Response.json({ error: "characterId 가 필요해요." }, { status: 400 });

  const db = createServiceClient();
  // 피드에서도 안 보이게 팔로우를 끄고, 방에는 **나갔다는 표시**를 남긴다.
  const { error: fe } = await db.from("dot_follows").delete().eq("user_id", userId).eq("character_id", characterId);
  if (fe) return Response.json({ error: fe.message }, { status: 500 });

  // 말을 걸어 본 적이 없으면 사이 줄 자체가 없다 — 그때는 팔로우만 끄면 끝이고, 없는 줄을 만들지 않는다.
  const { error: be } = await db.from("dot_bonds")
    .update({ left_at: new Date().toISOString() })
    .eq("user_id", userId).eq("character_id", characterId);
  if (be) return Response.json({ error: be.message }, { status: 500 });

  return Response.json({ ok: true });
}
