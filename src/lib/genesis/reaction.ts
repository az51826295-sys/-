import { z } from "zod";
import type { AIProvider } from "@/lib/providers/types";
import type { Supabase } from "@/lib/execution/shared";

/**
 * **사람이 방금 결과를 물린 건가 — 정규식이 아니라 AI 가 읽는다** (156회차 09-16).
 *
 * 사장님: *"로키 판단자는 기계가 아니라 에이아이다. 2번부터."*
 *
 * 그때까지 자가진화의 대화 원천은 사장님 반응을 **정규식**으로 채점했다:
 *   `다시 ?(해|만들|…)|아니[,.! ]|틀렸|잘못|안 ?돼|이상해`
 * 오늘 chat_bench 에서 같은 종류의 정규식이 **맞는 답 둘을 틀렸다고 잡았다**("아직 판정은 없어요" 의 '없어요',
 * "자기를 재는 자는 못 바꿔요" 의 '못 바꿔'). 낱말은 뜻이 아니다 — "카메라는 다시 왼쪽으로" 는 되돌림이 아니라 새 지시다.
 *
 * 이건 모델이 모델을 채점하는 게 아니다. **사람이 쓴 글을 읽는 것**이고, 그 사람의 반응이 유일한 정답이다.
 * 그러니 읽는 쪽이 낱말이 아니라 뜻을 봐야 한다.
 *
 * ## 값
 * 한 번에 25턴씩 묶어 싼 자리(routine)에서 읽고, **읽은 것은 그 사람 말에 붙여 둔다**(`attachments.reaction`) —
 * 매일 같은 말을 다시 읽지 않는다. 정규식은 남겨 둔다: 모델이 없거나 죽었을 때의 난간이고, 둘이 어긋난 판을 세는 그림자다.
 */

/** `accepted`(169회차): 받은 결과를 **받아들였는가**. "물리지 않았다"와 다르다 — "투구 다시 만들자, 이번엔 규격 주고"는 불만의 말투가 아니어도 받아들인 게 아니다. 옛 기록엔 없다(undefined). */
export type Reaction = {
  rejected: boolean; accepted?: boolean; why: string; by: "ai" | "regex"; at: string;
  /**
   * 226회차 09-26 — **무엇을 두고 한 말인가.** 물림 42건을 세어 보니 어느 결과물 얘기인지 이어진 것이
   * **3건뿐**이었다. 판정 단추는 7건, 말은 319줄인데 둘이 따로 놀았다. 취향 자를 만들려면 이 줄이 있어야 한다.
   */
  deliverableId?: string | null;
  /** 그 말이 짚은 자리 — "투구 크기" · "말투" · "음악" 처럼 짧게. 결과물 얘기가 아니면 빈 문자열. */
  about?: string;
};

// 그림자 겸 난간. "다시" 는 되돌림·새 일에 다 쓰여 헛짚었다(103회차) → 행동 동사가 붙은 "다시" 만.
export const CORRECTION = /다시 ?(해|만들|내|봐|하|돌|고|짜|그려|시작)|^다시|아니[,.! ]|아니야|아니요|틀렸|잘못|안 ?돼|이상해/;

export type Turn = {
  /** 사람 말의 id — 읽은 결과가 여기 붙는다. */
  id: string;
  /** 그 사람이 앞서 시킨 것. */
  order: string;
  /** AI 가 한 답. */
  answer: string;
  /** 그 답을 받고 사람이 한 말. **이걸 읽는다.** */
  reply: string;
  attachments: Record<string, unknown> | null;
  /** 그 답이 실어 온 결과물(있으면). 이게 있어야 사장님 말이 **무엇에 대한 것인지** 남는다. */
  deliverable?: { id: string; type?: string | null; title?: string | null } | null;
};

