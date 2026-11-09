/**
 * # 놀이 한 수 — 하트·친밀도·저장은 **대화와 같은 길**로
 *
 * 11-09 사장님: 놀이 한 마디도 하트를 먹는다. 그래서 새 길을 파지 않고 `prepareTurn` →
 * (내 프롬프트) → `finishTurn` 을 쓴다. 하트를 빼는 것도, 친밀도도, 말풍선 저장도 전부
 * 대화가 쓰던 그 코드다 — 따로 세면 **두 군데가 어긋난다**([[two-budgets-dont-know-each-other]]).
 *
 * 바뀌는 것은 **가운데 한 조각**뿐이다: 시스템 프롬프트와 받는 모양.
 *
 * ## 판정은 코드가 먼저 한다
 *
 * 모델을 부르기 **전에** `games.ts` 가 사람의 수를 본다. 규칙에 걸리면 모델을 안 부르고
 * 하트도 안 쓴다 — 틀린 수에 값을 물리면 사람이 억울해한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { defaultProviders } from "@/lib/execution/shared";
import { prepareTurn, finishTurn, type TurnResult } from "./turn";
import { todayKST } from "./bond";
import {
  GAME_LABEL, GAME_MARK, GUESS_LIMIT, answerMatches, checkWordChain, gameHead, gameSeed,
  guessState, parseGameHead, pickGuessAnswer, pickLieIndex, pickQuizWord, startsAllowed, toChoseong, type GameKey,
  GAME_END, findLive, countRounds, wordsSoFar, type LiveGame,
} from "./games";
export { GAME_END, findLive, countRounds, wordsSoFar };
export type Live = LiveGame;


const 놀이답 = z.object({
  reply: z.string(),
  emotion: z.string(),
  /** 캐릭터가 둔 수 — 끝말잇기면 낱말 하나. 없으면 "". */
  수: z.string(),
  /** 이 판이 여기서 끝나나 */
  끝: z.boolean(),
});

/**
 * 놀이마다 **코드가 먼저 정하고** 모델에게 남은 말만 시킨다.
 *
 * 11-09 첫 판에서 드러난 것: `끝` 을 모델이 정하게 뒀더니 **두 진실 한 거짓이 시작하자마자
 * 답을 깠다**("1번이 거짓이야"). 끝내는 것도 판정이다 — 그래서 `끝강제` 로 코드가 정하고,
 * 모델이 뭐라 하든 그 값을 쓴다.
 */
