import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider } from "@/lib/providers/types";

/**
 * **섞어 보내기** (183회차 09-19). 사장님 "섞어 보내기".
 *
 * 09-14 모델 선택 표의 교훈: "딥시크 88% vs gpt-5 51%" 는 실력이 아니라 **라우팅이 만든 착시**였다 — 쉬운 일이 싼 자리로
 * 갔던 것. 자리를 자동으로 고르려면 먼저 **같은 종류의 일을 여러 자리에 섞어 보내서** 같은 심판이 본 성적표가 있어야 한다.
 *
 * 여기서는 **고치는 자리**(조각 고침)부터. 후보는 `FIX_SEAT_CANDIDATES`(기본 luna, deepseek-v4-flash — 시장조사 09-18 의 1순위).
 * 고르는 법은 구조다(말이 아니다):
 *   - 후보마다 기록(최근 30일, 이 회사가 아니라 회사 전체)이 `MIN_N` 미만이면 **기록이 제일 적은 후보**를 보낸다(고르게 쌓인다).
 *   - 다 채워졌으면 `SEAT_EXPLORE`(기본 0.3) 확률로 아무 후보나, 아니면 **성적이 제일 좋은 후보**(같으면 싼 쪽).
 * 성적 = 부탁 심판자가 되돌리지 않은 비율 + 고리 심판자가 "안 맞음 0" 으로 본 비율. 둘 다 같은 심판(luna)이 본다.
 *
 * 어느 자리가 고쳤는지는 산출물에 `seats.fix` 로 남는다 — 그게 없으면 성적표를 만들 수 없다.
 * 환경변수 `FIX_SEAT_MODEL` 이 있으면 섞지 않고 그 자리로만(되돌리기).
 */

export const MIN_N = 5;

export type SeatRecord = { model: string; n: number; judged: number; ok: number; sentBack: number; loopClean: number; loopSeen: number; usd: number; score: number };

/** 값(출력 100만 토큰) — 같은 성적이면 싼 쪽. 모르면 비싼 쪽으로 친다. */
const OUT_USD: Record<string, number> = { "gpt-5.6-luna": 1.2, "deepseek-v4-flash": 1.32, "deepseek-v4-pro": 3.96, "gpt-5.6-terra": 12, "gpt-5": 10, "gpt-5.3-codex": 14, "gpt-5-mini": 2 };

