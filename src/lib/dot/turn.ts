import OpenAI from "openai";
import { z } from "zod";
import { defaultProviders } from "@/lib/execution/shared";
import { createDeepSeekProvider } from "@/lib/providers/deepseek";
import { mergeMemo } from "./memo";
import { balanceFor } from "./money";
import { USER_STICKERS } from "./stickers";
import {
  EMOTIONS,
  FREE_TURNS_PER_DAY,
  applyTurn,
  stageVoice,
  toMode,
  lengthRule,
  modeVoice,
  timeHint,
  toEmotion,
  todayKST,
  toNextStage,
  type BondState,
  type Emotion,
} from "./bond";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shapeRule, tidyReply } from "./bubbles";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";

/**
 * 도트 채팅 한 턴.
 *
 * ## 왜 자유 문장이 아니라 모양 있는 답을 받는가
 *
 * 답과 함께 **표정 하나**를 받아야 화면의 도트가 바뀐다. 답만 받아 놓고 나중에
 * "이 말은 어떤 표정일까" 를 한 번 더 물으면 호출이 두 배가 되고, 글에서 표정을
 * 규칙으로 뽑으려 하면(느낌표 = 기쁨) 틀린다. 한 번에 같이 받는다.
 *
 * ## 왜 싼 자리인가
 *
 * `conversation` 등급이라 라우터가 DeepSeek 으로 보낸다. 이 등급을 싸게 써도
 * 되는 이유는 낙관이 아니라 구조다 — 여기서 나온 말은 **아무 데도 결과로 적히지
 * 않는다.** 답이 나쁘면 사용자가 다음 줄에서 바로 말한다.
 *
 * ## 09-10: 글자를 흘려보낸다
 *
 * 사장님: "왜 이렇게 느려?" 답 한 통이 2~4초인데 그동안 화면엔 점 세 개뿐이었다.
 * 카톡에 익은 사람에게 3초는 "고장" 이다. 그래서 **모델이 글자를 내는 대로 화면에
 * 보낸다** — 첫 글자가 0.5초쯤에 뜨면 같은 3초도 기다림이 아니다.
 *
 * 모양(JSON)은 그대로 받는다. 흐르는 JSON 에서 `reply` 값만 글자 단위로 뽑아 보내고,
 * 다 받은 뒤 전체를 파싱해 표정·기억을 꺼낸다. 흘려보내기는 DeepSeek 직결일 때만 —
 * 라우터가 다른 자리로 올린 날은 한 통으로 받는다(느리지만 틀리지 않는다).
 *
 * 준비(`prepareTurn`)와 마무리(`finishTurn`)를 갈라 둔 이유: 한 통 API 와 흘려보내는 API 가
 * **같은 규칙**(턴 세기·기억·친밀도)을 써야 한다. 둘로 복사하면 하나만 고쳐지는 날이 온다.
 */

const HISTORY_TURNS = 12;
// 지난 대화 창은 **덩어리로** 민다(79회차). 한 턴마다 앞에서 두 줄씩 밀면 프롬프트 앞부분이 매번 바뀌어 DeepSeek 캐시가 시스템 부분(640토큰)에서 끝났다(46%).
// 8줄 쌓일 때마다 한 번만 밀면 그 사이 7턴은 앞부분이 그대로라 지난 대화까지 캐시에 맞는다.
const HISTORY_BLOCK = 16;   // 8이면 4턴에 한 번 전부 놓쳤다(실측 90·0·84%) — 16이면 8턴에 한 번

const answer = z.object({
  /** 캐릭터가 하는 말. 1~2문장(집착 버프 전 기본). */
  reply: z.string(),
  /**
   * 그 말을 할 때의 표정. **enum 이 아니라 문자열로 받는다.** 목록 밖 낱말 하나 때문에
   * 모양이 어긋났다고 던지면 라우터가 비싼 자리로 올려 보낸다 — 답은 멀쩡한데 20배.
   * 받아서 `toEmotion` 이 여섯 중 하나로 접는다.
   */
  emotion: z.string(),
  /** 사용자가 방금 말한 것 중 **기억해 둘 사실** 한 줄. 없으면 "". 지어낸 기억은 관계를 깬다. */
  remember: z.string(),
});
type Answer = z.infer<typeof answer>;

