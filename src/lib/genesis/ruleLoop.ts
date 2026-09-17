import { z } from "zod";
import type { Supabase } from "@/lib/execution/shared";
import type { AIProvider } from "@/lib/providers/types";
import { collectCases, type LearnCase } from "./cases";
import { countsFrom, decide, isHoldout, ADOPT, type Counts } from "./ruleStats";

/**
 * 검증된 규칙 고리 (100회차 09-14, 사장님 "2,3"의 3).
 *
 * 옛 방식(learnFromChat): 대화에서 사실을 **바로** 활성 지식으로 넣는다 — 틀려도 아무도 모른다.
 * 새 방식(이 파일): 관측 → 제안 → **블라인드 검증** → 나아질 때만 채택. Genesis 실험 7A 에서 효과가 확인된 모양이다
 * (실패를 본 제안자가 무작위 최종치에 후보 5%로 도달, 결과 정보 없는 제안자는 무작위보다 나빴다).
 *
 *   1. 사례를 모은다(`cases.ts`) — 사례 id 로 정해진 60% 제안용 / 40% 보류(검증)용.
 *   2. 제안: 제안용 실패 사례(무엇이 잘못됐나 포함)와 성공 몇 개를 보여 주고 규칙 최대 3개를 받는다.
 *   3. 검증: 규칙마다 **보류 사례만**, 결과를 **가린 채** "이 사례는 규칙을 어겼나" 를 묻는다(규칙당 호출 1번).
 *   4. 셈(`ruleStats.ts`): 어긴 사례가 실제로 더 자주 실패했나 — lift·피셔 p·지지 수로 채택/기각.
 *   5. 기록: 모든 후보를 `learning_candidates` 에(승인=채택, 기각=rejected + 수치), 채택분만 `organization_knowledge` 활성으로 →
 *      다음 일부터 모든 직원의 프롬프트에 들어간다(`knowledge/retrieval.ts`).
 *
 * 돈: 회사당 하루 최대 6번(재검증 ≤2 + 제안 1 + 검증 ≤3), 싼 자리(routine). 진짜 모델은 GENESIS_SPEND=i-approve 일 때만 — 목(mock) 파일럿 먼저.
 *
 * 규칙의 수명(101회차): 채택은 그날 보류분에 대한 판정일 뿐이다. 보류분이 채택 때보다 RECHECK.growth 건 이상 늘면
 * 같은 규칙을 새 보류분에 다시 대 본다 — 문턱에 못 미치면 `deprecated` 로 내린다(프롬프트에서 빠짐). 한 번 붙은 규칙이
 * 영원히 남으면 프롬프트가 검증 안 된 문장으로 차오른다. 같은 보류분에 되풀이 판정하는 낭비는 growth 문턱이 막는다.
 */

export type RuleCandidate = { title: string; rule: string; violation_test: string; violating_cases: number[] };
export type RuleTrial = RuleCandidate & { counts: Counts; judged: number; lift: number | null; p: number; support: number; adopt: boolean; reason: string };
export type RuleRecheck = { knowledgeId: string; title: string; counts: Counts; judged: number; lift: number | null; p: number; holdoutBefore: number; holdoutNow: number; keep: boolean; reason: string };
export type RuleLoopResult = {
  skipped?: string;
  cases: { total: number; train: number; holdout: number; trainBad: number; holdoutBad: number; bySource: Record<string, number> };
  rechecks: RuleRecheck[];
  trials: RuleTrial[];
  adopted: number;
  wrote: boolean;
  calls: number;
};

const proposeSchema = z.object({
  rules: z.array(z.object({
    title: z.string(),
    rule: z.string(),
    violation_test: z.string(),
    // 151회차: **어긴 사례를 못 대면 규칙이 아니다.** 아래 PROPOSE_SYS 주석 참고.
    violating_cases: z.array(z.number()).describe("위에 보여 준 사례 중 **이 규칙을 실제로 어긴** 것의 번호. 3개 이상 못 대면 그 규칙은 내지 마라."),
  })).max(5),
});
const judgeSchema = z.object({
  judgments: z.array(z.object({ case: z.number(), violates: z.boolean() })),
});

