import type { SupabaseClient } from "@supabase/supabase-js";
import { meterProviders } from "@/lib/costs/meter";
import { checkAllowance, type SpendAllowance } from "@/lib/costs/allowance";
import { defaultProviders } from "@/lib/execution/shared";
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

export type SeatRecord = { model: string; n: number; judged: number; ok: number; sentBack: number; loopClean: number; loopSeen: number; usd: number; /** 판당 조각 고침 초(191회차, 사장님 "적은 돈·적은 시간·좋은 결과"). 기록 없으면 0. */ sec: number; score: number };

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
    .select("work_execution_id, seats:content_json->seats, askJudge:content_json->askJudge, loop:content_json->loop, patched:content_json->patched")
    .eq("deliverable_type", "app_build")
    .gte("created_at", since)
    .not("content_json->seats", "is", null)
    .limit(500);
  type R = { work_execution_id: string | null; seats: { fix?: string } | null; askJudge: { verdict?: string; sentBack?: boolean } | null; loop: { rounds?: { unmet: number; broken: number }[] } | null; patched: { ms?: number } | null };
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
    let ok = 0, sentBack = 0, loopClean = 0, loopSeen = 0, usd = 0, ms = 0, timed = 0;
    for (const r of mine) {
      if (r.askJudge) { if (r.askJudge.verdict !== "되돌린다") ok++; if (r.askJudge.sentBack) sentBack++; }
      const last = r.loop?.rounds?.[r.loop.rounds.length - 1];
      if (last) { loopSeen++; if (last.unmet === 0 && last.broken === 0) loopClean++; }
      if (r.work_execution_id) usd += usdBy.get(`${r.work_execution_id}|${model}`) ?? 0;
      if (typeof r.patched?.ms === "number") { ms += r.patched.ms; timed++; }
    }
    const n = mine.length;
    const judged = mine.filter((r) => r.askJudge).length;
    // 성적: 부탁 심판 통과율과 고리 통과율의 평균(있는 것만). 기록이 없으면 0.
    const parts = [judged ? ok / judged : null, loopSeen ? loopClean / loopSeen : null].filter((x): x is number => x !== null);
    const score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
    return { model, n, judged, ok, sentBack, loopClean, loopSeen, usd: n ? usd / n : 0, sec: timed ? Math.round(ms / timed / 1000) : 0, score };
  });
}

/** 어떻게 골랐나(192회차, 2단계 2번): fixed=환경변수, fill=성적표 채우는 중, explore=섞어 보내기, best=성적표로 고름. "머리가 고른 쪽(best)이 더 자주 이겼나" 를 이걸로 센다. */
export type SeatMode = "fixed" | "single" | "fill" | "explore" | "best";
export type SeatPick = { model: string; why: string; records: SeatRecord[]; explored: boolean; mode: SeatMode };

/** 고치는 자리를 고른다. 환경변수가 박혀 있으면 그것, 아니면 섞어 보내기. */
export async function pickFixSeat(db: SupabaseClient, rnd: () => number = Math.random): Promise<SeatPick> {
  const fixed = process.env.FIX_SEAT_MODEL;
  const candidates = fixCandidates();
  if (fixed && fixed !== "mix") return { model: fixed, why: "FIX_SEAT_MODEL 로 박아 둔 자리", records: [], explored: false, mode: "fixed" };
  if (candidates.length === 1) return { model: candidates[0], why: "후보가 하나", records: [], explored: false, mode: "single" };
  let records: SeatRecord[] = [];
  try { records = await seatRecords(db, candidates); } catch { /* 장부를 못 읽으면 기본 자리 */ }
  if (!records.length) return { model: candidates[0], why: "성적표를 못 읽어 첫 후보", records, explored: false, mode: "fill" };
  const thin = records.filter((r) => r.n < MIN_N);
  if (thin.length) {
    const pick = thin.reduce((a, b) => (b.n < a.n ? b : a));
    return { model: pick.model, why: `기록이 ${pick.n}판뿐이라 채우는 중(${MIN_N}판까지)`, records, explored: true, mode: "fill" };
  }
  const explore = Number(process.env.SEAT_EXPLORE ?? "0.3");
  if (rnd() < explore) {
    const pick = records[Math.floor(rnd() * records.length)];
    return { model: pick.model, why: `섞어 보내기(${Math.round(explore * 100)}%)`, records, explored: true, mode: "explore" };
  }
  // 같은 성적이면 **빠르고 싼 쪽**(사장님 09-19: 적은 돈·적은 시간·좋은 결과). 시간 기록이 없으면 값으로.
  const best = [...records].sort((a, b) => b.score - a.score || (a.sec && b.sec ? a.sec - b.sec : 0) || a.usd - b.usd || (OUT_USD[a.model] ?? 99) - (OUT_USD[b.model] ?? 99))[0];
  return { model: best.model, why: `성적 ${Math.round(best.score * 100)}% (${best.n}판) 로 제일 좋음`, records, explored: false, mode: "best" };
}

