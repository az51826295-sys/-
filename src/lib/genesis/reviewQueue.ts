import type { SupabaseClient } from "@supabase/supabase-js";

type Supabase = SupabaseClient;

/**
 * **검토 대기열 상한** (204회차 09-21, 사장님 지적 3).
 *
 * > *"병목은 20시간이 아니라 검토 대기열이에요. 200개 중 35개만 판정된 상태에서 평일 산출물이 더
 * >  쌓이면, 주말 2.5시간이 읽는 데 다 가요. '사장님 판정이 필요한 것 N개' 상한을 붙이세요.
 * >  넘치면 로키가 더 만들지 말고 기다리는 쪽으로요."*
 *
 * **안 본 산출물이란**: 대화에 붙었는데 그 뒤로 사장님이 아무 말도 안 한 것.
 * 사람 판정은 따로 저장되는 표가 없다 — 행동에서 읽는다(`implicit.ts`). 그래서 "붙은 뒤에 말이 있었나"
 * 하나로 센다. 말이 있었으면 그게 물렸든 버렸든 받아들였든 **판정은 일어난 것**이다.
 *
 * 이 문은 **평일 무인 가동의 문**이기도 하다. 사장님: *"평일 가동이 곧 무인 판이에요."*
 * 무인 판의 `humanReviewCap` 과 같은 장치를 평상시로 옮긴 것이다.
 */

/** 넘으면 새 일을 안 집는다. 주말 2~3시간에 읽을 수 있는 양으로 잡았다. */
export const REVIEW_CAP = 10;

/**
 * 붙었는데 그 뒤로 사장님 말이 없는 일의 수. 회사 하나 기준.
 *
 * **열 이름을 직접 보고 썼다** (09-21). 첫 판에 `attachments.assignment.deliverableId` 를 읽었는데
 * 그 칸은 없다 — 실제 모양은 `{id, title, queued}` 다. 자가 없는 칸을 읽고 **0을 냈다.**
 * 사장님: *"도구가 '0' 이라고 할 때도 똑같이 의심하라는 신호예요."*
 */
export async function pendingReview(db: Supabase, companyId: string, days = 30): Promise<{ n: number; titles: string[] }> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data: co } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  if (!co) return { n: 0, titles: [] };
  const { data: convs } = await db.from("conversations").select("id").eq("owner_id", co.owner_id as string).limit(200);
  const ids = (convs ?? []).map((c) => c.id as string);
  if (!ids.length) return { n: 0, titles: [] };
  // 일이 붙은 턴만 — 작은 집합이다(전체 대화를 읽지 않는다).
  const { data: att } = await db.from("conversation_messages")
    .select("conversation_id, created_at, aid:attachments->assignment->>id, title:attachments->assignment->>title")
    .in("conversation_id", ids).gte("created_at", since).not("attachments->assignment->>id", "is", null)
    .order("created_at", { ascending: false }).limit(1000);
  if (!att?.length) return { n: 0, titles: [] };
  // 그 대화들의 사장님 말 시각만
  const { data: says } = await db.from("conversation_messages")
    .select("conversation_id, created_at").in("conversation_id", ids).eq("role", "user").gte("created_at", since)
    .order("created_at", { ascending: false }).limit(2000);
  const lastSaid = new Map<string, string>();
  for (const m of says ?? []) { // 내림차순이라 처음 만나는 것이 제일 늦다
    const k = m.conversation_id as string;
    if (!lastSaid.has(k)) lastSaid.set(k, m.created_at as string);
  }
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const m of att as unknown as { conversation_id: string; created_at: string; aid: string; title: string | null }[]) {
    if (seen.has(m.aid)) continue;
    seen.add(m.aid);
    const said = lastSaid.get(m.conversation_id);
    if (!said || said <= m.created_at) titles.push(m.title ?? m.aid.slice(0, 8));
  }
  return { n: titles.length, titles };
}

/** 문. 넘쳤으면 이유를 돌려준다. 안 넘쳤으면 null. */
export async function blockedByReviewQueue(db: Supabase, companyId: string, cap = REVIEW_CAP): Promise<string | null> {
  try {
    const { n } = await pendingReview(db, companyId);
    if (n < cap) return null;
    return `안 보신 결과물이 ${n}개 — 상한 ${cap}. 더 만들지 않고 기다린다(하나라도 보시면 다시 돈다)`;
  } catch { return null; } // 못 세면 평소대로 — 세는 실패로 회사를 멈추지 않는다
}
