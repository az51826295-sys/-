import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider } from "@/lib/providers/types";
import { buildPatch, type SourceFile } from "@/lib/skills/appBuild/patch";
import { runWeb, factLines, DEFAULT_ACTIONS, type RunFacts, type RunAction } from "@/lib/skills/appBuild/run";
import { checkGuards, measureNamesFor, type WebGuard } from "@/lib/skills/appBuild/webMeasures";

/**
 * **예산 안에서 도는 고리** (179회차 09-18). 사장님 "그래".
 *
 * 만든 것을 돌려 보고(run.ts) → 심판자가 확인 목록에 대 보고 → 고칠 것만 조각으로 고치고(patch.ts) → 다시 돌려 본다.
 * 지피티가 "한 시간 만드는" 것의 뼈대가 이것이다. 우리가 여태 두 바퀴(만들기·심판 한 번)였다면 이제 예산만큼 돈다.
 *
 * 규칙:
 * - 바퀴마다 점수를 적는다(맞은 항목 수·오류 수). **나빠지면 되돌린다** — 지난 제일 좋은 판 위에서 다시 고친다.
 * - 심판자가 "더 고칠 게 없다" 하거나, 바퀴·돈 예산이 다하거나, 조각이 안 붙으면 멈춘다.
 * - 바퀴마다 기록을 남긴다(`rounds`). 이게 없으면 "몇 바퀴에 얼마나 좋아졌나" 를 잴 수 없고, 못 재면 예산을 정할 수 없다.
 * - 심판자는 **문이 아니다**(09-16). 마지막 판이 무엇이든 제일 좋은 판을 내보내고, 심판자의 말은 옆에 적는다.
 */

export const loopVerdictSchema = z.object({
  /** 돌려 본 사실과 화면으로 볼 때 지켜진 기준 id. */
  met: z.array(z.string()),
  /** 안 지켜진 기준 — id 와 무엇이 어떻게 어긋났는지. */
  unmet: z.array(z.object({ id: z.string(), why: z.string() })),
  /** 이 사실·화면만으로는 알 수 없는 기준 id(예: 저장 뒤 다시 열기). 못 본 것을 맞았다고 하지 않는다. */
  unknown: z.array(z.string()),
  /** 기준 밖이라도 분명히 고장인 것(콘솔 오류, 빈 화면, 안 움직임). */
  broken: z.array(z.string()),
  /** 이번 바퀴에 고칠 것 — 구체적으로, 많아야 다섯 줄. 고칠 게 없으면 빈 문자열. */
  toWorker: z.string(),
  /** 더 고칠 게 없다(unmet·broken 이 비었고 남은 것은 못 본 것뿐). */
  done: z.boolean(),
  /** 사람에게 한 줄(한국어, 안쪽 낱말 없이). */
  toPerson: z.string(),
  /**
   * 다음 바퀴에 돌려 볼 때 할 조작 — 못 본 기준(unknown)을 보려면 그 자리까지 가야 한다. 비면 기본 대본.
   * click_text 는 화면 글자(정규식), tap 은 캔버스 안 비율(0~1), taps 는 여기저기 n번, taps_moving 은 움직이거나 새로 나타난 것을 n번(두더지·떨어지는 것), key 는 KeyboardEvent.code, wait 는 ms.
   */
  nextActions: z.array(z.object({
    do: z.enum(["click_text", "tap", "taps", "taps_moving", "key", "wait"]),
    text: z.string().nullable(), x: z.number().nullable(), y: z.number().nullable(), n: z.number().nullable(), key: z.string().nullable(), ms: z.number().nullable(),
  })),
});
export type LoopVerdict = z.infer<typeof loopVerdictSchema>;