export function fixCandidates(): string[] {
  const raw = process.env.FIX_SEAT_CANDIDATES ?? "gpt-5.6-luna,deepseek-v4-flash";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** 후보별 성적표 — 산출물(app_build)의 `seats.fix` 와 심판 기록에서 센다. 의견 0. */
export async function seatRecords(db: SupabaseClient, candidates: string[], days = 30): Promise<SeatRecord[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await db
    .from("deliverables")
    .select("work_execution_id, seats:content_json->seats, askJudge:content_json->askJudge, loop:content_json->loop")
    .eq("deliverable_type", "app_build")
    .gte("created_at", since)
    .not("content_json->seats", "is", null)
    .limit(500);
  type R = { work_execution_id: string | null; seats: { fix?: string } | null; askJudge: { verdict?: string; sentBack?: boolean } | null; loop: { rounds?: { unmet: number; broken: number }[] } | null };
  const rows = ((data ?? []) as unknown as R[]).filter((r) => r.seats?.fix && candidates.includes(r.seats.fix));
  const execIds = rows.map((r) => r.work_execution_id).filter((x): x is string => !!x);
  const usdBy = new Map<string, number>();
  if (execIds.length) {
    const { data: u } = await db.from("model_usage").select("work_execution_id, model, cost_usd").in("work_execution_id", execIds.slice(0, 300));
    for (const x of u ?? []) {
      const k = `${x.work_execution_id}|${x.model}`;
      usdBy.set(k, (usdBy.get(k) ?? 0) + Number(x.cost_usd ?? 0));
    }
  }
  return candidates.map((model) => {
    const mine = rows.filter((r) => r.seats!.fix === model);
    let ok = 0, sentBack = 0, loopClean = 0, loopSeen = 0, usd = 0;
    for (const r of mine) {
      if (r.askJudge) { if (r.askJudge.verdict !== "되돌린다") ok++; if (r.askJudge.sentBack) sentBack++; }
      const last = r.loop?.rounds?.[r.loop.rounds.length - 1];
      if (last) { loopSeen++; if (last.unmet === 0 && last.broken === 0) loopClean++; }
      if (r.work_execution_id) usd += usdBy.get(`${r.work_execution_id}|${model}`) ?? 0;
    }
    const n = mine.length;
    const judged = mine.filter((r) => r.askJudge).length;
    // 성적: 부탁 심판 통과율과 고리 통과율의 평균(있는 것만). 기록이 없으면 0.
    const parts = [judged ? ok / judged : null, loopSeen ? loopClean / loopSeen : null].filter((x): x is number => x !== null);
    const score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
    return { model, n, judged, ok, sentBack, loopClean, loopSeen, usd: n ? usd / n : 0, score };
  });
}

export type SeatPick = { model: string; why: string; records: SeatRecord[]; explored: boolean };

/** 고치는 자리를 고른다. 환경변수가 박혀 있으면 그것, 아니면 섞어 보내기. */
export async function pickFixSeat(db: SupabaseClient, rnd: () => number = Math.random): Promise<SeatPick> {
  const fixed = process.env.FIX_SEAT_MODEL;
  const candidates = fixCandidates();
  if (fixed && fixed !== "mix") return { model: fixed, why: "FIX_SEAT_MODEL 로 박아 둔 자리", records: [], explored: false };
  if (candidates.length === 1) return { model: candidates[0], why: "후보가 하나", records: [], explored: false };
  let records: SeatRecord[] = [];
  try { records = await seatRecords(db, candidates); } catch { /* 장부를 못 읽으면 기본 자리 */ }
  if (!records.length) return { model: candidates[0], why: "성적표를 못 읽어 첫 후보", records, explored: false };
  const thin = records.filter((r) => r.n < MIN_N);
  if (thin.length) {
    const pick = thin.reduce((a, b) => (b.n < a.n ? b : a));
    return { model: pick.model, why: `기록이 ${pick.n}판뿐이라 채우는 중(${MIN_N}판까지)`, records, explored: true };
  }
  const explore = Number(process.env.SEAT_EXPLORE ?? "0.3");
  if (rnd() < explore) {
    const pick = records[Math.floor(rnd() * records.length)];
    return { model: pick.model, why: `섞어 보내기(${Math.round(explore * 100)}%)`, records, explored: true };
  }
  const best = [...records].sort((a, b) => b.score - a.score || (OUT_USD[a.model] ?? 99) - (OUT_USD[b.model] ?? 99))[0];
  return { model: best.model, why: `성적 ${Math.round(best.score * 100)}% (${best.n}판) 로 제일 좋음`, records, explored: false };
}

/** 고른 자리를 실제 모델 자리로. openai 는 이름으로, deepseek 는 `deepseek-` 접두로 안다. 못 앉히면 null. */
export async function seatProvider(model: string): Promise<AIProvider | null> {
  try {
    if (model.startsWith("deepseek")) {
      if (!process.env.DEEPSEEK_API_KEY) return null;
      const { createDeepSeekProvider } = await import("@/lib/providers/deepseek");
      return createDeepSeekProvider({ judgmentModel: model });
    }
    if (!process.env.OPENAI_API_KEY) return null;
    const { createOpenAIProvider } = await import("@/lib/providers/openai");
    return createOpenAIProvider({ judgmentModel: model });
  } catch { return null; }
}

export function recordLine(r: SeatRecord): string {
  return `${r.model}: ${r.n}판 · 부탁 심판 통과 ${r.ok}/${r.judged} · 고리 깨끗 ${r.loopClean}/${r.loopSeen} · 판당 $${r.usd.toFixed(3)} · 성적 ${Math.round(r.score * 100)}%`;
}
