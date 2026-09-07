import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleAutoRetry } from "@/lib/execution/autoRetry";

type Supabase = SupabaseClient;

/**
 * 스스로 다시 — 게임 밖으로 (41회차 09-07).
 *
 * 로키의 대표 고리는 "자가 숫자를 낸다 → 떨어진 줄 → 같은 직원이 스스로 고친다" 인데, 오늘까지 그 고리는
 * **게임에만** 있었다(유니티 검사 문에서만 불렸다). Ana 는 "인용이 원문에 없다" 를, Vid 는 "첫 장면이 9.8초" 를
 * 이미 재고 있었는데 아무도 고치지 않았다 — 자가 있어도 고리가 없으면 사람이 읽고 다시 말해야 한다.
 *
 * 그래서 산출물이 저장된 직후 엔진이 여기를 부른다. 판정에 떨어진 줄이 있으면 같은 직원에게 그 줄만 고치는
 * 업무를 만든다(최대 3번). **판정을 낸 자가 있는 산출물만** 걸린다 — 자가 없는 종류(조사·문서)는 아무 일도 없다.
 */

/** 자를 가진 종류. app_build 는 유니티 검사 문이 따로 부르므로 여기서는 뺀다(그때는 판정이 아직 없다). */
const SELF_RETRY_TYPES = new Set(["analysis", "video"]);

type Verdict = { cases?: { name: string; result: string; message?: string | null }[] };

export async function selfRetryFromVerdict(
  db: Supabase,
  deliverableId: string,
  deliverableType: string,
): Promise<{ scheduled: false; why: string } | { scheduled: true; n: number; assignmentId: string }> {
  if (!SELF_RETRY_TYPES.has(deliverableType)) return { scheduled: false, why: `${deliverableType} 는 자가 없다` };

  const { data } = await db
    .from("deliverables")
    .select("v:content_json->verdict")
    .eq("id", deliverableId)
    .maybeSingle();
  const verdict = ((data as { v?: Verdict | null } | null)?.v ?? {}) as Verdict;
  const failed = (verdict.cases ?? [])
    .filter((c) => c.result === "Failed")
    .map((c) => `${c.name}${c.message ? ` — ${String(c.message).slice(0, 300)}` : ""}`);
  if (!failed.length) return { scheduled: false, why: "떨어진 줄 없음" };

  // 42회차 점검: 열두 줄 중 한 줄이 떨어졌다고 **판 전체를 세 번 다시 사면** 그게 헛도는 판이다.
  // 다시 만드는 값이 아까우려면 떨어진 쪽이 통과한 쪽만큼은 돼야 한다(분석 skill 이 스스로 쓰는 기준과 같다).
  const passed = (verdict.cases ?? []).filter((c) => c.result === "Passed").length;
  if (failed.length < Math.max(1, passed)) {
    return { scheduled: false, why: `떨어진 줄 ${failed.length} < 통과 ${passed} — 사람이 보고 정한다` };
  }

  return scheduleAutoRetry(db, deliverableId, failed, null);
}
