import { makeT } from "@/lib/i18n/core";
import { localeFromRequest } from "@/lib/i18n/server";
import { DOT } from "@/lib/i18n/dict/dot";
import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";

/** 팔로우 켜고 끄기. 피드 기본 화면이 이걸로 걸러진다(83회차). */
export async function POST(request: Request) {
  const t = makeT(DOT, localeFromRequest(request));
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: t("로그인이 필요해요.") }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { characterId?: string; follow?: boolean };
  const characterId = body.characterId ?? "";
  if (!characterId) return Response.json({ error: t("characterId 가 필요해요.") }, { status: 400 });
  const db = createServiceClient();
  if (body.follow === false) {
    const { error } = await db.from("dot_follows").delete().eq("user_id", userId).eq("character_id", characterId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, following: false });
  }
  const { error } = await db.from("dot_follows").upsert({ user_id: userId, character_id: characterId }, { onConflict: "user_id,character_id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // 227회차 09-29: 나갔던 방을 **다시 추가하면 돌아온다.** 나간 표시를 지우지 않으면
  // 추가해도 방 목록에 안 뜨고, 사람은 추가가 안 된 줄 안다.
  await db.from("dot_bonds").update({ left_at: null }).eq("user_id", userId).eq("character_id", characterId);
  return Response.json({ ok: true, following: true });
}
