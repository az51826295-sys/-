import type { Supabase } from "@/lib/execution/shared";

/**
 * **계기판 v0.1 — Genesis 가 살아 있는가** (168회차 2026-09-18).
 *
 * 사장님(09-18 00:5x): *"최초 계획 제네시스 프로젝트 실행. 지금 여건은 다 갖췄다."*
 *
 * 최초 계획은 `docs/genesis/phase-1-existence-drive.md`(07-29)다. 그 뒤 50일 동안 **기관**은 다 붙었다 — 예측 잠금(`predict.ts`),
 * 유전자 진화(`evolve.ts`), 검증된 규칙 고리(`ruleLoop.ts`), 매일 실행(`daily.ts`). 그런데 계획서의 **심장**은 한 번도 안 만들어졌다:
 *
 *     D = LP × Grounding − Cost      LP = (앞 창의 평균 예측오차 − 최근 창의 평균 예측오차) ÷ 투입 비용
 *
 * "나는 어제의 나보다 이 세계를 더 잘 예측하는가. 얼마나 빨리." — 이 숫자가 없어서 진화가 도는지 굶는지를 매번 사람이 손으로 셌다
 * (09-16 "자가진화는 굶고 있다" 도 손으로 센 것이다). 이 파일이 그 숫자다.
 *
 * 지키는 조항(계획서 5장):
 *   제1조 예측 잠금 — 여기서는 `work_predictions`(append-only, 서버 시각)만 읽는다. 예측을 만들지도 고치지도 않는다.
 *   제3조 채점권 분리 — 결과는 **사람**(`deliverable_reviews`)과 **현실**(유니티 검사)에서만 온다. 직원의 자기 보고(coverage)는
 *          안 쓴다(09-17 밤, 자기 보고 26/26 인 판이 사장님을 가장 화나게 한 판이었다). 결과물 자동 판정은 '기계' 로 따로 적는다.
 *   제5조 LP 는 계산되지 자기보고되지 않는다 — **모델을 부르지 않는다.** 전부 기록에서 센다.
 *
 * 공식은 숫자를 보기 전에 얼렸다(아래 상수). 못 재는 것은 0 이 아니라 **못 잼**이라고 적는다.
 */

/** 한 영역을 앞·뒤 창으로 가르려면 채점된 예측이 이만큼은 있어야 한다(창마다 4건). */
export const MIN_SCORED_FOR_LP = 8;
/** |LP| 가 이보다 작으면 "멈춤"이다(예측오차 0~1 눈금에서 2%p). */
export const LP_FLAT = 0.02;

export type Source = "human" | "reality" | "machine";
export type Scored = { skill: string; p: number; y: 0 | 1; at: string; source: Source; executionId: string | null; costUsd: number };

export type DomainVitals = {
  skill: string;
  committed: number;          // 커밋된 예측
  scored: number;             // 바깥에서 채점된 것
  grounding: number;          // scored / committed — 채점 안 된 예측은 땅에 안 닿은 것이다
  bySource: Record<Source, number>;
  brier: number | null;
  distinctP: number;          // 서로 다른 확률값의 수. 1 이면 예측이 아니라 상수다.
  lp: { prevErr: number; recentErr: number; delta: number; costUsd: number; perUsd: number | null; state: "배우는 중" | "멈춤" | "나빠지는 중" | "상수(예측 아님)" } | null;
  secondEncounter: { prevRate: number; recentRate: number; delta: number } | null; // 2회차 우위: 같은 유형을 다시 만났을 때 성공률
};

