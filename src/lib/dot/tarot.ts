/**
 * # 타로 — 대화를 읽고 **우리 사이**를 카드 세 장으로
 *
 * 11-09 사장님: *"대화 내용을 분석해 관계 정리 해주는 거 만들고 싶어. 타로 카드."*
 * 고르신 것: **친밀도 단계가 오를 때만** · 방에서는 **그 캐릭터가** 읽어 준다 · 카드 그림은 나중.
 *
 * ## 왜 단계가 오를 때인가
 *
 * 아무 때나 뽑으면 두 가지가 깨진다. ① 뽑을 때마다 모델을 부르니 값이 턴처럼 든다.
 * ② 매번 다른 말이 나오면 "읽었다"가 아니라 "지어냈다"가 된다. 단계는 1→5 로 네 번뿐이고,
 * 그 네 번이 **관계가 실제로 바뀐 자리**다. 그 자리에서만 뽑으면 카드가 기념이 된다.
 *
 * ## 뽑기는 정해져 있다 (무작위지만 다시 뽑아도 같다)
 *
 * 사람·캐릭터·단계로 해시를 만들어 거기서 뽑는다. 같은 단계에서 다시 열면 **같은 카드**가 나온다 —
 * 새로고침으로 마음에 드는 패가 나올 때까지 돌리는 것을 막고, 자가 잴 수 있게 한다(순수 함수).
 *
 * ## 지어내기를 막는 것이 이 기능의 전부다
 *
 * 타로는 **틀려도 안 들키는 자리**라 모델이 "지난주에 힘들다고 했잖아" 같은 말을 쉽게 짓는다.
 * 그래서 읽기는 **근거 조각**(실제 대화에서 따온 짧은 말)을 같이 내게 하고, 그 조각이 정말
 * 그 방에 있던 말인지 `checkReading` 이 검사한다. 없으면 그 판은 버린다.
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultProviders } from "@/lib/execution/shared";
import { stageFor, toVoiceLadder } from "./bond";

/** 메이저 아르카나 22장. 이름은 한국에서 쓰는 말로. */
export const DECK = [
  "바보", "마법사", "여사제", "여황제", "황제", "교황", "연인", "전차", "힘", "은둔자", "운명의 수레바퀴",
  "정의", "매달린 사람", "죽음", "절제", "악마", "탑", "별", "달", "태양", "심판", "세계",
] as const;
export type Card = (typeof DECK)[number];

/** 세 자리 — 여기까지 온 길 · 지금 · 다음 한 걸음. */
export const SPOTS = ["여기까지", "지금", "다음"] as const;
export type Spot = (typeof SPOTS)[number];

export type Draw = { 자리: Spot; 카드: Card; 역방향: boolean };

/** 사람·캐릭터·단계로 정해지는 뽑기. 순수 함수 — 같은 자리에서 다시 열면 같은 패다. */
export function drawCards(userId: string, characterId: string, stage: number): Draw[] {
  let h = 2166136261;
  for (const ch of `${userId}|${characterId}|${stage}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const 다음 = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h; };
  const 남은 = [...DECK];
  return SPOTS.map((자리) => {
    const i = 다음() % 남은.length;
    const 카드 = 남은.splice(i, 1)[0];
    return { 자리, 카드, 역방향: 다음() % 100 < 35 };   // 셋에 하나쯤 역방향
  });
}

export const readingShape = z.object({
  카드말: z.array(z.object({ 자리: z.string(), 한줄: z.string() })),
  관계: z.string(),
  근거: z.array(z.string()),
});
export type Reading = z.infer<typeof readingShape> & { 뽑기: Draw[] };

export type TarotChar = {
  id: string; slug: string; name: string; persona: string; speech: string;
  formal_start: boolean; voice_ladder?: string | null;
};

/** 말풍선에 쓸 한 줄 — "별(역방향)" 처럼. */
export const 카드이름 = (d: Draw) => `${d.카드}${d.역방향 ? "(역방향)" : ""}`;

/**
 * 읽어 준다. 재료는 **그 방의 진짜 대화**와 친밀도.
 *
 * 싼 자리를 쓴다(두근도트의 규칙 — 무료 앱 한 마디에 20배 값을 안 낸다). 대신 자로 거른다.
 */
export async function readTarot(
  c: TarotChar, 뽑기: Draw[], 대화: { role: string; content: string }[], 단계: number, 점수: number,
): Promise<Reading> {
  const 존댓말 = toVoiceLadder(c.voice_ladder, c.formal_start) === "polite";
  const out = await defaultProviders().ai.generateStructuredOutput({
    systemInstructions: [
      `너는 "${c.name}" 다. 지금 **상대와 너 사이**를 타로 세 장으로 읽어 준다.`,
      "", "## 너는 누구인가", c.persona, c.speech ? `말투: ${c.speech}` : "",
      존댓말 ? "- 존댓말로." : "- 반말로.",
      "", "## 뽑힌 카드", ...뽑기.map((d) => `- **${d.자리}**: ${카드이름(d)}`),
      "", `## 지금 사이 — 친밀도 ${단계}단계 (${점수}점)`,
      "", "## 둘이 나눈 말 (오래된 것부터)",
      ...대화.map((m) => `${m.role === "user" ? "상대" : "나"}: ${m.content}`),
      "", "## 어떻게 읽나",
      "- **카드 뜻과 실제 대화를 붙여서** 말한다. 카드 설명만 읊으면 안 되고, 대화에 없는 일을 지어내도 안 된다.",
      "- 역방향은 나쁜 게 아니라 **반대쪽·안쪽**으로 읽는다.",
      "- 점치는 척하는 사람이 아니라 **너**다. 네 말투 그대로.",
      "- 한 줄은 60자 이내. 관계는 세 문장 이내.",
      "",
      "## 답의 모양 (json)",
      "- `카드말`: 세 자리마다 `{자리, 한줄}` — 자리는 여기까지·지금·다음",
      "- `관계`: 세 장을 묶어 지금 우리 사이를 말하는 세 문장 이내",
      "- `근거`: 위 대화에서 **그대로 따온** 짧은 조각 두세 개. 네가 지어낸 말은 넣지 않는다.",
    ].filter(Boolean).join("\n"),
    input: "(카드를 펼친다)",
    schema: readingShape, schemaName: "dot_tarot", maxTokens: 900, tier: "conversation",
  });
  return { ...out.output, 뽑기 };
}

