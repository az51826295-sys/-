import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { GAMES, GAME_MARK, type GameKey } from "@/lib/dot/games";
import { playGameTurn } from "@/lib/dot/gameTurn";

/**
 * 놀이 한 수 — `{ characterId, game? , message? }`
 *
 * `game` 만 주면 새 판을 연다. `message` 만 주면 도는 판에 한 수 둔다.
 * 하트·친밀도·저장은 `playGameTurn` 안에서 **대화와 같은 길**로 처리된다.
 *
 * 규칙에 걸린 수는 409 로 돌려준다 — 하트는 안 쓰인다. 화면은 그 말을 그대로 보여 주면 된다.
 */
export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { characterId?: string; game?: string; message?: string; lang?: "ko" | "en" };
  if (!body.characterId) return Response.json({ error: "누구인지 알려 주세요." }, { status: 400 });
  if (body.game && !(GAMES as readonly string[]).includes(body.game)) {
    return Response.json({ error: "그런 놀이는 없어요." }, { status: 400 });
  }

  const db = createServiceClient();
  const r = await playGameTurn(db, userId, body.characterId, {
    game: body.game as GameKey | undefined, message: body.message, lang: body.lang,
  });

  if (!r.ok && r.reason === "규칙") return Response.json({ error: r.message, 규칙: true }, { status: 409 });
  if (!r.ok) {
    const 코드 = r.reason === "limit" ? 402 : r.reason === "no_character" ? 404 : 500;
    return Response.json({ error: (r as { message?: string }).message ?? "지금은 안 돼요", reason: r.reason }, { status: 코드 });
  }
  /**
   * 새 판이면 **서버가 적은 말머리 줄을 그대로** 돌려준다.
   *
   * 화면이 제 손으로 "🎮 끝말잇기" 를 지어 붙였더니 회차가 없어서 `parseGameHead` 가 못 읽었고,
   * 판이 도는데도 띠가 안 떴다. 말머리는 한 군데(서버)에서만 만든다.
   */
  let 머리: string | null = null;
  if (body.game) {
    const { data } = await db.from("dot_messages")
      .select("content").eq("user_id", userId).eq("character_id", body.characterId).eq("role", "character")
      .like("content", `${GAME_MARK}%`).order("id", { ascending: false }).limit(1);
    머리 = (data?.[0] as { content: string } | undefined)?.content ?? null;
  }
  return Response.json({ ok: true, 머리, reply: r.reply, emotion: r.emotion, bond: r.bond, remaining: r.remaining });
}