export type Vitals = {
  at: string;
  committed: number; scored: number; grounding: number;
  bySource: Record<Source, number>;
  brier: number | null; distinctP: number;
  calibration: { bucket: string; n: number; said: number; got: number }[];
  domains: DomainVitals[];
  hypotheses: { proposed: number; verified: number; rejected: number; rate: number | null }; // 실패 재현율의 대리: 규칙(원인 가설)이 블라인드 검증을 통과한 비율
  contradictions: null;       // 모순 해소율 — 모순을 적는 곳이 아직 없다. 못 잼.
  alive: { verdict: "살아 있다" | "굶고 있다" | "멈춰 있다" | "못 잰다"; why: string };
};

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** 순수 계산. 기록 → 계기판. (자 `genesis_vitals.mts` 가 고장을 넣어 시험한다.) */
export function computeVitals(committedBySkill: Record<string, { n: number; ps: number[] }>, scored: Scored[], hyp: { verified: number; rejected: number; pending: number }, now = new Date()): Vitals {
  const bySourceOf = (rows: Scored[]) => ({ human: rows.filter((r) => r.source === "human").length, reality: rows.filter((r) => r.source === "reality").length, machine: rows.filter((r) => r.source === "machine").length });
  const domains: DomainVitals[] = Object.entries(committedBySkill).map(([skill, c]) => {
    const rows = scored.filter((r) => r.skill === skill).sort((a, b) => (a.at < b.at ? -1 : 1));
    let lp: DomainVitals["lp"] = null, second: DomainVitals["secondEncounter"] = null;
    if (rows.length >= MIN_SCORED_FOR_LP) {
      const half = Math.floor(rows.length / 2);
      const prev = rows.slice(0, half), recent = rows.slice(half);
      const prevErr = mean(prev.map((r) => Math.abs(r.p - r.y))), recentErr = mean(recent.map((r) => Math.abs(r.p - r.y)));
      const delta = prevErr - recentErr;
      const costUsd = recent.reduce((s, r) => s + r.costUsd, 0);
      // 첫 실측(09-18)이 잡은 계기판의 구멍: 확률이 전부 0.700 인 영역이 "배우는 중" 으로 나왔다. 상수의 오차는 **세계가 바뀌면**
      // (성공률 0.7→1.0) 저절로 준다 — 배운 게 아니다. 채점된 예측의 확률값이 한 가지뿐이면 LP 를 학습으로 읽지 않는다.
      const constant = new Set(rows.map((r) => r.p.toFixed(3))).size <= 1;
      lp = { prevErr: r3(prevErr), recentErr: r3(recentErr), delta: r3(delta), costUsd: r3(costUsd), perUsd: costUsd > 0 ? r3(delta / costUsd) : null, state: constant ? "상수(예측 아님)" : delta > LP_FLAT ? "배우는 중" : delta < -LP_FLAT ? "나빠지는 중" : "멈춤" };
      const pr = mean(prev.map((r) => r.y)), rr = mean(recent.map((r) => r.y));
      second = { prevRate: r3(pr), recentRate: r3(rr), delta: r3(rr - pr) };
    }
    return {
      skill, committed: c.n, scored: rows.length, grounding: c.n ? r3(rows.length / c.n) : 0, bySource: bySourceOf(rows),
      brier: rows.length ? r3(mean(rows.map((r) => (r.p - r.y) ** 2))) : null,
      distinctP: new Set(c.ps.map((p) => p.toFixed(3))).size, lp, secondEncounter: second,
    };
  }).sort((a, b) => b.committed - a.committed);

  const committed = domains.reduce((s, d) => s + d.committed, 0);
  const allPs = Object.values(committedBySkill).flatMap((c) => c.ps);
  const buckets = [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]] as const;
  const calibration = buckets.map(([lo, hi]) => {
    const rows = scored.filter((r) => r.p >= lo && r.p < hi);
    return { bucket: `${lo.toFixed(1)}~${Math.min(hi, 1).toFixed(1)}`, n: rows.length, said: r3(mean(rows.map((r) => r.p))), got: r3(mean(rows.map((r) => r.y))) };
  }).filter((b) => b.n > 0);

  const decided = hyp.verified + hyp.rejected;
  const learning = domains.filter((d) => d.lp?.state === "배우는 중");
  const measurable = domains.filter((d) => d.lp);
  const distinctP = new Set(allPs.map((p) => p.toFixed(3))).size;
  const grounding = committed ? r3(scored.length / committed) : 0;
  const alive: Vitals["alive"] =
    measurable.length === 0 ? { verdict: "못 잰다", why: `채점된 예측이 ${MIN_SCORED_FOR_LP}건 넘는 영역이 없다(채점 ${scored.length}/${committed}).` }
    : measurable.every((d) => d.lp!.state === "상수(예측 아님)") ? { verdict: "멈춰 있다", why: `잴 수 있는 영역 ${measurable.length}곳의 예측이 전부 상수다(${allPs[0]?.toFixed(3)}) — 예측이 아니라서 오차가 줄어도 배운 게 아니다.` }
    : learning.length > 0 ? { verdict: "살아 있다", why: `${learning.map((d) => `${d.skill}(오차 ${d.lp!.prevErr}→${d.lp!.recentErr})`).join(", ")} 에서 예측이 나아지고 있다.` }
    : grounding < 0.3 ? { verdict: "굶고 있다", why: `예측 ${committed}건 중 ${scored.length}건만 바깥에서 채점됐다(${Math.round(grounding * 100)}%) — 배울 재료가 안 들어온다.` }
    : { verdict: "멈춰 있다", why: `잴 수 있는 영역 ${measurable.length}곳 어디서도 예측오차가 줄지 않는다.` };

  return {
    at: now.toISOString(), committed, scored: scored.length, grounding, bySource: bySourceOf(scored),
    brier: scored.length ? r3(mean(scored.map((r) => (r.p - r.y) ** 2))) : null, distinctP, calibration, domains,
    hypotheses: { proposed: decided + hyp.pending, verified: hyp.verified, rejected: hyp.rejected, rate: decided ? r3(hyp.verified / decided) : null },
    contradictions: null, alive,
  };
}

