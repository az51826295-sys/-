import type { Supabase } from "@/lib/execution/shared";
import { LOOKBACK, type ScoredRow } from "@/lib/genesis/predict";
import { isBadForLearning } from "@/lib/genesis/verdictLabel";

/**
 * 기계 판정으로 채점하기 (115회차 09-15).
 *
 * 예측 진화는 08-27부터 한 번도 안 돌았다. 이유는 늘 "판정 0건" — `work_prediction_scores` 뷰가 **사람 판정**
 * (`deliverable_reviews`)만 세는데 그게 0건이기 때문이다. 그런데 기계 판정은 111건이 이미 예측과 이어져 있다
 * (결과물 자동 판정 46 + 유니티 검사 65). 배울 재료가 없던 게 아니라, 세는 곳이 한 군데뿐이었다.
 *
 * **두 판정은 다른 질문이다.** 사람 판정은 "매니저가 수정 요청 없이 승인했나", 기계 판정은 "그 일이 자기 검사를
 * 통과했나". 그래서 섞지 않고 갈래를 나눠 두고, 어느 쪽으로 채점했는지 진화 기록에 적는다. 사람 판정이 충분히
 * 쌓이면 그쪽이 이긴다 — 마지막 칸은 사람이라는 원칙은 그대로다.
 *
 * 기계 판정이 채점 재료로 쓸 만한 이유: 합격 기준이 **결과물보다 먼저** 쓰였고(계획 단계), 유니티 검사는 컴파일·
 * 씬 열림·규격 같은 실제 사실을 잰다. 자기가 만든 답을 자기가 채점하는 것과는 다르다.
 */

type Pred = { work_execution_id: string | null; skill_id: string; basis: { features?: string[] } | null; committed_at: string };

export async function machineScoredRows(db: Supabase, companyId: string): Promise<ScoredRow[]> {
  const { data: preds } = await db
    .from("work_predictions")
    .select("work_execution_id, skill_id, basis, committed_at")
    .eq("company_id", companyId)
    .order("committed_at", { ascending: true })
    .limit(LOOKBACK);
  const P = ((preds ?? []) as Pred[]).filter((p) => p.work_execution_id);
  if (!P.length) return [];

  // ── 라벨 1: 결과물의 자동 판정(PASS / FAIL / PARTIAL)
  const { data: dels } = await db
    .from("deliverables")
    .select("id, work_execution_id, verdict:content_json->verdict")
    .eq("company_id", companyId);
  const D = (dels ?? []) as { id: string; work_execution_id: string | null; verdict: { verdict?: string } | null }[];
  const label = new Map<string, number>();
  for (const d of D) {
    const name = d.verdict?.verdict;
    if (d.work_execution_id && (name === "PASS" || name === "FAIL" || name === "PARTIAL")) {
      // 129회차: 주장형 판정(분석)은 비율로 — 99개 중 97개 맞힌 판을 '승인 안 됨' 으로 채점하면 예측이 '말을 아껴라' 를 배운다.
      label.set(d.work_execution_id, isBadForLearning(d.verdict as never) ? 0 : 1);
    }
  }

  // ── 라벨 2: 유니티 검사 턴("통과 N · 실패 M") — 결과물 표에는 없고 대화 첨부에만 있다(104회차).
  const execOfDel = new Map(D.map((d) => [d.id, d.work_execution_id]));
  const { data: co } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  const owner = (co?.owner_id as string | undefined) ?? null;
  if (owner) {
    const { data: convs } = await db.from("conversations").select("id").eq("owner_id", owner).limit(200);
    const convIds = ((convs ?? []) as { id: string }[]).map((c) => c.id);
    if (convIds.length) {
      const { data: checks } = await db
        .from("conversation_messages")
        .select("content, created_at, unity:attachments->unityChecks")
        .in("conversation_id", convIds)
        .not("attachments->unityChecks", "is", null)
        .order("created_at", { ascending: true });
      for (const m of (checks ?? []) as { content: string; unity: { deliverableId?: string } | null }[]) {
        const hit = m.content.match(/통과 (\d+) · (?:실패|떨어짐) (\d+)/);
        const exec = m.unity?.deliverableId ? execOfDel.get(m.unity.deliverableId) : null;
        if (hit && exec) label.set(exec, Number(hit[2]) === 0 ? 1 : 0); // 같은 결과물을 여러 번 쟀으면 마지막 판정
      }
    }
  }

  return P.flatMap((p) => {
    const y = label.get(p.work_execution_id!);
    if (y === undefined) return [];
    return [{ skill_id: p.skill_id, approved: y, basis: p.basis, committed_at: p.committed_at }];
  });
}