/* ─────────────────────────── 자 ─────────────────────────── */

export type ReadingCheck = {
  맞나: boolean;
  어긴것: string[];
  /** 근거 조각 중 진짜 대화에 있던 것의 비율 */
  근거적중: number;
};

const 눌러쓰기 = (s: string) => s.replace(/[\s.,!?~…·'"“”‘’()\[\]ㅋㅎ]/g, "").toLowerCase();

/**
 * **지어냈나** 를 검사한다.
 *
 * 1. 근거 조각이 진짜 그 방의 말에 들어 있나 (띄어쓰기·문장부호는 지우고 본다).
 *    짧은 조각은 우연히 들어맞으므로 **네 글자 이상**만 센다.
 * 2. 세 자리가 다 있나 · 카드말이 비지 않았나.
 * 3. 길이 — 한 줄 60자, 관계 세 문장.
 *
 * 근거가 **하나도 안 맞으면** 그 판은 버린다. 타로는 틀려도 안 들키는 자리라, 이 검사가
 * 없으면 모델은 "지난주에 힘들다고 했잖아" 를 그냥 짓는다.
 */
export function checkReading(r: Reading, 대화: { role: string; content: string }[]): ReadingCheck {
  const 어긴것: string[] = [];
  const 바닥 = 눌러쓰기(대화.map((m) => m.content).join(" "));
  const 볼것 = r.근거.filter((s) => 눌러쓰기(s).length >= 4);
  const 맞은것 = 볼것.filter((s) => 바닥.includes(눌러쓰기(s)));
  const 근거적중 = 볼것.length ? 맞은것.length / 볼것.length : 0;

  /* 문턱은 **전부**다. 처음엔 "절반 넘으면 통과" 로 뒀는데, 심은 고장에서 **둘 중 하나가
     지어낸 말인 판이 통과**했다. 사용자가 보는 화면에는 그 지어낸 한 줄이 그대로 뜬다 —
     절반만 참인 점괘는 참이 아니다. 프롬프트가 "그대로 따온" 조각을 요구하므로 지킬 수 있는 자리다. */
  if (!볼것.length) 어긴것.push("근거가 없다(또는 전부 너무 짧다)");
  else if (근거적중 === 0) 어긴것.push("근거가 대화에 없다 — 지어냈다");
  else if (근거적중 < 1) 어긴것.push(`근거 ${맞은것.length}/${볼것.length}만 대화에 있다 — 나머지는 지어냈다`);

  const 자리들 = r.카드말.map((x) => x.자리);
  for (const s of SPOTS) if (!자리들.includes(s)) 어긴것.push(`"${s}" 자리가 없다`);
  if (r.카드말.some((x) => !x.한줄?.trim())) 어긴것.push("빈 한 줄이 있다");
  if (r.카드말.some((x) => (x.한줄 ?? "").length > 80)) 어긴것.push("한 줄이 80자를 넘는다");
  if ((r.관계 ?? "").split(/[.!?…]\s*/).filter(Boolean).length > 4) 어긴것.push("관계가 네 문장을 넘는다");

  return { 맞나: 어긴것.length === 0, 어긴것, 근거적중 };
}

/**
 * 한 판 — 뽑고, 읽고, 자에 걸리면 **한 번 더**. 두 번 다 걸리면 안 내보낸다.
 *
 * 다시 부를 때 카드는 그대로다(뽑기는 정해져 있다) — 바뀌는 것은 읽는 말뿐이다.
 */
export async function pullTarot(
  db: SupabaseClient, userId: string, c: TarotChar, 대화수 = 40,
): Promise<{ ok: true; reading: Reading; 검사: ReadingCheck; 판: number } | { ok: false; why: string; 검사?: ReadingCheck }> {
  const { data: bond } = await db.from("dot_bonds").select("points").eq("user_id", userId).eq("character_id", c.id).maybeSingle();
  const 점수 = Number(bond?.points ?? 0), 단계 = stageFor(점수);
  const { data: msgs } = await db.from("dot_messages")
    .select("role, content").eq("user_id", userId).eq("character_id", c.id)
    .order("id", { ascending: false }).limit(대화수);
  const 대화 = ((msgs ?? []) as { role: string; content: string }[]).reverse();
  if (대화.length < 4) return { ok: false, why: "읽을 대화가 너무 적다" };

  const 뽑기 = drawCards(userId, c.id, 단계);
  for (let 판 = 1; 판 <= 2; 판++) {
    const reading = await readTarot(c, 뽑기, 대화, 단계, 점수);
    const 검사 = checkReading(reading, 대화);
    if (검사.맞나) return { ok: true, reading, 검사, 판 };
    if (판 === 2) return { ok: false, why: 검사.어긴것.join(" · "), 검사 };
  }
  return { ok: false, why: "알 수 없음" };
}