function 판설명(game: GameKey, seed: number, live: Live | null, 사람말: string): { 규칙: string[]; 끝강제: boolean; 시작: boolean } {
  /** 말머리만 있고 아직 주고받은 게 없으면 **여는 수**다. */
  const 시작 = !live || live.줄들.filter((l) => !parseGameHead(l.content)).length === 0;
  switch (game) {
    case "끝말잇기": {
      const 쓴것 = live ? wordsSoFar(live) : [];
      return {
        시작, 끝강제: false,
        규칙: 시작
          ? [
            `지금부터 **끝말잇기**다. 네가 먼저 낸다.`,
            `- 두 글자 이상 한글 낱말 하나를 \`수\` 에 적는다(흔한 말로).`,
            `- \`reply\` 는 짧게 한마디. \`끝\` 은 false.`,
          ]
          : [
            `지금 **끝말잇기** 중이다. 지금까지 나온 낱말: ${쓴것.length ? 쓴것.join(", ") : "(없음)"}`,
            `상대가 낸 낱말: "${사람말}" — 규칙은 이미 통과했다.`,
            /* 시작 글자를 **코드가 계산해서** 박아 준다. "끝 글자로 시작" 이라고만 쓰면 모델이
               자주 틀리고(바람 → 바람개비), 그러면 자기 수에서 판이 끝난다. 값은 안 든다. */
            `- 네 낱말은 **"${startsAllowed([...사람말.split(/\s+/)[0]].slice(-1)[0] ?? "")
              .join('" 또는 "')}" 로 시작해야 한다.**`,
            `- 두 글자 이상 한글 낱말 하나를 \`수\` 에 적는다. 이미 나온 것은 안 된다.`,
            `- 더 둘 말이 없으면 \`수\` 를 비우고 \`끝\` true — 네가 졌다는 뜻이다.`,
            `- \`reply\` 는 한마디만. 낱말은 코드가 앞에 붙인다.`,
          ],
      };
    }
    case "스무고개": {
      const 답 = pickGuessAnswer(seed);
      const 사람말들 = (live?.줄들 ?? []).filter((l) => l.role === "user").map((l) => l.content).concat(사람말 ? [사람말] : []);
      const st = guessState(답, 사람말들);
      const 끝강제 = !시작 && st.끝났나;
      return {
        시작, 끝강제,
        규칙: 시작
          ? [`지금부터 **스무고개**다. 너는 **"${답}"** 을 숨겼다. 이 낱말을 말하면 안 된다.`,
             `- "하나 생각했어, 맞혀 봐" 쯤으로 짧게 연다. 힌트는 아직 주지 않는다. \`수\` 는 "".`]
          : [
            `지금 **스무고개** 중이다. 네가 숨긴 것은 **"${답}"** 이다. 먼저 말하면 안 된다.`,
            `상대가 ${st.쓴횟수}번째로 물었다: "${사람말}" (스무 번까지)`,
            st.맞힘 ? `- 상대가 **맞혔다**(코드가 셌다). 맞혔다고 말해 준다.`
              : st.쓴횟수 >= GUESS_LIMIT ? `- 스무 번을 다 썼다. 답이 "${답}" 이었다고 알려 준다.`
              : `- 예/아니오로 답한다(애매하면 "비슷해"). 답을 흘리지 말 것.`,
            `- \`수\` 는 비운다.`,
          ],
      };
    }
    case "두진실한거짓": {
      const 거짓자리 = pickLieIndex(seed);
      return {
        시작, 끝강제: !시작,
        규칙: 시작
          ? [
            `**두 진실 한 거짓**을 시작한다. 네 설정에서 나올 법한 얘기 **셋**을 \`reply\` 에 1. 2. 3. 으로 적는다.`,
            `- **${거짓자리 + 1}번이 거짓**이다. 나머지 둘은 네 설정에 맞는 진짜 얘기.`,
            `- **어느 것이 거짓인지 지금 말하면 안 된다.** 마지막에 "어느 게 거짓일까?" 로 묻는다.`,
            `- \`수\` 는 "".`,
          ]
          : [
            `**두 진실 한 거짓** 채점이다. 거짓은 **${거짓자리 + 1}번**이었다.`,
            `상대가 고른 것: "${사람말}"`,
            `- 맞았는지 말해 주고, 그 거짓에 얽힌 진짜 얘기를 한 줄 덧붙인다.`,
          ],
      };
    }
    case "초성퀴즈": {
      const 낱말 = pickQuizWord(seed);
      const 맞힘 = !시작 && answerMatches(낱말, 사람말);
      return {
        시작, 끝강제: 맞힘,
        규칙: 시작
          ? [`**초성 퀴즈**를 낸다. 답은 "${낱말}" 이고 초성은 **${toChoseong(낱말)}** 이다.`,
             `- \`reply\` 에 초성 ${toChoseong(낱말)} 만 내고 묻는다. **답을 말하지 않는다.**`]
          : [`**초성 퀴즈** 채점이다. 답은 "${낱말}"(${toChoseong(낱말)}) 이고 상대는 "${사람말}" 이라 했다.`,
             맞힘 ? `- **맞혔다**(코드가 셌다). 맞다고 말해 준다.` : `- 틀렸다. 힌트를 한 줄 주고 답은 말하지 않는다.`],
      };
    }
  }
}

/**
 * 놀이 한 수. `game` 만 주면 **새 판을 연다**(사람 말 없이).
 *
 * 규칙에 걸리면 `{ ok:false, reason:"규칙" }` 으로 **모델을 안 부르고** 돌려준다 — 하트도 안 쓴다.
 */