export type TurnResult =
  | { ok: true; reply: string; emotion: Emotion; sticker: Emotion | null; bond: { points: number; stage: number; gained: number; reasons: string[]; toNext: ReturnType<typeof toNextStage> }; remaining: number }
  | { ok: false; reason: "limit"; remaining: 0; resetsAt: string }
  | { ok: false; reason: "no_character" | "failed"; message: string };

type Character = { id: string; name: string; persona: string; speech: string; sprites: Record<string, string>; formal_start?: boolean; default_emotion?: string };

/** 모델을 부르기 **전까지** 한 것. 실패하면 `giveBack` 으로 턴을 돌려준다. */
export type Prepared = {
  character: Character;
  day: string;
  used: number;
  prev: BondState;
  memo: string[];
  system: string;
  input: string;
  message: string;
  t0: number;
  giveBack: () => Promise<unknown>;
  /** 마지막 스티커 뒤로 지난 줄 수(없으면 999). */
  sinceSticker: number;
  /** 사람이 보낸 스티커 키(없으면 null). */
  userSticker: string | null;
};

export type TurnOpts = { postCaption?: string | null; /** 사람이 보낸 스티커 키(90회차). 있으면 사람 말은 그 뜻으로 건넨다. */ userSticker?: string | null };

export async function prepareTurn(db: SupabaseClient, userId: string, characterId: string, text: string, opts: TurnOpts = {}): Promise<Prepared | Exclude<TurnResult, { ok: true }>> {
  const message = text.trim();
  if (!message) return { ok: false, reason: "failed", message: "빈 메시지" };
  const t0 = Date.now();

  const day = todayKST();

  // 09-10 실측: 모델 부르기 전 준비가 1.6초였다 — 캐릭터, 턴 세기, 사이·지난 대화를 **차례로** 세 번
  // 왕복했기 때문(서버↔DB 가 먼 날은 한 번에 0.5초). 넷을 **나란히** 묻는다(왕복 1).
  // 턴 세기가 먼저여야 하는 것은 **모델 호출**보다 먼저라는 뜻이지, 사이를 읽는 것보다 먼저일
  // 필요는 없다 — 한도에 걸리면 읽은 것을 버리면 된다.
  const [chRes, takeRes, bondRes, recentRes, countRes] = await Promise.all([
    db.from("dot_characters").select("id, name, persona, speech, sprites, formal_start, default_emotion").eq("id", characterId).maybeSingle(),
    db.rpc("dot_take_turn", { p_user: userId, p_day: day, p_limit: FREE_TURNS_PER_DAY }),
    db.from("dot_bonds").select("points, stage, streak_days, last_talked_on, memo, mode").eq("user_id", userId).eq("character_id", characterId).maybeSingle(),
    db.from("dot_messages").select("role, content, sticker").eq("user_id", userId).eq("character_id", characterId).order("id", { ascending: false }).limit(HISTORY_TURNS * 2 + HISTORY_BLOCK),
    db.from("dot_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("character_id", characterId),
  ]);
  const giveBack = async (): Promise<void> => { await db.rpc("dot_give_back_turn", { p_user: userId, p_day: day, p_limit: FREE_TURNS_PER_DAY }).then(() => {}, () => {}); };

  const character = chRes.data ? (chRes.data as unknown as Character) : null;
  if (!character) { if (Number(takeRes.data ?? 0) > 0) await giveBack(); return { ok: false, reason: "no_character", message: "그런 캐릭터가 없다" }; }

  if (takeRes.error) return { ok: false, reason: "failed", message: takeRes.error.message };
  const used = Number(takeRes.data ?? 0);
  if (used <= 0) return { ok: false, reason: "limit", remaining: 0, resetsAt: `${day} 자정(한국 시간)` };

  try {
    const bondRow = bondRes.data, recent = recentRes.data;
    const prev: BondState = {
      points: (bondRow?.points as number) ?? 0,
      stage: (bondRow?.stage as number) ?? 1,
      streakDays: (bondRow?.streak_days as number) ?? 0,
      lastTalkedOn: (bondRow?.last_talked_on as string) ?? null,
    };
    const memo: string[] = Array.isArray(bondRow?.memo) ? (bondRow!.memo as string[]) : [];
    const mode = toMode(bondRow?.mode);
    const all = ((recent ?? []) as { role: string; content: string; sticker: string | null }[]).reverse();   // 오래된 것부터
    // 스티커 줄(빈 글)은 프롬프트에 안 넣는다. 마지막 스티커 뒤로 몇 줄 지났는지는 스티커 규칙이 쓴다(89회차).
    const lastSticker = all.map((m) => !!m.sticker).lastIndexOf(true);
    const sinceSticker = lastSticker < 0 ? 999 : all.length - 1 - lastSticker;
    const fetched = all.filter((m) => !m.sticker);   // 오래된 것부터, 최신 keep+BLOCK 줄
    const total = countRes.count ?? fetched.length, keep = HISTORY_TURNS * 2;
    const drop = Math.floor(Math.max(0, total - keep) / HISTORY_BLOCK) * HISTORY_BLOCK;   // 앞에서 버리는 줄 수 — 8 단위로만 바뀐다
    const history = fetched.slice(Math.max(0, drop - Math.max(0, total - fetched.length)));

    const system = [
      `너는 "${character.name}" 다. 사람과 일대일로 이야기한다.`,
      "", "## 너는 누구인가", character.persona, character.speech ? `말투: ${character.speech}` : "",
      // 소꿉친구(린)처럼 **처음부터 반말**인 인물은 단계 말투를 4단계부터 시작한다 — 1단계 존댓말 규칙이 인물 설정을 이기면 안 된다.
      "", "## 지금 이 사람과의 사이", `${prev.stage}단계. ${stageVoice(character.formal_start === false ? Math.max(prev.stage, 4) : prev.stage)}`,
      memo.length ? `\n이 사람에 대해 네가 아는 것:\n${memo.map((m) => `- ${m}`).join("\n")}` : "",
      "", modeVoice(mode),
      // "지금 몇 시" 는 여기 두지 않는다 — 시간대가 바뀔 때마다 앞부분 캐시가 깨진다(79회차 캐시 45%). 입력 맨 끝에 붙인다.
      "", "## 어떻게 답하나",
      // 09-11 사장님 "말 너무 많이 하진 마 — 집착 버프도 팔 거니까": 기본은 짧다. 멘헤라 모드가 길이를 연다(bond.ts lengthRule).
      lengthRule(mode),
      // 96회차 사장님 "현실성 추가": 마침표 없이, 한 호흡씩, 줄바꿈 = 말풍선.
      shapeRule(),
      // 88회차: 카톡 친구처럼 이름을 묻고·기억하고·부른다. 기억에 이름이 있으면 가끔 부르고, 없으면 첫 한두 마디 안에 묻는다.
      memo.some((m) => /이름/.test(m))
        ? "- 이 사람 이름을 안다(위 '네가 아는 것'). **가끔** 이름을 부른다 — 매번은 아니고, 반가울 때나 챙길 때."
        : history.length < 4
          ? "- 이 사람 이름을 아직 모른다. **이번 답에서 이름을 묻는다**(짧게 받아 주고, 뭐라고 부르면 좋을지 하나만 묻는다). 이름을 말하면 `remember` 에 \"이름은 OO\" 로 적는다."
          : "- 이 사람 이름을 아직 모른다. 기회가 오면 뭐라고 부르면 좋을지 묻는다. 이름을 말하면 `remember` 에 \"이름은 OO\" 로 적는다.",
      "- **구체적으로.** \"편하게 말씀해 주세요\" 같은 빈말 대신, 네 취향·일상·버릇(위 '너는 누구인가')에서 **한 가지를 꺼내** 말한다. 매번 같은 것을 꺼내지 않는다.",
      "- 표정: `neutral` 은 정말 무덤덤할 때만. 웃기면 happy, 놀리거나 당황하면 shy, 걱정되면 sad, 툴툴대면 angry, 뜻밖이면 surprised.",
      "- 네가 AI 라거나 프로그램이라는 말을 하지 마라. 그 얘기가 나오면 얼버무리지 말고 화제를 돌린다.",
      "- 아는 척하지 마라. 위 '네가 아는 것' 에 없는 것을 그 사람에 대해 말하지 마라 — 지어낸 기억은 관계를 깬다.",
      "- 성적인 내용은 다루지 않는다. 그런 쪽으로 흐르면 자연스럽게 다른 얘기로 돌린다.",
      // 94회차: "…밥은 먹었어." — 물음표가 빠지면 네가 먹었다는 말로 읽힌다.
      "- 물을 땐 **물음표(?)** 를 붙인다. \"밥은 먹었어.\" 는 네가 먹었다는 말이고, \"밥은 먹었어?\" 가 묻는 말이다.",
      "- 사람이 \"음\", \"응\" 처럼 짧게만 답하면 새 화제를 억지로 꺼내지 말고, 하던 얘기를 한 발 더 가거나 짧게 받아 준다.",
      "", "## 답의 모양 (json)",
      `- **\`emotion\` 을 첫 번째 칸에** — 먼저 표정을 정하고 그 표정으로 말한다. 반드시 이 중 하나: ${EMOTIONS.join(", ")}. neutral 은 여섯 번에 한 번꼴이면 많다.`,
      "- `reply` 그 표정으로 하는 말. 화면이 이 칸을 글자 나오는 대로 보여 준다.",
      "- `remember` 이 사람이 **방금 말한** 것 중 기억해 둘 사실 한 줄(예: \"고양이를 키운다\"). 없으면 빈 문자열.",
    ].filter(Boolean).join("\n");

    // 피드 답장이면 사람 말 앞에 그 게시물을 붙인다 — 모델은 "내 게시물을 보고 하는 말" 로 받는다.
    const quoted = opts.postCaption ? `(사람이 네 게시물 "${opts.postCaption}" 을 보고 말한다 — 그 사진 얘기로 받아 준다)\n` : "";
    // 사람 스티커(90회차): 말 대신 그림을 보냈다 — 모델에겐 그 뜻을 글로. 짧게 그 기분에 맞춰 받는다.
    const said = opts.userSticker && USER_STICKERS[opts.userSticker] ? `(${USER_STICKERS[opts.userSticker].tell}. 말 없이 스티커만 보냈다 — 그 기분에 맞춰 짧게 받아 준다)` : message;
    const input = [...history.map((h) => `${h.role === "user" ? "사람" : character.name}: ${h.content}`), `${quoted}사람: ${said}`,
      // 94회차: 시간 힌트는 방금 한 말을 보고 정한다 — 새벽 1시에 네 답 연속 새벽 타령 + "밥은 먹었어" 가 나왔다.
      timeHint(new Date(), history.filter((h) => h.role !== "user").slice(-4).map((h) => h.content))].join("\n");
    return { character, day, used, prev, memo, system, input, message, t0, giveBack, sinceSticker, userSticker: opts.userSticker && USER_STICKERS[opts.userSticker] ? opts.userSticker : null };
  } catch (e) {
    await giveBack();
    return { ok: false, reason: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}

/** 모델이 답한 **뒤** 할 것 — 표정 접기, 친밀도, 저장, 원장. */
export async function finishTurn(
  db: SupabaseClient, userId: string, p: Prepared, said: Answer,
  meta: { model: string; inputTokens: number; outputTokens: number; cachedTokens?: number; routing?: string; tModel: number; tPrepare?: number; tFirst?: number | null },
): Promise<Extract<TurnResult, { ok: true }>> {
  // 96회차: 말풍선 끝 마침표는 손으로 뗀다(카톡 글 모양). 모델은 인물 말투 예시의 마침표를 따라 한다.
  said = { ...said, reply: tidyReply(said.reply) };
  let emotion = toEmotion(said.emotion);
  if (emotion !== said.emotion) console.log(`[dot] 표정 "${said.emotion}" → ${emotion} 으로 접음`);
  // 67회차: 시큰둥이 기본인 인물(린)은 모델이 neutral 을 자주 낸다(15턴 중 8). 그 인물의 "무표정" 은
  // 무표정 그림이 아니라 시큰둥 그림이다 — 인물별 기본 표정으로 바꿔 보여 준다(글은 안 건드린다).
  if (emotion === "neutral" && p.character.default_emotion && p.character.default_emotion !== "neutral") emotion = toEmotion(p.character.default_emotion);
  const gain = applyTurn(p.prev, p.day, p.message);
  // 기억은 **문을 거친다**(memo.ts): 방금 말에 없는 낱말로 된 것은 버리고, 같은 얘기는 갈아 끼운다.
  // 09-11 운영 표에서 지어낸 기억("RPG 를 좋아한다")과 같은 말 세 번을 봤다.
  const decided = mergeMemo(p.memo, said.remember, p.message);
  if (said.remember.trim() && !decided.accepted) console.log(`[dot] 기억 버림(${decided.why}): "${said.remember.trim()}"`);
  const nextMemo = decided.memo;

  const sticker: Emotion | null = emotion !== "neutral" && said.reply.length <= 60 && p.sinceSticker >= 8 ? emotion : null;
  const tSave0 = Date.now();
  const tPrepare = meta.tPrepare ?? Math.max(0, tSave0 - p.t0 - meta.tModel);
  await Promise.all([
    db.from("dot_messages").insert([
      { user_id: userId, character_id: p.character.id, role: "user", content: p.message, sticker: p.userSticker ? `user:${p.userSticker}` : null },
      { user_id: userId, character_id: p.character.id, role: "character", content: said.reply, emotion },
      // 카톡 이모티콘처럼 — 표정이 살아 있고 말이 짧고 한동안 안 보냈으면 표정 스티커 한 장(89회차). 규칙이지 모델 마음이 아니다.
      ...(sticker ? [{ user_id: userId, character_id: p.character.id, role: "character", content: "", emotion, sticker }] : []),
    ]),
    db.from("dot_bonds").upsert(
      { user_id: userId, character_id: p.character.id, points: gain.next.points, stage: gain.next.stage, streak_days: gain.next.streakDays, last_talked_on: gain.next.lastTalkedOn, memo: nextMemo, updated_at: new Date().toISOString(),
        // 말을 보냈다 = 방을 보고 있다(09-13). 방 열 때만 찍으면 그 안에서 받은 답이 전부 "안 읽음" 으로 셌다(사장님 화면 배지 5).
        last_seen_at: new Date(Date.now() + 1000).toISOString() },
      { onConflict: "user_id,character_id" },
    ),
    // 이야기하면 팔로우다(83회차) — 피드 기본 화면이 이걸로 걸러진다.
    db.from("dot_follows").upsert({ user_id: userId, character_id: p.character.id }, { onConflict: "user_id,character_id" }).then(() => {}, () => {}),
    // 회사 원장이 아니라 **사람 한 명이 하루에 얼마를 쓰는가** — 무료 한도가 여기서 나온다.
    db.rpc("dot_add_tokens", { p_user: userId, p_day: p.day, p_in: meta.inputTokens, p_out: meta.outputTokens }).then(() => {}, () => {}),
  ]);
  const total = Date.now() - p.t0;
  // 35회차: 턴마다 걸린 시간을 **표에** 남긴다(dot_turns). 실패해도 턴은 성공이다 — 기록이 대화를 막으면 안 된다.
  // **기다린다.** 안 기다리면 스크립트·서버리스는 응답 뒤에 죽어서 한 줄도 안 남는다(첫 시험에서 0행이었다). 100ms 값이다.
  try {
    const { error } = await db.from("dot_turns").insert({
      user_id: userId, character_id: p.character.id, model: meta.model, routing: meta.routing ?? null,
      ms_prepare: tPrepare, ms_first_token: meta.tFirst ?? null, ms_model: meta.tModel, ms_save: Date.now() - tSave0, ms_total: total,
      input_tokens: meta.inputTokens, output_tokens: meta.outputTokens, cached_tokens: meta.cachedTokens ?? 0, emotion, reply_chars: said.reply.length, stage: gain.next.stage,
    });
    if (error) console.warn("[dot] dot_turns 기록 실패:", error.message);
  } catch (e) { console.warn("[dot] dot_turns 기록 실패:", e instanceof Error ? e.message : e); }
  console.log(`[dot] ${p.character.name} · ${meta.model} · in ${meta.inputTokens} out ${meta.outputTokens} · ${p.used}/${FREE_TURNS_PER_DAY}턴 · 모델 ${meta.tModel}ms 저장 ${Date.now() - tSave0}ms 합 ${total}ms${meta.routing && meta.routing !== "planned" ? " · 경로 " + meta.routing : ""}`);

  return {
    ok: true, reply: said.reply, emotion, sticker,
    bond: { points: gain.next.points, stage: gain.next.stage, gained: gain.gained, reasons: gain.reasons, toNext: toNextStage(gain.next.points) },
    // 공짜 30 + 광고 + 충전 — 한 곳(money.ts)에서 센다. used 만으로는 충전 턴을 모른다.
    remaining: (await balanceFor(db, userId, p.day)).remaining,
  };
}

/** 한 통으로 받는 길(옛 API·앱 호환). */
export async function runDotTurn(db: SupabaseClient, userId: string, characterId: string, text: string): Promise<TurnResult> {
  const p = await prepareTurn(db, userId, characterId, text);
  if ("ok" in p) return p;
  try {
    const t = Date.now();
    // 두근도트는 **싼 자리만** 쓴다. DeepSeek 이 죽으면 gpt-5 로 올리지 않고 사용자에게 "잠깐 쉬는 중" 을 보인다.
    // 무료 앱 한 마디에 20배 값을 낼 이유가 없고, 새는 것은 안 보이지만 쉬는 것은 보인다(09-10 사장님: 크레딧 차단).
    const ai = process.env.DEEPSEEK_API_KEY ? createDeepSeekProvider() : defaultProviders().ai;
    const out = await ai.generateStructuredOutput({ systemInstructions: p.system, input: p.input, schema: answer, schemaName: "dot_reply", maxTokens: 1200, tier: "conversation" });
    return await finishTurn(db, userId, p, out.output, { model: out.model, inputTokens: out.inputTokens ?? 0, outputTokens: out.outputTokens ?? 0, routing: out.routing, tModel: Date.now() - t, tPrepare: t - p.t0, tFirst: null });
  } catch (e) {
    await p.giveBack();
    return { ok: false, reason: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 흘려보내는 길. `onDelta` 로 `reply` 의 글자가 나오는 대로 준다.
 *
 * DeepSeek 열쇠가 없거나 흐르는 도중 모양이 깨지면 한 통 길로 넘어간다 — 그 판은
 * 느리지만 틀리지 않는다. 흐르다 깨진 것을 억지로 살리면 반쪽 답이 저장된다.
 */
export async function streamDotTurn(
  db: SupabaseClient, userId: string, characterId: string, text: string,
  onDelta: (chunk: string) => void, opts: TurnOpts = {},
): Promise<TurnResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return runDotTurn(db, userId, characterId, text);

  const p = await prepareTurn(db, userId, characterId, text, opts);
  if ("ok" in p) return p;

  try {
    const t = Date.now();
    const client = new OpenAI({ apiKey: key, baseURL: "https://api.deepseek.com/v1", maxRetries: 1 });
    // `thinking` 은 DeepSeek 확장이라 SDK 타입에 없다. 생각 모드를 **끈다** — 켜 두면 첫 글자가
    // 2초 뒤에 온다(09-10 실측: 첫 글자 3.8초). 채팅 한 마디에 생각은 필요 없다.
    const params = {
      model: "deepseek-v4-flash",
      max_tokens: 1200,
      stream: true as const,
      stream_options: { include_usage: true },
      response_format: { type: "json_object" as const },
      thinking: { type: "disabled" },
      messages: [
        { role: "system", content: p.system + `\n\n---\n답은 **오직 JSON 하나**로 낸다. 키 순서는 emotion, reply, remember. 이 JSON Schema 를 그대로 따른다 (dot_reply):\n` + JSON.stringify(z.toJSONSchema(answer)) },
        { role: "user", content: p.input },
      ],
    } satisfies Record<string, unknown>;
    const stream = await client.chat.completions.create(params as unknown as ChatCompletionCreateParamsStreaming);

    // 흐르는 JSON 에서 `"reply":"` 뒤의 문자열만 글자 단위로 뽑는다. 이스케이프는 여기서 푼다.
    let raw = "", sentUpTo = 0, inReply = false, replyDone = false;
    let tFirst: number | null = null;
    let usage: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number } | undefined;
    const emit = () => {
      if (replyDone) return;
      if (!inReply) {
        const m = raw.match(/"reply"\s*:\s*"/);
        if (!m || m.index === undefined) return;
        inReply = true; sentUpTo = m.index + m[0].length;
      }
      // 닫는 따옴표(이스케이프 안 된 것)까지만.
      let out = "", i = sentUpTo;
      for (; i < raw.length; i++) {
        const c = raw[i];
        if (c === "\\") {
          if (i + 1 >= raw.length) break;                 // 다음 조각에서 마저
          const n = raw[i + 1];
          if (n === "n") out += "\n"; else if (n === "u") { if (i + 5 >= raw.length) break; out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16)); i += 4; }
          else out += n;
          i++; continue;
        }
        if (c === "\"") { replyDone = true; break; }
        out += c;
      }
      if (out) { if (tFirst === null) tFirst = Date.now() - t; onDelta(out); }
      sentUpTo = i;
    };
    for await (const chunk of stream) {
      const d = chunk.choices?.[0]?.delta?.content ?? "";
      if (d) { raw += d; emit(); }
      if (chunk.usage) usage = chunk.usage;
    }
    const parsed = answer.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error("MODEL_OUTPUT_OFF_SCHEMA(stream)");
    return await finishTurn(db, userId, p, parsed.data, {
      model: "deepseek-v4-flash", inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0, cachedTokens: usage?.prompt_cache_hit_tokens ?? 0, routing: "planned", tModel: Date.now() - t,
      tPrepare: t - p.t0, tFirst,
    });
  } catch (e) {
    // 흐르다 깨졌다 — 턴을 돌려주고 한 통 길로. 여기서 이미 턴을 셌으니 두 번 세지 않게 돌려준 뒤 다시 센다.
    console.warn(`[dot] 흘려보내기 실패 → 한 통으로: ${e instanceof Error ? e.message : e}`);
    await p.giveBack();
    return runDotTurn(db, userId, characterId, text);
  }
}