/**
 * **머리가 고른 쪽이 더 자주 이겼나** (192회차, 2단계의 끝 조건). 성적표로 고른 판(best)과 섞어 보낸 판(explore)의 통과율을 나란히 센다.
 * 통과 = 부탁 심판이 되돌리지 않았고, 고리가 봤다면 안 맞음·고장 0. 채우는 중(fill)은 셈에서 뺀다 — 그건 고른 게 아니다.
 */
export async function headWins(db: SupabaseClient, days = 30): Promise<{ best: { n: number; ok: number }; explore: { n: number; ok: number }; fill: { n: number; ok: number }; unmeasured: number; line: string }> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await db
    .from("deliverables")
    .select("seats:content_json->seats, askJudge:content_json->askJudge, loop:content_json->loop")
    .eq("deliverable_type", "app_build").gte("created_at", since).not("content_json->seats->>fixMode", "is", null).limit(500);
  type R = { seats: { fixMode?: string } | null; askJudge: { verdict?: string } | null; loop: { rounds?: { unmet: number; broken: number }[] } | null };
  const tally = { best: { n: 0, ok: 0 }, explore: { n: 0, ok: 0 }, fill: { n: 0, ok: 0 } };
  // **못 재 개수를 따로 센다** (204회차 09-21, 사장님):
  // *"안 돌 판을 통과에서도 분모에서도 빼면 통과율은 정직해지지만, 그 판들이 결산에서 사라질 수 있어요.
  //  오늘 고친 고장이 '조용히 건너뜀' 이었으니, 통과율 옆에 항상 '못 잼 N' 을 같이 찍게 해야 합니다."*
  let unmeasured = 0;
  for (const r of (data ?? []) as unknown as R[]) {
    const mode = r.seats?.fixMode as keyof typeof tally | undefined;
    if (!mode || !(mode in tally)) continue;
    const last = r.loop?.rounds?.[r.loop.rounds.length - 1];
    // **검사가 못 돌았으면 통과가 아니다** (204회차 09-21). 전에는 `!last` 일 때 통과로 쌀다 —
    // 그러면 고리가 `no_run` 으로 멈춘 판(HTML 이 없어 돌려 보지도 못한 판)이 성적표에 통과로 들어간다.
    // 어젠밤 무인 판에서 실제로 6판이 그렇게 들어갔다. **못 잼은 통과 쪽으로 반올림하지 않는다.**
    if (!last) { unmeasured++; continue; } // 재지 못한 판 — 분모에도 안 들어가지만 **세서 같이 보인다**
    const ok = r.askJudge?.verdict !== "되돌린다" && last.unmet === 0 && last.broken === 0;
    tally[mode].n++; if (ok) tally[mode].ok++;
  }
  const pct = (t: { n: number; ok: number }) => (t.n ? `${t.ok}/${t.n}` : "0/0");
  const enough = tally.best.n >= 5 && tally.explore.n >= 5;
  const verdict = !enough ? "아직 판이 모자라 못 센다(각 5판까지)" : tally.best.ok / tally.best.n > tally.explore.ok / tally.explore.n ? "성적표로 고른 쪽이 더 자주 이겼다" : tally.best.ok / tally.best.n < tally.explore.ok / tally.explore.n ? "섞어 보낸 쪽이 더 자주 이겼다 — 성적표가 틀렸거나 판이 쉽다" : "같다";
  return { ...tally, unmeasured, line: `머리가 고른 판 ${pct(tally.best)} · 섞어 본 판 ${pct(tally.explore)} · 채우는 판 ${pct(tally.fill)} · **못 잼 ${unmeasured}** → ${verdict}` };
}

