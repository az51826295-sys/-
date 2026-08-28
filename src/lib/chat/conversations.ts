import type { Supabase } from "@/lib/execution/shared";

/**
 * 대화 저장.
 *
 * 로그인한 사람만 남는다. 익명 대화는 브라우저에만 있다 — 주인이 없는 대화를
 * 서버에 쌓으면 나중에 지울 사람도 없고, 그건 보관이 아니라 방치다.
 *
 * 제목은 **첫 사용자 메시지를 잘라서** 만든다. 모델을 한 번 더 부르면 대화마다
 * 값이 붙는데, 목록에서 알아보는 데는 첫 문장이면 충분하다. 나중에 더 나은
 * 제목이 필요해지면 그때 바꿔도 이 표는 그대로다.
 */

export type SavedMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: unknown;
};

const TITLE_MAX = 60;

function titleFrom(text: string): string {
  const line = text.trim().split("\n")[0];
  return line.length > TITLE_MAX ? line.slice(0, TITLE_MAX) + "…" : line;
}

/**
 * 한 턴을 저장하고 대화 id 를 돌려준다.
 *
 * **저장 실패가 대화를 죽이지 않는다.** 답은 이미 만들어졌고, 그것을 사용자에게
 * 못 주는 것보다 기록이 한 줄 빠지는 편이 낫다. 실패는 null 로 조용히 나가되
 * 호출하는 쪽이 그걸 알 수 있게 한다.
 */
export async function saveTurn(
  db: Supabase,
  ownerId: string,
  args: {
    conversationId: string | null;
    mode: "everyday" | "company";
    user: SavedMessage;
    assistant: SavedMessage;
    /** 이 대화가 속한 과제. 새 대화에만 붙는다 — 이미 있는 대화를 다른 과제로
     *  끌어가면, 그 과제를 열었을 때 없던 대화가 끼어 있게 된다. */
    taskId?: string | null;
  },
): Promise<string | null> {
  try {
    let id = args.conversationId;

    if (!id) {
      const { data } = await db
        .from("conversations")
        .insert({
          owner_id: ownerId,
          mode: args.mode,
          title: titleFrom(args.user.content),
          task_id: args.taskId ?? null,
        })
        .select("id")
        .single();
      id = (data?.id as string | undefined) ?? null;
      if (!id) return null;
    } else {
      // 목록을 최근 순으로 세우려면 이게 필요하다.
      await db
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_id", ownerId);
    }

    await db.from("conversation_messages").insert([
      {
        conversation_id: id,
        role: "user",
        content: args.user.content,
        attachments: args.user.attachments ?? null,
      },
      {
        conversation_id: id,
        role: "assistant",
        content: args.assistant.content,
        attachments: args.assistant.attachments ?? null,
      },
    ]);

    return id;
  } catch {
    return null;
  }
}

export async function listConversations(db: Supabase, ownerId: string) {
  const { data } = await db
    .from("conversations")
    .select("id, title, mode, updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []) as {
    id: string;
    title: string | null;
    mode: string;
    updated_at: string;
  }[];
}

export async function loadConversation(
  db: Supabase,
  ownerId: string,
  id: string,
) {
  const { data: conv } = await db
    .from("conversations")
    .select("id, title, mode")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!conv) return null;

  const { data: rows } = await db
    .from("conversation_messages")
    .select("role, content, attachments, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  return { conversation: conv, messages: rows ?? [] };
}

export async function deleteConversation(
  db: Supabase,
  ownerId: string,
  id: string,
): Promise<boolean> {
  const { error } = await db
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId);
  return !error;
}
