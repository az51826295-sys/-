import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST, toMode, toNextStage } from "@/lib/dot/bond";
import { balanceFor } from "@/lib/dot/money";

/** 앱을 열었을 때 한 번. 지난 대화 + 지금 사이 + 오늘 남은 횟수. */
export async function GET(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  const characterId = new URL(request.url).searchParams.get("characterId") ?? "";
  if (!characterId) return Response.json({ error: "characterId 가 필요해요." }, { status: 400 });

  const db = createServiceClient();
  const day = todayKST();
  const [{ data: msgs }, { data: bond }, balance] = await Promise.all([
    db.from("dot_messages").select("role, content, emotion, sticker, created_at")
      .eq("user_id", userId).eq("character_id", characterId)
      .order("id", { ascending: false }).limit(60),
    db.from("dot_bonds").select("points, stage, streak_days, mode")
      .eq("user_id", userId).eq("character_id", characterId).maybeSingle(),
    balanceFor(db, userId, day),
  ]);

  const points = (bond?.points as number) ?? 0;
  return Response.json({
    messages: ((msgs ?? []) as unknown[]).reverse(),
    bond: { points, stage: (bond?.stage as number) ?? 1, streakDays: (bond?.streak_days as number) ?? 0, toNext: toNextStage(points), mode: toMode(bond?.mode) },
    remaining: balance.remaining,
    balance,
  });
}

/**
 * 대화방 나가기 — 카톡의 그 단추. **주고받은 말만** 지운다.
 *
 * 사이(친밀도·기억)는 남긴다. 사람 사이도 그렇다 — 대화 창을 지웠다고 상대가 나를
 * 잊지는 않는다. 그리고 지우고 다시 들어왔는데 캐릭터가 "처음 뵙겠습니다" 하면
 * 그동안 쌓은 것이 헛것이 된다.
 */
export async function DELETE(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const characterId = new URL(request.url).searchParams.get("characterId") ?? "";
  if (!characterId) return Response.json({ error: "characterId 가 필요해요." }, { status: 400 });
  const db = createServiceClient();
  const { error, count } = await db
    .from("dot_messages")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("character_id", characterId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, removed: count ?? 0 });
}