const PROPOSE_SYS = [
  "너는 AI 사무실(로키)의 실패 기록을 읽고, **다음 일부터 지키면 실패가 줄어들 규칙**을 제안한다.",
  "",
  "좋은 규칙의 조건:",
  "- 실패 사례들에 **공통으로** 보이는 원인을 겨냥한다. 한 사례에만 맞는 규칙은 쓸모없다.",
  "- 짧고 행동으로 옮길 수 있다 (\"…할 때는 …한다\"). 직원 누구나 읽고 바로 따를 수 있게.",
  "- **어겼는지 판별할 수 있다**: violation_test 에 '요청과 결과물만 보고 어떻게 알아보나' 를 적는다.",
  "  결과(성공/실패)를 보지 않고도 판별할 수 있어야 한다 — 나중에 결과를 가린 채 이 기준으로 검사한다.",
  "- 성공 사례에서 이미 지켜지고 있는지도 본다. 성공 사례도 어기는 규칙이라면 실패의 원인이 아니다.",
  // 151회차 — 여기가 자가진화가 굶던 자리다. 09-13~09-16 에 낸 규칙 18개 중 **11개가 '어긴 사례 0건' 으로 떨어졌다.**
  // 사례 본문에 흔적이 남지 않는 것을 겨냥했기 때문이다("코드를 내기 전에 컴파일 가능성을 검증한다" — 결과물 글만 봐서는
  // 검증했는지 알 길이 없다). 그런 규칙은 아무도 안 어긴 것으로 세어져 **판단 불가**가 되고, 그때마다 판정 호출 한 번이 헛나갔다.
  // 그래서 이제 **번호를 대게 한다** — 못 대면 규칙이 아니라 바람이다.
  "",
  "**어긴 사례 번호를 대라 (violating_cases).** 위에 보여 준 사례 중 이 규칙을 실제로 어긴 것의 번호를 적는다.",
  "- **3개 이상 못 대면 그 규칙은 내지 마라.** 사례에 흔적이 없는 규칙은 나중에 '어긴 사례 0건' 으로 떨어진다 — 아무도 안 쓴다.",
  "- 대충 다 적지 마라. 내가 그 사례들을 다시 읽고, 정말 어겼는지 따로 확인한다.",
  "- \"했어야 했다\" 는 어긴 게 아니다. **결과물 글 안에서 어긴 것이 보여야** 한다.",
  "- 이미 있는 규칙과 겹치지 않는다. **같은 뜻이면 말만 달라도 내지 않는다** — 아래 목록의 본문과 견줘라.",
  "",
  "확신 없는 규칙을 억지로 만들지 마라. 0~3개. 한국어로.",
].join("\n");

const JUDGE_SYS = [
  "너는 규칙 하나와 사례 여러 개를 받는다. 각 사례가 **그 규칙을 어겼는지** 만 판정한다.",
  "사례에는 요청(task)과 결과물(output)만 있다. 결과가 좋았는지는 모른다 — 추측하지 말고 규칙의 판별 기준(violation_test)만 적용하라.",
  "판단할 근거가 부족하면 어기지 않은 것(false)으로 둔다.",
].join("\n");

function caseBlock(c: LearnCase, withNote: boolean, n?: number): string {
  return [
    n !== undefined ? `### case ${n}` : `### ${c.source}`,
    `요청: ${c.task}`,
    `결과물: ${c.output}`,
    withNote && c.note ? `무엇이 잘못됐나: ${c.note}` : "",
  ].filter(Boolean).join("\n");
}

/** 이미 있는 규칙 — 제목만이 아니라 **본문까지** 보여 준다. 113회차: 제목만 주니 같은 뜻의 규칙('떨어진 줄 외 손대지 않기')이 말만 바꿔
 *  ('한 파일만 touch') 다시 제안·채택됐다. 제안자가 뜻을 견주려면 본문이 있어야 한다. */
async function existingRules(db: Supabase, companyId: string): Promise<{ titles: string[]; lines: string[] }> {
  const [{ data: k }, { data: lc }] = await Promise.all([
    db.from("organization_knowledge").select("title, description").eq("company_id", companyId).eq("status", "active").limit(200),
    db.from("learning_candidates").select("title, summary, status").eq("company_id", companyId).order("created_at", { ascending: false }).limit(200),
  ]);
  const ks = (k ?? []) as { title: string; description: string }[];
  const cs = (lc ?? []) as { title: string; summary: string; status: string }[];
  return {
    titles: [...ks.map((r) => r.title), ...cs.map((r) => r.title)],
    lines: [
      ...ks.map((r) => `- [지키는 중] ${r.title}: ${r.description}`),
      ...cs.filter((r) => r.status === "rejected").slice(0, 20).map((r) => `- [떨어짐] ${r.title}: ${r.summary}`),
    ],
  };
}
const norm = (s: string) => s.replace(/\(.*?\)/g, "").replace(/\s+/g, "").toLowerCase();

