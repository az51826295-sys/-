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
 * 붙었는데 **명시적 판정이 없는** 일의 수. 회사 하나 기준.
 *
 * **처음엔 "그 뒤에 사장님 말이 있었나" 로 쌀다 — 틀렸다** (사장님 09-21):
 * > *"결과물이 붙은 뒤 그 대화에 아무 말이나 하면 앞의 결과물 전부가 본 것으로 세어져요.
 * >  '밥 먹고 올게' 한마디로 상한이 풀릴 수 있다는 뜻이에요. … 재는 대상 자체가 목적과 어긋나 있어요."*
 *
 * **다만 이 딱지는 사장님이 누른 게 아니라 AI 가 사장님 말을 읽고 붙인 것이다** (사장님 09-21).
 * 사람 판정처럼 보이지만 실은 **모델 판정**이다. 우리 규칙대로라면 검증 전에는 판정에 쓸 수 없는 값이다.
 * 그래서 이 함수가 돌려주는 `judged` 는 **"사장님이 본 것" 이 아니라 "AI 가 판정으로 읽은 것"** 이다.
 * 딱지 몇 개를 사장님 말과 대조해 보기 전까지는 그 숫자를 믿지 않는다.
 *
 * 그래서 **딱지**를 본다. 결과물 바로 다음 사장님 말에 `attachments.reaction` 이 붙고(`reaction.ts`),
 * 그 안의 `accepted` / `rejected` 가 **좋음·안 좋음**이다. 둘 다 false 면 새 지시이거나 잡담이라
 * **판정이 아니다** — 안 본 것으로 센다. 딱지가 아예 없으면 더더욱 안 본 것이다.
 */
export async function pendingReview(db: Supabase, companyId: string, days = 30): Promise<{ n: number; titles: string[]; judged: number }> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data: co } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  if (!co) return { n: 0, titles: [], judged: 0 };
  const { data: convs } = await db.from("conversations").select("id").eq("owner_id", co.owner_id as string).limit(200);
  const ids = (convs ?? []).map((c) => c.id as string);
  if (!ids.length) return { n: 0, titles: [], judged: 0 };
  const { data: att } = await db.from("conversation_messages")
    .select("conversation_id, created_at, aid:attachments->assignment->>id, title:attachments->assignment->>title")
    .in("conversation_id", ids).gte("created_at", since).not("attachments->assignment->>id", "is", null)
    .order("created_at", { ascending: false }).limit(1000);
  if (!att?.length) return { n: 0, titles: [], judged: 0 };
  // 사장님 말 + 그 말에 붙은 딱지
  const { data: says } = await db.from("conversation_messages")
    .select("conversation_id, created_at, acc:attachments->reaction->>accepted, rej:attachments->reaction->>rejected")
    .in("conversation_id", ids).eq("role", "user").gte("created_at", since)
    .order("created_at", { ascending: true }).limit(3000);
  type S = { conversation_id: string; created_at: string; acc: string | null; rej: string | null };
  const byConv = new Map<string, S[]>();
  for (const m of (says ?? []) as unknown as S[]) {
    const l = byConv.get(m.conversation_id); if (l) l.push(m); else byConv.set(m.conversation_id, [m]);
  }
  const titles: string[] = [];
  const seen = new Set<string>();
  let judged = 0;
  for (const m of att as unknown as { conversation_id: string; created_at: string; aid: string; title: string | null }[]) {
    if (seen.has(m.aid)) continue;
    seen.add(m.aid);
    // **바로 다음** 사장님 말 하나만 본다(그 뒤 아무 말이 아니라).
    const next = (byConv.get(m.conversation_id) ?? []).find((x) => x.created_at > m.created_at);
    const ok = next ? next.acc === "true" || next.rej === "true" : false;
    if (ok) judged++; else titles.push(m.title ?? m.aid.slice(0, 8));
  }
  return { n: titles.length, titles, judged };
}

/** 문. 넘쳤으면 이유를 돌려준다. 안 넘쳤으면 null. */
export async function blockedByReviewQueue(db: Supabase, companyId: string, cap = REVIEW_CAP): Promise<string | null> {
  try {
    const { n } = await pendingReview(db, companyId);
    if (n < cap) return null;
    return `안 보신 결과물이 ${n}개 — 상한 ${cap}. 더 만들지 않고 기다린다(하나라도 보시면 다시 돈다)`;
  } catch { return null; } // 못 세면 평소대로 — 세는 실패로 회사를 멈추지 않는다
}
