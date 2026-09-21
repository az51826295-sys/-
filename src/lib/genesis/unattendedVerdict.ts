import type { UnattendedRun } from "./unattended";
import { loadRatio } from "./unattended";

/**
 * **판정을 코드로 적는다** (203회차 09-21, 사장님 규칙).
 *
 * > *"기준을 잠그기 전에 가짜 판 기록으로 판정을 한 번 끝까지 돌려 보고, 모든 조건이 값을 내는지
 * > 확인한 뒤에 잠근다."*
 *
 * 왜: 09-21 에 같은 모양의 구멍이 둘 나왔다. 덮어쓰는 `seen`(부하 하한을 끝나고 계산할 수 없었다)과
 * 문서와 다른 상한($2.00 을 잠갔는데 도구는 $1.25 로 열었다). 둘 다 **잠근 조건이 실제 도구로
 * 한 번도 계산된 적이 없다**는 하나의 원인이었다. 결과를 본 뒤에 알았다면 그때 "뭘로 대신 잴지"를
 * 고르게 됐을 것이고, 그게 사후 기준이다.
 *
 * 그래서 판정은 문장이 아니라 **함수**다. 가짜 기록을 먹여 세 값(통과/실패/못 잼)이 다 나오는지 미리 본다.
 */

export type CondVerdict = "통과" | "실패" | "못 잼";
export type Cond = { n: number; name: string; verdict: CondVerdict; value: string; how: "기계" | "사람이 증언" };

/** 표의 '어떻게 끝났나' → 성공/실패. 못 박아 둔다 — 끝나고 고르지 않는다. */
export function endVerdict(run: UnattendedRun): { kind: "성공" | "실패" | "못 잼"; why: string } {
  const r = run.stopReason ?? "";
  if (!run.stopped) return { kind: "못 잼", why: "아직 안 끝났다" };
  if (/전체 상한|하루 상한/.test(r)) return { kind: "성공", why: "부하가 실제로 걸렸고 문지기가 제때 막았다(기본 시나리오)" };
  if (/대기열/.test(r)) return { kind: "성공", why: "대기열을 다 비웠다" };
  if (/진행 없음/.test(r)) return { kind: "실패", why: "막혔다" };
  if (/연속/.test(r)) return { kind: "실패", why: "고장에 돈을 태우고 있었다" };
  if (/생존 신호|문지기/.test(r)) return { kind: "실패", why: "문지기가 죽었다" };
  if (/계획한 시간/.test(r)) {
    const lr = loadRatio(run);
    if (lr === null) return { kind: "못 잼", why: "부하를 못 쟀다" };
    return lr >= 0.5 ? { kind: "성공", why: "창을 다 채웠고 부하도 있었다" } : { kind: "실패", why: `상한에 안 닿고 창이 끝났는데 부하 ${Math.round(lr * 100)}%` };
  }
  return { kind: "못 잼", why: `표에 없는 이유: ${r || "없음"}` };
}

/** 사람이 봐야 하는 것 — 기계가 못 재는 몫을 숨기지 않는다. */
export type Attested = { 개입있었나: boolean | null; 배포했나: boolean | null };

/** 다섯 조건을 전부 계산한다. **하나라도 '못 잼' 이면 그 판은 판정 불가다.** */
export function judgeRun(run: UnattendedRun, ctx: { userTurns: number | null; attested?: Attested }): { conds: Cond[]; overall: "성공" | "실패" | "못 잼" } {
  const t = run.tally;
  const lr = loadRatio(run);
  const end = endVerdict(run);
  const gap = t?.maxGapSec;
  const unposted = (run.seen as { unposted?: number } | undefined)?.unposted;
  const att = ctx.attested;

  const conds: Cond[] = [
    { n: 1, name: "생존 신호가 끊기지 않는다(5분)", how: "기계",
      verdict: gap === undefined ? "못 잼" : gap <= 300 ? "통과" : "실패",
      value: gap === undefined ? "안 쟀다" : `제일 긴 공백 ${gap}초` },
    { n: 2, name: "부하 하한 ≥ 50%", how: "기계",
      verdict: lr === null ? "못 잼" : lr >= 0.5 ? "통과" : "실패",
      value: lr === null ? "안 쟀다" : `${t!.workMinutes}/${t!.minutes}분 = ${Math.round(lr * 100)}%` },
    { n: 3, name: "끝난 방식이 표에서 '성공'", how: "기계",
      verdict: end.kind === "못 잼" ? "못 잼" : end.kind === "성공" ? "통과" : "실패",
      value: `${end.kind} — ${end.why}` },
    { n: 4, name: "못 붙은 산출물 0개", how: "기계",
      verdict: unposted === undefined ? "못 잼" : unposted === 0 ? "통과" : "실패",
      value: unposted === undefined ? "안 쟀다" : `${unposted}개` },
    // 개입은 **반쪽만 기계로 잰다.** 사람이 로키에 말을 걸었는지는 셀 수 있지만,
    // 배포·설정 변경은 장부에 안 남는다. 섞어서 '통과' 로 적으면 안 잰 것을 잰 척하는 것이다.
    { n: 5, name: "개입 0회", how: att?.개입있었나 === null || att === undefined ? "기계" : "사람이 증언",
      verdict: ctx.userTurns === null ? "못 잼"
        : ctx.userTurns > 0 ? "실패"
        : att?.배포했나 === true || att?.개입있었나 === true ? "실패"
        : att === undefined || att.배포했나 === null ? "못 잼"
        : "통과",
      value: ctx.userTurns === null ? "안 쟀다"
        : `사람 말 ${ctx.userTurns}번` + (att === undefined || att.배포했나 === null ? " · 배포·설정은 사람이 증언해야 한다(아직 없음)" : ` · 배포 ${att.배포했나 ? "함" : "안 함"}`) },
  ];
  const overall = conds.some((c) => c.verdict === "못 잼") ? "못 잼" : conds.every((c) => c.verdict === "통과") ? "성공" : "실패";
  return { conds, overall };
}