const JUDGE_SYSTEM = [
  "너는 웹 게임(HTML 한 파일)을 **실제로 돌려 본 결과**를 놓고 확인 목록을 대 보는 심판자다.",
  "받는 것: 확인 목록(when → then), 돌려 본 사실(콘솔 오류·화면이 비었나·눌렀을 때 바뀌나·해 본 조작·화면 글자), 화면 세 장(시작·시작 단추 뒤·놀아 본 뒤).",
  "규칙:",
  "- 본 것만 말한다. 사실과 화면으로 확인되는 기준만 met. 확인할 수 없는 것은 unknown 이지 met 이 아니다.",
  "- 콘솔 오류가 있으면 그 오류가 무엇을 깨뜨리는지 broken 에 적는다. 오류 0·화면 그려짐·입력에 반응이 기본이다.",
  "- toWorker 는 고치는 사람이 그대로 따라 할 수 있게: 어느 기준이 왜 안 됐고 무엇을 바꾸면 되는지. 많아야 다섯 줄. 새 기능을 보태라고 하지 않는다.",
  "- 폰·태블릿 화면이면 터치로 되는지가 첫째고 키보드는 없어도 된다. 데스크톱이면 키보드가 있어야 한다.",
  "- done 은 unmet 과 broken 이 둘 다 비었을 때만 true. unknown 이 남았으면 nextActions 로 그 자리까지 가는 조작을 적는다(예: '게임 시작' 누르기 → 1초 기다리기 → 여기저기 12번 누르기 → 3초 기다리기). 이미 해 본 조작으로 못 봤으면 다른 조작을.",
  "- toPerson 은 한국어 한 문장. '콘솔·파서·렌더' 같은 안쪽 낱말 대신 '오류·화면·반응' 으로.",
].join("\n");

export type Criterion = { id: string; when: string; then: string };
export type RoundRecord = {
  n: number;
  met: number; unmet: number; unknown: number; broken: number; errors: number;
  /** 이 바퀴의 판이 지금까지 제일 좋은가. */
  best: boolean;
  /** 이 바퀴에 고친 조각 수(다음 판을 만들며). 마지막 바퀴는 0. */
  edits: number;
  ms: number;
  usd: number;
  toPerson: string;
};

export type LoopResult = {
  /** 심판이 죽어 다시 부른 횟수. **0 이 아니면 조용히 넘어가지 않는다.** */
  judgeRetries: number;
  files: SourceFile[];
  rounds: RoundRecord[];
  /** 제일 좋았던 바퀴 번호(1부터). */
  bestRound: number;
  /** 제일 좋은 판의 심판. */
  verdict: LoopVerdict | null;
  facts: RunFacts | null;
  stoppedBy: "done" | "rounds" | "usd" | "patch_failed" | "no_run" | "judge_failed";
  usd: number;
};

/** 점수 — 클수록 좋다. 맞은 것이 먼저고, 고장·오류·안 맞은 것이 깎는다. */
function scoreOf(v: LoopVerdict, f: RunFacts): number {
  return v.met.length * 10 - v.unmet.length * 4 - v.broken.length * 6 - Math.min(f.consoleErrors.length, 5) * 3 - (f.blankAtStart ? 20 : 0);
}

/**
 * **심판을 두 번까지 부른다**(205회차 09-23, 판 8 에서 배움).
 * 판 8 은 3바퀴째에 심판이 죽어 멈췄고 **고장 9개짜리가 그대로 결과물로 나갔다.**
 * 심판이 못 본 것은 형식 어긋남·잘림 같은 **기계 고장**이지 판단이 아니다(09-15 에 그은 선).
 *
 * **다시 부른 것도 세서 돌려준다** — 사장님 09-23:
 * *"오늘 내내 고친 게 '조용히' 였습니다. 두 번째에 살아나면 첫 번째 죽음이 아무 데도 안 남습니다."*
 * 심판이 자주 죽는지는 이 숫자가 쌓여야 보인다.
 */
export async function judgeTwice(ai: AIProvider, o: { ask: string; criteria: Criterion[]; facts: RunFacts; mobile: boolean; round: number }): Promise<{ verdict: LoopVerdict; retried: number }> {
  try { return { verdict: await judge(ai, o), retried: 0 }; }
  catch (e1) {
    console.warn(`[고리] ${o.round}바퀴: 심판자가 못 봤다 — 한 번 다시 부른다:`, e1 instanceof Error ? e1.message : e1);
    return { verdict: await judge(ai, o), retried: 1 };
  }
}

async function judge(ai: AIProvider, o: { ask: string; criteria: Criterion[]; facts: RunFacts; mobile: boolean; round: number }): Promise<LoopVerdict> {
  const input =
    `## 주문\n${o.ask}\n\n## 기기\n${o.mobile ? "폰·태블릿(터치)" : "데스크톱(키보드·마우스)"}\n\n` +
    `## 확인 목록\n${o.criteria.map((c) => `- [${c.id}] ${c.when} → ${c.then}`).join("\n")}\n\n` +
    `## 돌려 본 사실 (${o.round}바퀴째)\n${factLines(o.facts).map((l) => `- ${l}`).join("\n")}\n\n` +
    `그림 1 = 시작 화면, 그림 2 = 시작 단추를 누른 직후, 그림 3 = 대본대로 놀아 본 뒤.`;
  const images = o.facts.ran && o.facts.shots.start ? [o.facts.shots.start, o.facts.shots.mid, o.facts.shots.after] : [];
  const { output } = await ai.generateStructuredOutput({ systemInstructions: JUDGE_SYSTEM, input, images, schema: loopVerdictSchema, schemaName: "loop_verdict", maxTokens: 16000, tier: "judgment" });
  return output;
}