export async function playGameTurn(
  db: SupabaseClient, userId: string, characterId: string,
  opts: { game?: GameKey; message?: string; lang?: "ko" | "en"; 넛지켜기?: boolean },
): Promise<TurnResult | { ok: false; reason: "규칙"; message: string }> {
  const day = todayKST();
  const { data: msgs } = await db.from("dot_messages")
    .select("role, content").eq("user_id", userId).eq("character_id", characterId)
    .order("id", { ascending: false }).limit(60);
  const 최근 = ((msgs ?? []) as { role: string; content: string }[]).reverse();

  /**
   * **새 놀이를 고르면 돌던 판은 거기서 끝난다.**
   *
   * 11-09 첫 판에서 이걸 안 해서, 끝말잇기가 돌고 있는데 스무고개를 고르자 그 말이
   * 끝말잇기의 수로 들어갔다("늘 로 시작해야 해요"). 새 판을 열 때는 **끝 표시를 먼저 남긴다.**
   */
  let live = findLive(최근);
  if (opts.game && live) {
    await db.from("dot_messages").insert({ user_id: userId, character_id: characterId, role: "character", content: GAME_END, emotion: "neutral" });
    live = null;
  }
  const game = opts.game ?? live?.game;
  if (!game) return { ok: false, reason: "규칙", message: "어떤 놀이인지 알려 주세요." };
  const 회차 = opts.game && !live ? countRounds(최근, game) + 1 : (live?.회차 ?? 1);
  const 사람말 = (opts.message ?? "").trim();

  /* ── 코드가 먼저 본다. 걸리면 모델도 하트도 안 쓴다. ── */
  if (game === "끝말잇기" && live && 사람말) {
    const 쓴것 = wordsSoFar(live);
    const v = checkWordChain(쓴것[쓴것.length - 1] ?? null, 사람말.split(/\s+/)[0], 쓴것);
    if (!v.ok) return { ok: false, reason: "규칙", message: v.why ?? "그 수는 안 돼요" };
  }

  /* 새 판이면 말머리를 먼저 남긴다 — 이게 "지금 이 놀이 중" 의 유일한 표시다. */
  if (opts.game && !live) {
    await db.from("dot_messages").insert({ user_id: userId, character_id: characterId, role: "character", content: gameHead(game, 회차), emotion: "happy" });
  }

  const seed = gameSeed(userId, characterId, day, game, 회차);
  const 판 = 판설명(game, seed, live, 사람말);

  /* 하트·친밀도·저장은 대화와 같은 길. 사람 말이 없으면(새 판) 시작 신호를 보낸다. */
  /* `놀이중` 이 대화용 넛지(이름 묻기·시간 힌트)를 끈다. `넛지켜기` 는 **대조군 전용** —
     끄는 것이 정말 공이 있는지 재려면 켠 판도 돌려 봐야 한다. 제품 길에서는 안 쓴다. */
  const p = await prepareTurn(db, userId, characterId, 사람말 || `(${GAME_LABEL[game]} 시작)`, { lang: opts.lang, 놀이중: !opts.넛지켜기 });
  if ("ok" in p) return p;
  try {
    const t = Date.now();
    const out = await defaultProviders().ai.generateStructuredOutput({
      systemInstructions: [
        p.system,
        "", "## 지금은 놀이 중이다",
        ...판.규칙,
        "", "규칙 판정은 **이미 코드가 했다.** 네가 다시 따지지 말고, 위에 적힌 대로 받아들이고 네 말투로 말한다.",
      ].join("\n"),
      input: p.input,
      schema: 놀이답, schemaName: "dot_game_turn", maxTokens: 700, tier: "conversation",
    });
    const said = out.output;
    let reply = said.reply.trim();
    /**
     * **끝말잇기의 낱말은 늘 첫 줄**이다. 안 그러면 지난 낱말을 되읽을 때 "어, 왔네" 의
     * "어" 가 낱말로 세어져 다음 수가 전부 막힌다(11-09 첫 판에서 그랬다).
     * 캐릭터가 낸 낱말도 규칙에 건다 — 자기 차례라고 봐주지 않는다.
     */
    let 끝났나 = 판.끝강제;
    if (game === "끝말잇기") {
      const 쓴것 = [...(live ? wordsSoFar(live) : []), ...(사람말 ? [사람말.split(/\s+/)[0]] : [])];
      const 앞말 = 쓴것[쓴것.length - 1] ?? null;
      if (!said.수) { 끝났나 = true; }
      else {
        const v = checkWordChain(앞말, said.수, 쓴것);
        if (!v.ok) { reply = `${said.수}… 아니다, 그건 안 되겠네`; 끝났나 = true; }
        else reply = `${said.수}\n${reply.replace(said.수, "").replace(/^[\s.,!?~…]+/, "").trim()}`.trim();
      }
    } else if (said.끝 && 판.끝강제 === false && !판.시작) {
      /* 모델이 끝났다고 해도 **코드가 안 끝났다고 하면 안 끝난다.** 반대도 같다. */
      끝났나 = false;
    }
    if (끝났나 && !reply.includes(GAME_END)) reply = `${reply}\n${GAME_END}`;
    return await finishTurn(db, userId, p, { reply, emotion: said.emotion, remember: "" } as never, {
      model: out.model, inputTokens: out.inputTokens ?? 0, outputTokens: out.outputTokens ?? 0,
      routing: out.routing, tModel: Date.now() - t, tPrepare: t - p.t0, tFirst: null,
    });
  } catch (e) {
    await p.giveBack();
    return { ok: false, reason: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}

export { GAME_MARK };