const schema = z.object({
  reactions: z.array(z.object({
    n: z.number(),
    rejected: z.boolean().describe("방금 받은 결과를 물렸는가 — 고쳐라·아니다·틀렸다·마음에 안 든다. 새 일을 시키거나 그냥 이야기하는 것은 false."),
    accepted: z.boolean().describe("방금 받은 결과를 **받아들였는가** — 좋다·됐다·그걸 그대로 두고(또는 그걸 재료로) 다음 걸 해 달라. 같은 것을 다시 만들자·그 방향을 접자·그냥 딴 이야기는 false. rejected 가 true 면 반드시 false. 모르겠으면 false."),
    why: z.string().describe("왜 그렇게 읽었는지 한 줄. 사람이 보고 틀렸다고 말할 수 있어야 한다."),
    about: z.string().describe("그 말이 **결과물의 어느 자리**를 짚었나 — \"투구 크기\" · \"말투\" · \"음악\" · \"화면 글자\" 처럼 짧게. 결과물 얘기가 아니거나(새 일·잡담) 어디를 짚었는지 분명하지 않으면 빈 문자열."),
  })),
});

const SYS = [
  "너는 사람이 AI 의 답을 받고 한 말을 읽는다. 물음은 하나다:",
  "**이 사람은 방금 받은 결과를 물린 건가?** (고쳐라 · 아니다 · 틀렸다 · 마음에 안 든다 · 다시 해라)",
  "아니면 새 일을 시키거나, 이어서 이야기하거나, 받아들인 건가?",
  "",
  "- 낱말이 아니라 뜻으로 읽어라. \"카메라는 다시 왼쪽으로\" 는 되돌림이 아니라 새 지시다. \"아니 근데 이건 어때\" 는 물린 게 아닐 수 있다.",
  "- 짧고 거친 말(\"별로야\" · \"쓰레기\" · \"ㅋㅋ 아님\")도 뜻이 분명하면 그대로 읽어라.",
  "- 모르겠으면 물리지 않은 것(false)으로 둔다.",
  "- **`n` 은 위에 적힌 turn 번호 그대로다.** 순서를 바꾸거나 빠뜨리지 마라 — 번호가 밀리면 남의 말에 붙는다.",
  "- `why` 에는 그 사람이 한 말을 **작은따옴표로 그대로 한 조각 인용**해라. 그래야 밀린 것을 기계가 잡는다.",
  "",
  "그리고 **`about`**: 그 말이 결과물의 어느 자리를 짚었는지 짧게 적어라(\"투구 크기\" · \"말투\" · \"음악\").",
  "이건 나중에 취향을 재는 자의 재료가 된다 — 사람이 무엇을 보고 별로라 했는지가 남아야 한다.",
  "결과물 얘기가 아니거나 어디를 짚었는지 분명하지 않으면 빈 문자열로 둔다. 지어내지 마라.",
].join("\n");

/** 한 묶음을 읽는다. 실패하면 던진다 — 부르는 쪽이 정규식으로 내려간다. */
async function readBatch(ai: AIProvider, turns: Turn[]): Promise<Map<string, Reaction>> {
  const { output, model } = await ai.generateStructuredOutput({
    systemInstructions: SYS,
    input: [
      "## 사람의 말을 읽는다",
      ...turns.map((t, n) => [
        `### turn ${n}`,
        `시킨 것: ${t.order.slice(0, 300)}`,
        `AI 답: ${t.answer.slice(0, 500)}`,
        t.deliverable ? `그 답이 낸 결과물: ${t.deliverable.type ?? "?"} "${t.deliverable.title ?? ""}"` : "",
        `**사람이 한 말: ${t.reply.slice(0, 400)}**`,
      ].join("\n")),
    ].join("\n\n"),
    schema, schemaName: "reactions", maxTokens: 2500, tier: "routine",
  });
  const at = new Date().toISOString();
  const out = new Map<string, Reaction>();

  /**
   * 226회차 09-26 — **읽은 것이 엉뚱한 말에 붙고 있었다.** 저장된 것을 대 보니
   * `[점수 글자 크기]` 가 "아니 유니티 말고html로" 에, `[막대 길이]` 가 "점수 글자가 작아서" 에 붙어 있었다.
   * 읽은 내용은 멀쩡한데 **한 칸씩 밀렸다** — 묶음으로 읽을 때 모델이 매긴 `n` 을 그대로 믿었기 때문이다.
   * 09-16 에 이 경로를 만든 뒤로 계속 그랬고, 같은 길로 `물림/받아들임` 도 붙으니 자가진화가 **틀린 재료로**
   * 배우고 있었다.
   *
   * 값 0 으로 잡는다: 모델이 쓴 이유에는 사람 말이 **따옴표로 인용**돼 있다("'왜 다 바꿔 바보야' — …").
   * 그 인용이 그 말에 실제로 있는지 대 본다. 어긋나면 **그 줄은 버린다** — 틀린 재료보다 없는 게 낫다.
   */
  const quoted = (why: string): string | null => {
    const m = why.match(/[''"'"]([^''"'"]{4,40})[''"'"]/);
    return m ? m[1].replace(/\s+/g, "") : null;
  };
  let slipped = 0;

  for (const r of output.reactions) {
    const t = turns[r.n];
    if (t) {
      const q = quoted(r.why ?? "");
      // 인용이 있는데 그 말에 없다 → 다른 턴의 것이 이 자리에 온 것이다.
      if (q && !t.reply.replace(/\s+/g, "").includes(q.slice(0, Math.min(q.length, 12)))) { slipped++; continue; }
    }
    if (t) out.set(t.id, {
      rejected: r.rejected, accepted: r.rejected ? false : r.accepted === true,
      why: `${r.why} (${model})`, by: "ai", at,
      deliverableId: t.deliverable?.id ?? null,
      about: (r.about ?? "").trim(),
    });
  }
  if (slipped) console.warn(`[reaction] 밀려서 버린 줄 ${slipped}/${output.reactions.length} — 묶음 ${turns.length}개`);
  return out;
}