/** 이 실행이 지금까지 쓴 돈(장부). 자리를 갈아 끼워도 계량이 장부에 남긴다(152회차). */
async function spentUsd(db: SupabaseClient, executionId: string): Promise<number> {
  const { data } = await db.from("model_usage").select("cost_usd").eq("work_execution_id", executionId);
  return (data ?? []).reduce((n, r) => n + Number((r as { cost_usd?: number | null }).cost_usd ?? 0), 0);
}

export async function improveLoop(o: {
  db: SupabaseClient;
  executionId: string;
  /** 심판자 자리(그림을 봐야 한다 — 라우터가 그림이 있으면 볼 수 있는 쪽으로 올린다). */
  judgeAi: AIProvider;
  /** 고치는 자리(luna). */
  fixAi: AIProvider;
  title: string;
  ask: string;
  criteria: Criterion[];
  files: SourceFile[];
  mobile: boolean;
  /** 최대 바퀴 수. 1 이면 돌려 보고 심판만 한다(고치지 않는다). */
  rounds: number;
  /** 이 실행 전체의 돈 상한. 넘으면 멈춘다. */
  usdCap: number;
  /** 바퀴마다 부른다 — 화면의 "N바퀴째 · 확인 목록 x/y" 가 여기서 나온다. */
  onRound?: (r: RoundRecord, total: number) => Promise<void>;
  /**
   * 꼼꼼 모드("고퀄"). 186회차 사장님 "시간이 왜 이렇게 많이 걸리지? 억지로 루프 돌고 있나, 간단한 게임인데" — 실측: 고장이 하나도 없는 판을
   * "못 본 것" 을 보러 두 바퀴 더 돌았고(각 30~47초) 얻은 것은 0~1개였다. 기본 모드는 **고칠 게 없으면 바로 끝**, 꼼꼼 모드만 못 본 것을 더 본다.
   */
  thorough?: boolean;
  /**
   * **숫자 난간**(205회차 09-22). 어기면 `broken` 에 들어간다 — 그러면 한 자리를 고친 것으로
   * 점수·`done`·고치는 자리 프롬프트가 **전부** 이 사실을 보게 된다.
   * 화면만 보는 심판이 못 보던 것을 기계가 잡는 자리다. **못 잰 것도 어긴 것과 같이 걸린다.**
   */
  guards?: WebGuard[];
}): Promise<LoopResult> {
  const rounds: RoundRecord[] = [];
  /** 심판이 죽어 다시 부른 횟수(판 전체). 0 이 아니면 결과물에 적힌다. */
  let judgeRetries = 0;
  let files = o.files;
  let best: { files: SourceFile[]; score: number; round: number; verdict: LoopVerdict; facts: RunFacts } | null = null;
  let stoppedBy: LoopResult["stoppedBy"] = "rounds";
  let actions: RunAction[] = DEFAULT_ACTIONS;
  const usd0 = await spentUsd(o.db, o.executionId);
  let usdBefore = usd0;

  for (let n = 1; n <= o.rounds; n++) {
    const t0 = Date.now();
    const facts = await runWeb(files, { mobile: o.mobile, actions, measures: o.guards?.length ? measureNamesFor(o.guards) : undefined });
    if (!facts.ran) { stoppedBy = "no_run"; console.warn(`[고리] ${n}바퀴: 돌려 보지 못함 — ${facts.why}`); break; }
    let verdict: LoopVerdict;
    let 재시도 = 0;
    try { const r = await judgeTwice(o.judgeAi, { ask: o.ask, criteria: o.criteria, facts, mobile: o.mobile, round: n }); verdict = r.verdict; 재시도 = r.retried; }
    catch (e) { stoppedBy = "judge_failed"; console.warn(`[고리] ${n}바퀴: 두 번 다 심판자가 못 봤다 —`, e instanceof Error ? e.message : e); break; }
    judgeRetries += 재시도;

    // **난간은 심판 말 위에 얹는다.** 심판이 "다 됐다" 고 해도 숫자가 어긋나면 고장이다 —
    // 판 2 에서 심판은 통과시켰고 높이는 36% 떨어져 있었다.
    if (o.guards?.length) {
      const hit = checkGuards(facts.measured, o.guards);
      if (hit.length) {
        verdict = { ...verdict, broken: [...verdict.broken, ...hit] };
        console.log(`[고리] ${n}바퀴: 난간 ${hit.length}개 걸림 — ${hit[0]}`);
      }
    }
    // 같은 파일을 다른 대본으로 다시 본 것이면 경쟁이 아니라 **더 본 것**이다 — 맞은 것은 합치고, 사실은 최신으로. (같은 판이 1→3→0 으로 흔들리던 것.)
    // 한 번 맞다고 본 것은 맞은 것으로 둔다 — 다른 대본이 게임을 시작조차 못 하고 "시간이 안 줄어" 라고 하는 헛경보(5바퀴째 실측)가
    // 고치는 판을 부르고 되돌리는 것보다, 가끔 나는 고장을 놓치는 쪽이 싸다.
    if (best && best.files === files) {
      const met = [...new Set([...best.verdict.met, ...verdict.met])];
      const everMet = new Set(met);
      best.verdict = { ...verdict, met, unmet: verdict.unmet.filter((u) => !everMet.has(u.id)), unknown: verdict.unknown.filter((id) => !everMet.has(id)) };
      best.facts = facts; best.score = scoreOf(best.verdict, facts);
      verdict = best.verdict;
    }
    const score = scoreOf(verdict, facts);
    const isBest = !best || best.files === files || score > best.score;
    if (!best || score > best.score) best = { files, score, round: n, verdict, facts };
    const usdNow = await spentUsd(o.db, o.executionId);
    const rec: RoundRecord = {
      n, met: verdict.met.length, unmet: verdict.unmet.length, unknown: verdict.unknown.length, broken: verdict.broken.length,
      errors: facts.consoleErrors.length, best: isBest, edits: 0, ms: Date.now() - t0, usd: Math.round((usdNow - usdBefore) * 1000) / 1000, toPerson: verdict.toPerson,
    };
    usdBefore = usdNow;
    rounds.push(rec);
    console.log(`[고리] ${n}바퀴: 맞음 ${rec.met}/${o.criteria.length} · 안 맞음 ${rec.unmet} · 고장 ${rec.broken} · 오류 ${rec.errors} · 점수 ${score}${isBest ? " ★" : " (되돌림)"} · ${Math.round(rec.ms / 1000)}초 · $${rec.usd}`);
    if (o.onRound) await o.onRound(rec, o.criteria.length).catch(() => {});

    // 다음 바퀴의 대본 — 심판자가 준 것이 있으면 그것(모양이 맞는 것만).
    const next = verdict.nextActions.map((a): RunAction | null => {
      if (a.do === "click_text" && a.text) return { do: "click_text", text: a.text.slice(0, 60) };
      if (a.do === "tap" && a.x != null && a.y != null) return { do: "tap", x: Math.max(0, a.x), y: Math.max(0, a.y) };
      if (a.do === "taps") return { do: "taps", n: Math.min(20, Math.max(1, a.n ?? 8)) };
      if (a.do === "taps_moving") return { do: "taps_moving", n: Math.min(12, Math.max(1, a.n ?? 6)) };
      if (a.do === "key" && a.key) return { do: "key", key: a.key.slice(0, 20), ms: Math.min(1500, a.ms ?? 120) };
      if (a.do === "wait") return { do: "wait", ms: Math.min(o.thorough ? 25_000 : 8_000, Math.max(100, a.ms ?? 1000)) };
      return null;
    }).filter((a): a is RunAction => !!a);
    // 심판자의 대본에 "움직이는 것 누르기" 가 없으면 붙인다 — 두더지·떨어지는 것은 그것으로만 맞는다(두 번째 시험에서 점수 고장을 이것 없이는 못 봤다).
    if (next.length) actions = next.some((a) => a.do === "taps_moving" || a.do === "taps") ? next : [...next, { do: "taps_moving", n: 6 }, { do: "wait", ms: 800 }];
    // 멈춤: 더 고칠 게 없다고 했고 못 본 것도 없으면. 못 본 것만 남았으면 새 대본으로 **한 번 더 보기만** 한다(고치지 않는다).
    const onlyUnknown = verdict.unmet.length === 0 && verdict.broken.length === 0;
    const prevUnknown = rounds.length >= 2 ? rounds[rounds.length - 2].unknown : Infinity;
    // 못 본 것만 남았을 때: 기본 모드는 여기서 끝. 꼼꼼 모드는 새 대본이 있고 **지난 바퀴보다 못 본 것이 줄었을 때만** 한 번 더 본다.
    if (onlyUnknown && (!o.thorough || verdict.unknown.length === 0 || !next.length || n === o.rounds || verdict.unknown.length >= prevUnknown)) { stoppedBy = "done"; break; }
    if (onlyUnknown) { rounds[rounds.length - 1].toPerson += " (못 본 것을 보러 한 번 더 돌려 봄)"; continue; }
    if (n === o.rounds) { stoppedBy = "rounds"; break; }
    if (usdNow - usd0 >= o.usdCap) { stoppedBy = "usd"; console.log(`[고리] 돈 상한 $${o.usdCap} 에 닿아 멈춘다`); break; }

    // 나빠졌으면 제일 좋은 판 위에서 다시 고친다.
    const base = isBest ? files : best!.files;
    const extra =
      `\n\n## 실제로 돌려 본 결과 (${n}바퀴째)\n${factLines(facts).map((l) => `- ${l}`).join("\n")}\n\n` +
      `## 심판자가 이번 바퀴에 고치라는 것 (이것만 고친다)\n${verdict.toWorker}\n` +
      (verdict.unmet.length ? `\n안 지켜진 기준:\n${verdict.unmet.map((u) => `- [${u.id}] ${u.why}`).join("\n")}` : "") +
      (verdict.broken.length ? `\n고장:\n${verdict.broken.map((b) => `- ${b}`).join("\n")}` : "") +
      (!isBest ? `\n(방금 판은 지난 판보다 나빠져서 버렸다 — 지난 제일 좋은 판 위에서 고친다)` : "");
    const p = await buildPatch(o.fixAi, { title: o.title, ask: o.ask + extra, criteria: o.criteria, failedChecks: [], full: base, rest: [] });
    if (!p.ok) { stoppedBy = "patch_failed"; console.warn(`[고리] ${n}바퀴: 조각이 안 붙어 멈춘다`); break; }
    rec.edits = p.patch.edits.length;
    files = p.files;
  }

  const usd = (await spentUsd(o.db, o.executionId)) - usd0;
  if (!best) return { files: o.files, rounds, bestRound: 0, verdict: null, facts: null, stoppedBy, usd, judgeRetries };
  return { files: best.files, rounds, bestRound: best.round, verdict: best.verdict, facts: best.facts, stoppedBy, usd, judgeRetries };
}

