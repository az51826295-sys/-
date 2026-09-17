import type { Supabase } from "@/lib/execution/shared";
import type { AIProvider } from "@/lib/providers/types";
import { labelReactions, type Reaction, type Turn } from "@/lib/genesis/reaction";

/**
 * **행동에서 판정 읽기** (169회차 2026-09-18, 1단계).
 *
 * 사장님: *"승인 단추 0건 — 이건 자동으로 하게 만들자."*
 * AI 가 대신 승인하게 만들지는 않는다 — 최초 계획 제3조: *"AI가 자기 채점을 하는 순간 Genesis는 그 자리에서 죽는다."*
 * 대신 **단추를 안 눌러도, 결과를 받고 사장님이 한 다음 행동이 판정이 된다.** 그건 여전히 사람의 판정이다:
 *
 *   결과를 받고 한 말이 그것을 **물렸다**(고쳐라·아니다·쓰레기)           → needs_changes (이유 = 그 말 원문)
 *   **버렸다**(미리보기의 버리기)                                        → rejected
 *   그 결과를 **받아들였다**(좋다·그걸 두고/재료로 다음 걸 해 달라)          → approved  ("물리지 않았다"만으로는 아니다)
 *   받고 아무 말이 없다 · 그냥 이야기만 했다                              → **모름.** 침묵을 승인으로 세지 않는다 — 그러면 굶는 걸 배부르다고 읽게 된다.
 *
 * "물렸는가"는 낱말이 아니라 뜻이라 `reaction.ts`(156회차)가 읽는다 — **모델이 일을 채점하는 게 아니라 사람이 쓴 글을 읽는 것**이다.
 * 읽은 것은 그 사람 말에 붙여 둔다(`attachments.reaction`) — 같은 말을 두 번 사지 않는다. 정규식으로 읽은 것은 판정으로 안 쓴다(135건 중 34건이 어긋났다).
 * 첫 "고쳐 달라"가 "추가해 줘"와 같은 배관(지난 판 위에서 이어 가기)을 타기 때문에, 업무 연결만 보고는 불만과 이어 가기를 가를 수 없다 — 그래서 말을 읽는다.
 * 저장하는 것은 읽은 반응뿐이다. 판정 자체는 읽을 때마다 기록에서 다시 센다(새 표 없음). 단추로 누른 판정이 있으면 부르는 쪽에서 그쪽이 이긴다.
 */

export type ImplicitVerdict = { deliverableId: string; approved: 0 | 1; how: "rejected_in_words" | "discarded" | "built_on" | "accepted_in_words"; evidence: string; at: string };

export type ReturnedTurn = {
  deliverableId: string;
  discarded: boolean;
  /** 결과를 받기 전에 시킨 말 · 돌아온 결과 글(앞부분) — 반응을 읽는 쪽에 맥락으로 간다. */
  order: string; answer: string;
  /** 결과를 받고 사람이 한 첫 말. 없으면 null(모름). */
  next: { id: string; content: string; attachments: Record<string, unknown> | null; at: string; startedWork: boolean } | null;
};

type Msg = { id: string; conversation_id: string; role: string; content: string; attachments: Record<string, unknown> | null; created_at: string };

/** 대화 기록 → 돌아온 결과마다 "그 뒤 사람의 첫 말". 순수 계산. */
export function returnedTurns(messages: Msg[]): ReturnedTurn[] {
  const byConv = new Map<string, Msg[]>();
  for (const m of messages) (byConv.get(m.conversation_id) ?? byConv.set(m.conversation_id, []).get(m.conversation_id)!).push(m);
  const out: ReturnedTurn[] = [];
  for (const list of byConv.values()) {
    list.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    list.forEach((m, i) => {
      const ret = m.attachments?.returned as { deliverableId?: string; discarded?: boolean } | undefined;
      if (m.role !== "assistant" || !ret?.deliverableId) return;
      const order = [...list.slice(0, i)].reverse().find((x) => x.role === "user")?.content ?? "";
      let next: ReturnedTurn["next"] = null;
      for (let j = i + 1; j < list.length; j++) {
        const x = list[j];
        if (x.role !== "user") continue;
        // 그 말에 대한 답(바로 뒤 assistant 턴)이 업무를 달고 있으면 그 말로 일이 시작된 것이다. '시작' 같은 계획 확인 답은 새 일이 아니다.
        const after = list.slice(j + 1).find((y) => y.role === "assistant");
        const startedWork = !!(after?.attachments as { assignment?: { id?: string } } | null)?.assignment?.id && !(after?.attachments as { approval?: unknown } | null)?.approval;
        next = { id: x.id, content: x.content, attachments: x.attachments, at: x.created_at, startedWork };
        break;
      }
      out.push({ deliverableId: ret.deliverableId, discarded: ret.discarded === true, order, answer: m.content.slice(0, 500), next });
    });
  }
  return out;
}