/** 기록을 읽어 계기판을 만든다. 읽기만 한다. */
export async function loadVitals(db: Supabase, companyId: string): Promise<Vitals> {
  const { data: preds } = await db.from("work_predictions").select("assignment_id, work_execution_id, skill_id, p_approved, committed_at").eq("company_id", companyId).order("committed_at", { ascending: true }).limit(5000);
  const P = (preds ?? []) as { assignment_id: string; work_execution_id: string | null; skill_id: string; p_approved: number; committed_at: string }[];
  const committedBySkill: Record<string, { n: number; ps: number[] }> = {};
  for (const p of P) { const c = (committedBySkill[p.skill_id] ??= { n: 0, ps: [] }); c.n++; c.ps.push(Number(p.p_approved)); }

  // 비용: 그 실행에 실제로 쓴 돈(원장).
  const { data: usage } = await db.from("model_usage").select("work_execution_id, cost_usd").eq("company_id", companyId).not("work_execution_id", "is", null).limit(20000);
  const cost = new Map<string, number>();
  for (const u of (usage ?? []) as { work_execution_id: string; cost_usd: number }[]) cost.set(u.work_execution_id, (cost.get(u.work_execution_id) ?? 0) + Number(u.cost_usd));

  // 채점 1 — 사람: 첫 판정만(뷰가 그렇게 센다).
  const { data: human } = await db.from("work_prediction_scores").select("assignment_id, approved").eq("company_id", companyId);
  const humanY = new Map(((human ?? []) as { assignment_id: string; approved: number }[]).map((h) => [h.assignment_id, h.approved]));

  // 채점 2 — 현실(유니티 검사) · 3 — 기계(결과물 자동 판정). 자기 보고(coverage)는 어디에도 안 쓴다.
  const { data: dels } = await db.from("deliverables").select("id, work_execution_id, verdict:content_json->verdict").eq("company_id", companyId);
  const D = (dels ?? []) as { id: string; work_execution_id: string | null; verdict: { verdict?: string } | null }[];
  const machineY = new Map<string, 0 | 1>();
  for (const d of D) { const v = d.verdict?.verdict; if (d.work_execution_id && (v === "PASS" || v === "FAIL" || v === "PARTIAL")) machineY.set(d.work_execution_id, v === "PASS" ? 1 : 0); }
  const execOfDel = new Map(D.map((d) => [d.id, d.work_execution_id]));
  const realityY = new Map<string, 0 | 1>();
  const { data: co } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  if (co?.owner_id) {
    const { data: convs } = await db.from("conversations").select("id").eq("owner_id", co.owner_id as string).limit(500);
    const ids = ((convs ?? []) as { id: string }[]).map((c) => c.id);
    if (ids.length) {
      const { data: checks } = await db.from("conversation_messages").select("content, unity:attachments->unityChecks").in("conversation_id", ids).not("attachments->unityChecks", "is", null).order("created_at", { ascending: true });
      for (const m of (checks ?? []) as { content: string; unity: { deliverableId?: string } | null }[]) {
        const hit = m.content.match(/통과 (\d+) · (?:실패|떨어짐|어긋남) (\d+)/);
        const exec = m.unity?.deliverableId ? execOfDel.get(m.unity.deliverableId) : null;
        if (hit && exec) realityY.set(exec, Number(hit[2]) === 0 ? 1 : 0);
      }
    }
  }

  // 한 예측에 채점이 여럿이면: 사람 > 현실 > 기계.
  const scored: Scored[] = [];
  for (const p of P) {
    const e = p.work_execution_id;
    const pick: [Source, number | undefined][] = [["human", humanY.get(p.assignment_id)], ["reality", e ? realityY.get(e) : undefined], ["machine", e ? machineY.get(e) : undefined]];
    const got = pick.find(([, y]) => y !== undefined);
    if (got) scored.push({ skill: p.skill_id, p: Number(p.p_approved), y: got[1] ? 1 : 0, at: p.committed_at, source: got[0], executionId: e, costUsd: e ? cost.get(e) ?? 0 : 0 });
  }

  // 원인 가설(규칙)이 블라인드 검증을 통과했나.
  const { data: lc } = await db.from("learning_candidates").select("status").eq("company_id", companyId).limit(2000);
  const st = ((lc ?? []) as { status: string }[]).map((r) => r.status);
  const hyp = { verified: st.filter((s) => s === "approved").length, rejected: st.filter((s) => s === "rejected").length, pending: st.filter((s) => s !== "approved" && s !== "rejected").length };

  return computeVitals(committedBySkill, scored, hyp);
}