/** 주문에서 바퀴 수를 읽는다. "고퀄·꼼꼼히·제대로" 면 많이, 아니면 기본. 환경변수가 이긴다. */
export function roundsFor(order: string, effort?: string | null): number {
  const env = Number(process.env.BUILD_LOOP_ROUNDS ?? "");
  if (Number.isFinite(env) && env >= 0 && process.env.BUILD_LOOP_ROUNDS !== undefined) return env;
  // 187회차: 머리가 정한 effort 가 먼저. 주문에 '고퀄' 이 있으면 꼼꼼히 쪽으로만 올린다(내리진 않는다).
  if (isThorough(order)) return 8;
  if (effort === "가볍게") return 1;
  if (effort === "꼼꼼히") return 8;
  return 3;
}
/** "고퀄·꼼꼼히·제대로" — 시간을 더 써도 되는 주문. */
export function isThorough(order: string): boolean { return /고퀄|꼼꼼|제대로|완성도|정성/.test(order); }

/** 끝까지 못 본 판을 사람 말로. `done` 이면 null. (순수 함수라 심어서 잴 수 있다.) */
export function notFinished(stoppedBy: LoopResult["stoppedBy"], rounds: number, judgeRetries = 0): { 멈춘이유: string; 바퀴: number; 심판재시도?: number; 말: string } | null {
  if (stoppedBy === "done" && !judgeRetries) return null;
  const 말 = stoppedBy === "judge_failed" ? "심판자가 두 번 다 못 봐서 멈췄다 — 남은 고장을 아무도 안 봤다"
    : stoppedBy === "patch_failed" ? "조각이 안 붙어 멈췄다"
    : stoppedBy === "usd" ? "돈 상한에 닿아 멈췄다"
    : stoppedBy === "no_run" ? "돌려 보지 못했다"
    : stoppedBy === "rounds" ? "바퀴를 다 써서 멈췄다 — 고칠 것이 남아 있을 수 있다"
    : "끝까지 봤다";
  return { 멈춘이유: stoppedBy, 바퀴: rounds, ...(judgeRetries ? { 심판재시도: judgeRetries } : {}), 말 };
}