/** 고른 자리를 실제 모델 자리로. openai 는 이름으로, deepseek 는 `deepseek-` 접두로 안다. 못 앉히면 null. */
export async function seatProvider(model: string): Promise<AIProvider | null> {
  try {
    if (model.startsWith("deepseek")) {
      if (!process.env.DEEPSEEK_API_KEY) return null;
      const { createDeepSeekProvider } = await import("@/lib/providers/deepseek");
      return createDeepSeekProvider({ judgmentModel: model, thinking: process.env.DEEPSEEK_SEAT_THINKING === "on" });
    }
    if (!process.env.OPENAI_API_KEY) return null;
    const { createOpenAIProvider } = await import("@/lib/providers/openai");
    return createOpenAIProvider({ judgmentModel: model });
  } catch { return null; }
}

/**
 * 221회차: 도구(손님 AI·다음 일 제안·자가 고침)가 앉힌 자리도 **회사 장부에 적는다.** 오늘 자가 고침 원장이 "$0.000" 을 찍었다 —
 * 돈은 나갔는데 model_usage 에 없어서 한도($21/30일)가 못 봤다(09-21 "바깥이 하나가 아니었다" 와 같은 구멍). 도구는 이 함수로 앉힌다.
 * 한도에 닿아 있으면 null 을 돌려 준다 — 도구도 회사와 같은 문을 지난다.
 */
export async function seatProviderForCompany(model: string, db: Parameters<typeof meterProviders>[1], companyId: string, opts: { ignoreLimit?: boolean } = {}): Promise<{ ai: AIProvider; allowance: SpendAllowance } | { ai: null; allowance: SpendAllowance; why: string }> {
  const allowance = await checkAllowance(db, companyId);
  if (allowance.exhausted && !opts.ignoreLimit) return { ai: null, allowance, why: `한도에 닿았다: 최근 ${allowance.windowDays}일 $${allowance.spentUsd.toFixed(2)} / $${allowance.limitUsd}` };
  const ai = await seatProvider(model);
  if (!ai) return { ai: null, allowance, why: "자리를 못 앉혔다(열쇠 없음)" };
  return { ai: meterProviders({ ...defaultProviders(), ai }, db, { companyId }).ai, allowance };
}

/**
 * 사장님이 읽는 "왜 이 AI인가" 한 줄 (184회차, 2단계 1번). **모델 이름을 쓰지 않는다** — 사장님은 그걸 모르고(머리 규칙), 이름이 새면 판단이 아니라 광고가 된다.
 * 말하는 것은 근거뿐: 몇 판 봤고, 얼마나 통과했고, 값이 얼마였는지.
 */
export function whyForPerson(pick: SeatPick): string {
  const me = pick.records.find((r) => r.model === pick.model);
  const others = pick.records.filter((r) => r.model !== pick.model);
  if (!me) return pick.why.includes("박아") ? "고치는 자리는 지정된 곳 하나로 갑니다." : "고치는 자리를 정하는 성적표가 아직 없어 기본 자리로 갑니다.";
  const passed = me.judged + me.loopSeen ? `지난 ${me.n}판 중 검토 통과 ${me.ok}/${me.judged}, 돌려 본 확인 통과 ${me.loopClean}/${me.loopSeen}` : `지난 ${me.n}판`;
  if (me.n < MIN_N) return `고치는 자리 후보 ${pick.records.length}곳을 번갈아 보내며 성적표를 채우는 중이에요(이 자리는 ${me.n}판째, ${MIN_N}판까지). 값은 판당 약 $${me.usd.toFixed(3)}.`;
  if (pick.explored) return `이번엔 성적 비교를 위해 다른 자리에도 보내 봤어요(10판 중 3판꼴). 이 자리는 ${passed}, 판당 약 $${me.usd.toFixed(3)}.`;
  const vs = others.length ? ` 다른 자리(${others.map((o) => `${Math.round(o.score * 100)}%·$${o.usd.toFixed(3)}`).join(", ")})보다 나았어요.` : "";
  return `${passed}로 성적 ${Math.round(me.score * 100)}%, 판당 약 $${me.usd.toFixed(3)} — 후보 중 제일 좋았던 자리예요.${vs}`;
}

export function recordLine(r: SeatRecord): string {
  return `${r.model}: ${r.n}판 · 부탁 심판 통과 ${r.ok}/${r.judged} · 고리 깨끗 ${r.loopClean}/${r.loopSeen} · 판당 $${r.usd.toFixed(3)}${r.sec ? ` · ${r.sec}초` : ""} · 성적 ${Math.round(r.score * 100)}%`;
}