export const RECHECK = { growth: 10, maxPerRun: 2 } as const;
/** 재검증할 때가 됐나: 채택 때 보류분보다 growth 건 이상 늘었을 때만. */
export const recheckDue = (holdoutAtAdoption: number, holdoutNow: number) => holdoutNow >= holdoutAtAdoption + RECHECK.growth;

/** 규칙 하나를 보류분에 대 본다(호출 1번). 결과는 가린 채 "어겼나" 만 묻고, 셈은 여기서 한다. */
async function judgeRule(ai: AIProvider, rule: string, violationTest: string, holdout: LearnCase[]): Promise<{ counts: Counts; judged: number }> {
  const { output: judged } = await ai.generateStructuredOutput({
    systemInstructions: JUDGE_SYS,
    input: [
      "## Cases to judge against the rule",
      `규칙: ${rule}`,
      `어겼는지 판별하는 법: ${violationTest}`,
      "",
      ...holdout.map((c, i) => caseBlock(c, false, i)),
    ].join("\n\n"),
    schema: judgeSchema,
    schemaName: "rule_judgments",
    // 113회차 09-15: 보류 59건 판정 JSON 이 2000 토큰을 넘어 MODEL_OUTPUT_TRUNCATED 로 하루치가 통째로 죽었다(첫 자동 실행). 넉넉히.
    maxTokens: 4000,
    tier: "routine",
  });
  const verdict = new Map(judged.judgments.map((j) => [j.case, j.violates]));
  const rows = holdout.flatMap((c, i) => (verdict.has(i) ? [{ bad: c.bad, violates: verdict.get(i)! }] : []));
  return { counts: countsFrom(rows), judged: rows.length };
}

type AdoptedRule = { knowledgeId: string; candidateId: string; title: string; rule: string; violationTest: string; holdoutAtAdoption: number };
async function adoptedRules(db: Supabase, companyId: string): Promise<AdoptedRule[]> {
  const { data: k } = await db
    .from("organization_knowledge")
    .select("id, title, description, learning_candidate_id")
    .eq("company_id", companyId).eq("status", "active").not("learning_candidate_id", "is", null);
  const ks = (k ?? []) as { id: string; title: string; description: string; learning_candidate_id: string }[];
  if (!ks.length) return [];
  const { data: c } = await db.from("learning_candidates").select("id, reason").in("id", ks.map((x) => x.learning_candidate_id));
  const reasons = new Map(((c ?? []) as { id: string; reason: string }[]).map((x) => [x.id, x.reason]));
  return ks.flatMap((x) => {
    try {
      const r = JSON.parse(reasons.get(x.learning_candidate_id) ?? "") as { violation_test?: string; holdout?: number };
      if (!r.violation_test || typeof r.holdout !== "number") return [];
      return [{ knowledgeId: x.id, candidateId: x.learning_candidate_id, title: x.title, rule: x.description, violationTest: r.violation_test, holdoutAtAdoption: r.holdout }];
    } catch { return []; }
  });
}

