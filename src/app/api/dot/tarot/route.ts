import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { stageFor } from "@/lib/dot/bond";
import { drawCards, formatReading, parseReading, pullTarot, tarotHead, TAROT_MARK, type TarotChar } from "@/lib/dot/tarot";

/**
 * # 타로 — 관계를 카드 세 장으로  (11-09 사장님 기획)
 *
 * `GET`  누구를 뽑을 수 있나 · 이미 뽑은 것은 무엇인가
 * `POST` `{ characterId }` → 한 판 뽑아 **대화에 한 줄로 남긴다**
 *
 * ## 문은 **친밀도 단계**다
 *
 * 사장님이 고르신 자리다. 아무 때나 뽑으면 ① 뽑을 때마다 모델 값이 들고 ② 매번 다른 말이
 * 나와 "읽었다"가 아니라 "지어냈다"가 된다. 단계는 1→5 로 네 번뿐이고 그 네 번이
 * **관계가 실제로 바뀐 자리**다.
 *
 * 이미 뽑았는지는 **표가 아니라 대화에서** 센다 — `dot_tarot` 표를 만들 DDL 열쇠가 없다.
 * 캐릭터가 한 말 중 첫 줄이 `🔮 타로 · N단계` 인 것이 있으면 그 단계는 뽑은 것이다.
 */

/** 그 사람이 이 캐릭터와 이미 뽑은 단계들. */
async function 뽑은단계(db: ReturnType<typeof createServiceClient>, userId: string, characterId: string): Promise<number[]> {
  const { data } = await db.from("dot_messages")
    .select("content").eq("user_id", userId).eq("character_id", characterId).eq("role", "character")
    .like("content", `${TAROT_MARK}%`).order("id", { ascending: false }).limit(20);
  return ((data ?? []) as { content: string }[]).map((m) => parseReading(m.content)?.단계 ?? 0).filter(Boolean);
}

export async function GET(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const db = createServiceClient();

  const [{ data: chars }, { data: bonds }, { data: msgs }] = await Promise.all([
    db.from("dot_characters").select("id, slug, name").eq("is_public", true).order("slug"),
    db.from("dot_bonds").select("character_id, points").eq("user_id", userId),
    db.from("dot_messages").select("character_id, content, created_at").eq("user_id", userId)
      .eq("role", "character").like("content", `${TAROT_MARK}%`).order("id", { ascending: false }).limit(60),
  ]);

  const 점수 = new Map(((bonds ?? []) as any[]).map((b) => [b.character_id as string, Number(b.points ?? 0)]));
  const 적힌것 = new Map<string, { content: string; created_at: string }[]>();
  for (const m of (msgs ?? []) as any[]) {
    const 모음 = 적힌것.get(m.character_id) ?? [];
    모음.push(m);
    적힌것.set(m.character_id, 모음);
  }

  const 줄 = ((chars ?? []) as any[]).map((c) => {
    const p = 점수.get(c.id) ?? 0, 단계 = stageFor(p);
    const 내것 = 적힌것.get(c.id) ?? [];
    const 읽은것 = 내것.map((m) => ({ ...parseReading(m.content)!, 때: m.created_at })).filter((x) => x.단계);
    const 뽑은단계들 = 읽은것.map((x) => x.단계);
    return {
      characterId: c.id, slug: c.slug, name: c.name,
      점수: p, 단계,
      /** 말을 한 번도 안 섞었으면 카드가 없다 — 읽을 대화가 없으니 지어낼 수밖에 없다. */
      뽑을수있나: p > 0 && !뽑은단계들.includes(단계),
      지난것: 읽은것.sort((a, b) => b.단계 - a.단계),
      패: p > 0 ? drawCards(userId, c.id, 단계) : null,
    };
  });
  return Response.json({ ok: true, 사람들: 줄 });
}

export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { characterId } = (await request.json().catch(() => ({}))) as { characterId?: string };
  if (!characterId) return Response.json({ error: "누구인지 알려 주세요." }, { status: 400 });

  const db = createServiceClient();
  const { data: c } = await db.from("dot_characters")
    .select("id, slug, name, persona, speech, formal_start, voice_ladder").eq("id", characterId).maybeSingle();
  if (!c) return Response.json({ error: "그런 캐릭터가 없어요." }, { status: 404 });

  const { data: bond } = await db.from("dot_bonds").select("points").eq("user_id", userId).eq("character_id", characterId).maybeSingle();
  const 단계 = stageFor(Number(bond?.points ?? 0));
  if (!bond) return Response.json({ error: "먼저 이야기를 나눠야 카드를 볼 수 있어요." }, { status: 409 });
  if ((await 뽑은단계(db, userId, characterId)).includes(단계)) {
    return Response.json({ error: "이번 단계의 카드는 이미 봤어요. 더 친해지면 다음 장이 와요." }, { status: 429 });
  }

  const r = await pullTarot(db, userId, c as TarotChar);
  if (!r.ok) return Response.json({ error: "지금은 카드가 잘 안 읽혀요. 조금 뒤에 다시요.", why: r.why }, { status: 503 });

  /* 대화에 남긴다 — 이게 저장이다. 두 번 눌려도 위 검사가 막고, 빠져나가도 같은 단계 두 줄일 뿐이다. */
  const content = formatReading(r.reading, 단계);
  const { error } = await db.from("dot_messages").insert({ user_id: userId, character_id: characterId, role: "character", content, emotion: "shy" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, 단계, 머리: tarotHead(단계), reading: r.reading, 적은것: content });
}