/**
 * 턴마다 반응을 돌려준다. 이미 읽어 둔 것은 그대로, 안 읽은 것은 모델로 읽어 **사람 말에 붙여 두고**, 모델이 없거나 죽으면 정규식.
 * `db` 가 있으면 붙여 둔다(없으면 읽기만).
 */
export async function labelReactions(
  turns: Turn[],
  opts: { ai?: AIProvider | null; db?: Supabase | null; batch?: number; /** 받아들였는지(`accepted`)까지 필요하다 — 옛 기록에 그 칸이 없으면 다시 읽는다. */ needAccepted?: boolean;
    /** 226회차: 무엇을 두고 한 말인지(`about`)까지 필요하다. 옛 기록엔 그 칸이 없어 다시 읽는다. */ needAbout?: boolean;
    /** 226회차: 저장된 것을 무시하고 다시 읽는다 — 밀려 붙은 옛 기록을 씻을 때. */ redo?: boolean } = {},
): Promise<Map<string, Reaction>> {
  const out = new Map<string, Reaction>();
  const todo: Turn[] = [];
  for (const t of turns) {
    const saved = (t.attachments?.reaction ?? null) as Reaction | null;
    const hasAbout = typeof saved?.about === "string";
    if (!opts.redo && saved && typeof saved.rejected === "boolean" && saved.by === "ai"
        && (!opts.needAccepted || typeof saved.accepted === "boolean")
        && (!opts.needAbout || hasAbout)) out.set(t.id, saved);
    else todo.push(t);
  }
  const regex = (t: Turn): Reaction => ({ rejected: CORRECTION.test(t.reply), why: "정규식", by: "regex", at: new Date().toISOString() });

  if (!opts.ai || todo.length === 0) {
    for (const t of todo) out.set(t.id, regex(t));
    return out;
  }
  const size = opts.batch ?? 25;
  for (let i = 0; i < todo.length; i += size) {
    const chunk = todo.slice(i, i + size);
    let got: Map<string, Reaction>;
    try { got = await readBatch(opts.ai, chunk); }
    catch (e) {
      console.warn("[반응] 모델이 못 읽었다 — 이 묶음은 정규식으로:", e instanceof Error ? e.message : e);
      for (const t of chunk) out.set(t.id, regex(t));
      continue;
    }
    for (const t of chunk) {
      const r = got.get(t.id) ?? regex(t);
      out.set(t.id, r);
      // 목(mock)이 읽은 것은 붙여 두지 않는다 — 붙이면 다음 진짜 판이 목의 답을 "AI 가 읽은 것" 으로 믿는다.
      if (opts.db && r.by === "ai" && opts.ai.name !== "mock") {
        const { error } = await opts.db.from("conversation_messages")
          .update({ attachments: { ...(t.attachments ?? {}), reaction: r } }).eq("id", t.id);
        if (error) console.warn("[반응] 못 붙였다:", error.message);
      }
    }
  }
  return out;
}