export async function runRuleLoop(
  db: Supabase,
  ai: AIProvider,
  companyId: string,
  opts: { dryRun?: boolean; maxRules?: number; forceRecheck?: boolean } = {},
): Promise<RuleLoopResult> {
  const maxRules = Math.min(3, opts.maxRules ?? 3);
  const cases = await collectCases(db, companyId, { ai });   // 156회차: 사장님 반응은 모델이 읽는다
  const train = cases.filter((c) => !isHoldout(c.id) || c.source === "execution");
  // 실행 실패 사례는 결과물이 없어서 "없음" 자체가 답을 흘린다 → 검증(보류분)에서 뺀다. 제안에는 쓴다.
  const holdout = cases.filter((c) => isHoldout(c.id) && c.source !== "execution");
  const bySource: Record<string, number> = {};
  for (const c of cases) bySource[`${c.source}:${c.bad ? "실패" : "성공"}`] = (bySource[`${c.source}:${c.bad ? "실패" : "성공"}`] ?? 0) + 1;
  const summary = {
    total: cases.length, train: train.length, holdout: holdout.length,
    trainBad: train.filter((c) => c.bad).length, holdoutBad: holdout.filter((c) => c.bad).length, bySource,
  };
  const base = { cases: summary, rechecks: [] as RuleRecheck[], trials: [] as RuleTrial[], adopted: 0, wrote: false, calls: 0 };

  if (ai.name !== "mock" && process.env.GENESIS_SPEND !== "i-approve") return { ...base, skipped: "지출 승인 없음(GENESIS_SPEND) — 목(mock) 파일럿만 가능" };
  if (summary.trainBad < 2) return { ...base, skipped: `제안용 실패 사례 ${summary.trainBad}건(<2)` };
  const holdoutOk = summary.holdout - summary.holdoutBad;
  if (summary.holdoutBad < ADOPT.minBadHoldout || holdoutOk < ADOPT.minOkHoldout) {
    return { ...base, skipped: `검증용 사례 부족(실패 ${summary.holdoutBad}·성공 ${holdoutOk}, 각각 ${ADOPT.minBadHoldout} 이상 필요)` };
  }

  let calls = 0;
  let wrote = false;

  // ── 재검증: 전에 채택한 규칙을 새 보류분에 다시 댄다
  const rechecks: RuleRecheck[] = [];
  const due = (await adoptedRules(db, companyId)).filter((r) => opts.forceRecheck || recheckDue(r.holdoutAtAdoption, holdout.length)).slice(0, RECHECK.maxPerRun);
  for (const r of due) {
    let judgedOut: { counts: Counts; judged: number };
    try { judgedOut = await judgeRule(ai, r.rule, r.violationTest, holdout); }
    catch (e) { calls++; rechecks.push({ knowledgeId: r.knowledgeId, title: r.title, counts: { a: 0, b: 0, c: 0, d: 0 }, judged: 0, lift: null, p: 1, holdoutBefore: r.holdoutAtAdoption, holdoutNow: holdout.length, keep: true, reason: `판정 호출 실패(그대로 둠): ${e instanceof Error ? e.message : String(e)}` }); continue; }
    const { counts, judged } = judgedOut;
    calls++;
    const d = decide(counts);
    rechecks.push({ knowledgeId: r.knowledgeId, title: r.title, counts, judged, lift: d.lift, p: d.p, holdoutBefore: r.holdoutAtAdoption, holdoutNow: holdout.length, keep: d.adopt, reason: d.reason });
    if (opts.dryRun) continue;
    const note = `재검증(보류 ${holdout.length}건, 채택 때 ${r.holdoutAtAdoption}건): ${d.reason}`;
    const { data: cand } = await db.from("learning_candidates").select("reason, manager_note").eq("id", r.candidateId).maybeSingle();
    const reason = (() => { try { return { ...JSON.parse(String(cand?.reason ?? "{}")), holdout: holdout.length, recheck: { counts, judged, lift: d.lift, p: d.p } }; } catch { return { holdout: holdout.length }; } })();
    await db.from("learning_candidates").update({
      reason: JSON.stringify(reason),
      manager_note: `${cand?.manager_note ?? ""}\n${note}`.trim(),
      ...(d.adopt ? {} : { status: "rejected", decided_at: new Date().toISOString() }),
    }).eq("id", r.candidateId);
    if (!d.adopt) {
      const { error } = await db.from("organization_knowledge").update({ status: "deprecated" }).eq("id", r.knowledgeId);
      if (error) console.error("[rules] 규칙 내리기 실패:", error.message);
    }
    wrote = true;
  }

  const { titles: known, lines: knownLines } = await existingRules(db, companyId);
  const trainBad = train.filter((c) => c.bad).slice(0, 12);
  const trainOk = train.filter((c) => !c.bad).slice(0, 6);

  const { output: proposed } = await ai.generateStructuredOutput({
    systemInstructions: PROPOSE_SYS,
    input: [
      "## Failure cases to learn from",
      ...trainBad.map((c, i) => caseBlock(c, true, i)),
      "",
      "## Successful cases for contrast",
      ...trainOk.map((c, i) => caseBlock(c, false, trainBad.length + i)),
      "",
      "## Rules that already exist (같은 뜻이면 말만 달라도 다시 내지 마라)",
      knownLines.length ? knownLines.slice(0, 60).join("\n") : "(없음)",
    ].join("\n\n"),
    schema: proposeSchema,
    schemaName: "rule_proposals",
    maxTokens: 3000,
    tier: "routine",
  });
  calls++;

  const knownNorm = new Set(known.map(norm));
  const shown = [...trainBad, ...trainOk];
  const trials: RuleTrial[] = [];

  /**
   * **어긴 사례를 못 댄 규칙은 판정에 안 보낸다** (151회차).
   *
   * 09-13~09-16 에 낸 규칙 18개 중 11개가 '어긴 사례 0건 — 판단 불가' 로 떨어졌고, 그 11번 모두
   * 보류 사례 59건짜리 판정 호출을 한 번씩 쓰고 떨어졌다. **떨어질 것을 미리 알 수 있었다** —
   * 제안자에게 "누가 어겼나" 를 물은 적이 없었을 뿐이다.
   *
   * 문턱은 채택 때와 같은 모양으로 둔다(`ADOPT.minSupport`·`minBadViolators`): 어긴 사례 3건 이상,
   * 그중 **실패한 사례 2건 이상**. 성공 사례만 어기는 규칙은 실패의 원인이 아니니까.
   * 이건 문이 아니라 **낭비 막이**다 — 떨어뜨린 것도 후보로 기록해서 제안자가 다음에 같은 것을 다시 안 내게 한다.
   */
  const cited = (r: RuleCandidate) => {
    const idx = [...new Set((r.violating_cases ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < shown.length))];
    return { n: idx.length, bad: idx.filter((i) => shown[i].bad).length };
  };
  const candidates: RuleCandidate[] = [];
  for (const r of proposed.rules) {
    if (!r.title.trim() || !r.rule.trim() || knownNorm.has(norm(r.title))) continue;
    const c = cited(r);
    if (c.n < ADOPT.minSupport || c.bad < ADOPT.minBadViolators) {
      trials.push({
        ...r, counts: { a: 0, b: 0, c: 0, d: 0 }, judged: 0, lift: null, p: 1, support: c.n, adopt: false,
        reason: `제안자가 어긴 사례를 ${c.n}건(실패 ${c.bad}건)밖에 못 댔다 — 판정 안 함(호출 아낌)`,
      });
      continue;
    }
    candidates.push(r);
  }
  for (const r of candidates.slice(0, maxRules)) {
    // 호출 하나가 죽어도(잘림·연결) 나머지 규칙과 회사는 계속 — 첫 자동 실행(09-15)이 한 호출 때문에 회사 전체를 failed 로 남겼다.
    let judgedOut: { counts: Counts; judged: number };
    try { judgedOut = await judgeRule(ai, r.rule, r.violation_test, holdout); }
    catch (e) { calls++; trials.push({ ...r, counts: { a: 0, b: 0, c: 0, d: 0 }, judged: 0, lift: null, p: 1, support: 0, adopt: false, reason: `판정 호출 실패: ${e instanceof Error ? e.message : String(e)}` }); continue; }
    const { counts, judged } = judgedOut;
    calls++;
    const d = decide(counts);
    trials.push({ ...r, counts, judged, lift: d.lift, p: d.p, support: d.support, adopt: d.adopt, reason: d.reason });
  }

  const adopted = trials.filter((t) => t.adopt).length;
  if (opts.dryRun || trials.length === 0) return { ...base, rechecks, trials, adopted, wrote, calls };

  const now = new Date().toISOString();
  for (const t of trials) {
    const { data: cand, error } = await db
      .from("learning_candidates")
      .insert({
        company_id: companyId,
        title: t.title.slice(0, 120),
        summary: t.rule,
        reason: JSON.stringify({ violation_test: t.violation_test, counts: t.counts, judged: t.judged, lift: t.lift, p: t.p, holdout: summary.holdout }),
        category: "quality_improvement",
        confidence: t.p <= 0.05 ? "high" : t.p <= 0.1 ? "medium" : "low",
        status: t.adopt ? "approved" : "rejected",
        manager_note: `자동 검증(보류 사례 ${t.judged}건): ${t.reason}`,
        decided_at: now,
      })
      .select("id")
      .single();
    if (error) { console.error("[rules] 후보 기록 실패:", error.message); continue; }
    if (t.adopt) {
      const { error: ke } = await db.from("organization_knowledge").insert({
        company_id: companyId,
        title: `${t.title.slice(0, 100)} (검증된 규칙)`,
        description: t.rule,
        category: "quality_improvement",
        status: "active",
        learning_candidate_id: cand.id,
      });
      if (ke) console.error("[rules] 지식 채택 실패:", ke.message);
    }
  }
  return { ...base, rechecks, trials, adopted, wrote: true, calls };
}
