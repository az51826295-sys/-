import type { Supabase } from "@/lib/execution/shared";

/**
 * 과제 — 대화를 묶는 단위.
 *
 * 대화가 하나씩 흩어져 있으면 같은 일로 나눈 이야기가 목록에서 서로 남남이 된다.
 * "그때 그 스프라이트 얘기" 를 찾으려면 제목을 하나씩 열어 봐야 한다.
 *
 * **모든 대화가 과제에 속할 필요는 없다.** 지나가는 질문까지 과제로 만들게 하면,
 * 정리하려고 만든 것이 정리할 거리를 늘린다. 과제는 사람이 만들 때만 생긴다.
 */

export type Task = {
  id: string;
  title: string;
  goal: string | null;
  status: string;
  updated_at: string;
};

export async function listTasks(db: Supabase, ownerId: string): Promise<Task[]> {
  const { data } = await db
    .from("tasks")
    .select("id, title, goal, status, updated_at")
    .eq("owner_id", ownerId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []) as Task[];
}

export async function createTask(
  db: Supabase,
  ownerId: string,
  title: string,
  goal: string | null,
): Promise<Task | null> {
  const { data } = await db
    .from("tasks")
    .insert({ owner_id: ownerId, title: title.slice(0, 120), goal })
    .select("id, title, goal, status, updated_at")
    .maybeSingle();
  return (data as Task | null) ?? null;
}

/** 이 과제 안의 대화들. 과제를 열면 이것만 보인다. */
export async function conversationsIn(
  db: Supabase,
  ownerId: string,
  taskId: string,
) {
  const { data } = await db
    .from("conversations")
    .select("id, title, updated_at")
    .eq("owner_id", ownerId)
    .eq("task_id", taskId)
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []) as { id: string; title: string | null; updated_at: string }[];
}

/**
 * 이 대화를 과제에 넣는다.
 *
 * 대화가 이미 다른 과제에 있으면 옮긴다 — 한 대화가 두 과제에 있으면 어느 쪽을
 * 열어도 반쪽만 보이고, 그건 묶어 준 것이 아니다.
 */
export async function assign(
  db: Supabase,
  ownerId: string,
  conversationId: string,
  taskId: string | null,
): Promise<boolean> {
  const { error } = await db
    .from("conversations")
    .update({ task_id: taskId })
    .eq("id", conversationId)
    .eq("owner_id", ownerId);
  if (!error && taskId) {
    // 목록을 최근 순으로 세우려면 과제도 같이 올라와야 한다.
    await db
      .from("tasks")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("owner_id", ownerId);
  }
  return !error;
}