/** 순수 계산. `reactions` 는 사람 말 id → 읽은 반응. AI 가 읽은 것만 판정으로 쓴다. */
export function implicitFrom(turns: ReturnedTurn[], reactions: Map<string, Reaction>): ImplicitVerdict[] {
  const out = new Map<string, ImplicitVerdict>();
  for (const t of turns) {
    if (t.discarded) { out.set(t.deliverableId, { deliverableId: t.deliverableId, approved: 0, how: "discarded", evidence: "버리기", at: t.next?.at ?? "" }); continue; }
    if (!t.next) continue;
    const r = reactions.get(t.next.id);
    if (!r || r.by !== "ai") continue; // 못 읽었으면 모름
    if (r.rejected) out.set(t.deliverableId, { deliverableId: t.deliverableId, approved: 0, how: "rejected_in_words", evidence: t.next.content.slice(0, 300), at: t.next.at });
    // "물리지 않았다"는 승인이 아니다(첫 실측: "투구 다시 만들자, 이번엔 규격 주고"가 승인으로 세어졌다). 읽는 쪽이 **받아들였다**고 읽은 것만.
    else if (r.accepted === true) out.set(t.deliverableId, { deliverableId: t.deliverableId, approved: 1, how: t.next.startedWork ? "built_on" : "accepted_in_words", evidence: t.next.content.slice(0, 300), at: t.next.at });
  }
  return [...out.values()];
}

/**
 * 이 회사의 암묵 판정. `ai` 를 주면 아직 안 읽은 말을 읽어서 붙여 두고(매일 실행이 이렇게 부른다), 안 주면 **이미 읽어 둔 것만** 쓴다(계기판·예측기 — 모델 0).
 */
export async function loadImplicit(db: Supabase, companyId: string, ai: AIProvider | null = null): Promise<{ verdicts: ImplicitVerdict[]; returned: number; withReply: number; read: number }> {
  const { data: co } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  if (!co?.owner_id) return { verdicts: [], returned: 0, withReply: 0, read: 0 };
  const { data: convs } = await db.from("conversations").select("id").eq("owner_id", co.owner_id as string).limit(500);
  const ids = ((convs ?? []) as { id: string }[]).map((c) => c.id);
  if (!ids.length) return { verdicts: [], returned: 0, withReply: 0, read: 0 };
  const messages: Msg[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const { data } = await db.from("conversation_messages").select("id, conversation_id, role, content, attachments, created_at").in("conversation_id", ids.slice(i, i + 50)).order("created_at", { ascending: true }).limit(5000);
    messages.push(...((data ?? []) as Msg[]));
  }
  const turns = returnedTurns(messages);
  const withNext = turns.filter((t) => t.next && !t.discarded);
  const asTurns: Turn[] = withNext.map((t) => ({ id: t.next!.id, order: t.order, answer: t.answer, reply: t.next!.content, attachments: t.next!.attachments }));
  const reactions = await labelReactions(asTurns, { ai, db: ai ? db : null, needAccepted: true });
  const read = [...reactions.values()].filter((r) => r.by === "ai").length;
  return { verdicts: implicitFrom(turns, reactions), returned: turns.length, withReply: withNext.length, read };
}
