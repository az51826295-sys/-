import type { SupabaseClient } from "@supabase/supabase-js";

type Supabase = SupabaseClient;

/**
 * 판(버전).
 *
 * 09-06 사장님 결정(UI 방향 B): 대화 옆에 **현재 판**이 늘 보이고, 지난 판으로 되돌릴 수 있어야
 * 한다. 다른 회사들(Rosebud·Bezi·Unity)은 다 그렇다. 우리는 "고쳐 줘" 가 지난 판 위에 덮어썼고
 * 되돌리기가 없었다.
 *
 * 판은 새 표가 아니다. **대화에 돌아온 산출물의 차례**다. 결과 턴(`attachments.returned`)이
 * 붙은 순서대로 1판, 2판, … 이고, 되돌리기는 그 판을 가리키는 결과 턴을 하나 더 붙이는 것이다
 * (`attachments.revert = true`). 그러면:
 * - "현재 판" = 가장 최근 결과 턴이 가리키는 산출물.
 * - 다음 "고쳐 줘" 는 `lastDeliverableInConversation` 이 그 턴을 보고 그 판 위에서 고친다.
 * - 유니티 창도 같은 규칙으로 최신 판을 받는다(`/api/unity/assets`).
 * 표를 안 늘려서 옛 대화도 그대로 판이 매겨진다.
 */
export type Version = {
  n: number;
  deliverableId: string;
  assignmentId: string;
  /** 이 판이 처음 돌아온 시각 */
  at: string;
  /** 지금 현재 판인가 */
  current: boolean;
};

type ReturnedRow = {
  created_at: string;
  returned: { deliverableId?: string; assignmentId?: string } | null;
  revert: boolean | null;
};

/** 대화의 판 목록(오래된 것부터)과 현재 판. 결과 턴만 읽는다 — attachments 전체를 끌지 않는다. */
export async function listVersions(db: Supabase, conversationId: string): Promise<Version[]> {
  const { data } = await db
    .from("conversation_messages")
    .select("created_at, returned:attachments->returned, revert:attachments->revert")
    .eq("conversation_id", conversationId)
    .not("attachments->returned", "is", null)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as ReturnedRow[];
  const versions: Version[] = [];
  let currentId: string | null = null;
  for (const r of rows) {
    const d = r.returned?.deliverableId;
    const a = r.returned?.assignmentId;
    if (typeof d !== "string" || typeof a !== "string") continue;
    currentId = d;
    if (versions.some((v) => v.deliverableId === d)) continue; // 되돌리기 턴은 새 판이 아니다
    versions.push({ n: versions.length + 1, deliverableId: d, assignmentId: a, at: r.created_at, current: false });
  }
  for (const v of versions) v.current = v.deliverableId === currentId;
  return versions;
}

/**
 * 회사의 **현재** 게임 버전(app_build). 만든 순서가 아니라 **대화에 마지막으로 붙은 순서**다 —
 * 그래야 "이 버전으로 복원" 이 유니티에도 먹는다. 되돌리기 턴도 결과 턴이니 같은 규칙으로 잡힌다.
 */
export async function currentBuildForCompany(
  db: Supabase,
  companyId: string,
): Promise<{ id: string; title: string; created_at: string } | null> {
  const { data: company } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  if (!company) return null;
  const { data: convs } = await db.from("conversations").select("id").eq("owner_id", company.owner_id);
  const convIds = (convs ?? []).map((c) => c.id as string);
  if (convIds.length === 0) return null;
  const { data: msgs } = await db
    .from("conversation_messages")
    .select("deliverableId:attachments->returned->>deliverableId")
    .in("conversation_id", convIds)
    .not("attachments->returned", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);
  const ids: string[] = [];
  for (const m of (msgs ?? []) as unknown as { deliverableId: string | null }[]) {
    if (m.deliverableId && !ids.includes(m.deliverableId)) ids.push(m.deliverableId);
  }
  if (ids.length === 0) return null;
  const { data: rows } = await db
    .from("deliverables")
    .select("id, title, created_at, deliverable_type")
    .in("id", ids)
    .eq("company_id", companyId)
    .eq("deliverable_type", "app_build");
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  for (const id of ids) {
    const r = byId.get(id);
    if (r) return { id: r.id as string, title: r.title as string, created_at: r.created_at as string };
  }
  return null;
}
