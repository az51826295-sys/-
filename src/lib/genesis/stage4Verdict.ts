/**
 * **4단계 본판 — 같이 게임 만들기** (205회차 2026-09-21 밤).
 *
 * 1판(`e6944d68bc5609f8`)을 **판이 한 번도 안 돌기 전에** 고쳐 2판으로 간다 — 사장님이 구멍 넷을 짚었다.
 * 실제 회차를 잰 적이 없으므로 **소급해서 바뀌는 점수가 없다.**
 *
 * 최소판은 *"로키가 혼자 게임 하나를 끝까지 만드나"* 였고 본판은 **같이 만드나**다.
 * 1단계에서 사장님이 쓴 문장을 잇는다: *"말로 다섯 번 고쳐도 통째로 안 다시 만든다."*
 */

/** 누가 봤나. **2·3번은 사람 칸**이다 — 기계 심판이 못 넘는 발판을 통과시킨 적이 있다(09-21). */
export type Eyes = "사람" | "기계" | null;

export type FixRound = {
  n: number;
  /** **사장님이 하신 말 원문.** 비어 있으면 그 회차는 못 잼이다(사장님 09-21: 고침의 무게를 나중에 읽을 수 있어야 한다). */
  request: string;
  /** 조각 경로(`content_json.patched`)를 탔나 */
  patched: boolean;
  /**
   * 이 회차에서 바뀐 줄 / 그때 파일 전체 줄(게임이 여러 파일이면 **합**).
   * **세는 법**: `git diff --numstat` 의 **추가 + 삭제 합**이다.
   * 한 줄을 고치면 삭제 1 + 추가 1 로 **2** 가 된다. 한쪽으로 정해 둔다(3판).
   */
  changedLines: number;
  totalLines: number;
  /** 말한 것이 실제로 바뀌었나 · 누가 봤나 */
  asked: boolean | null;
  askedBy: Eyes;
  /** 되던 것이 깨졌나 · 누가 봤나. **되던 것 = 처음부터 클리어까지 한 번 도는 것** */
  broke: boolean | null;
  brokeBy: Eyes;
  /** 이 회차를 **다시 했나**. 한 번이라도 참이면 그 판은 무효다. */
  redone: boolean;
};

/** 통째로 다시 쓴 것으로 치는 선. 재량이 아니라 "절반" 이라는 자연스러운 경계다. */
export const WHOLE_REWRITE = 0.5;
/** 잠근 목표. 1단계에서 사장님이 쓴 숫자 그대로. */
export const TARGET_ROUNDS = 5;

export type Stage4Run = {
  rounds: FixRound[];
  /** **누적**: 첫 판 원본과 마지막 판을 견준 diff. 회차별 합이 아니다(중복으로 부풀지 않게). */
  cumulative: { changedLines: number; originalLines: number } | null;
  ownerSaidDone: boolean | null;
};

export type Stage4Verdict =
  | { kind: "무효"; why: string }
  | { kind: "못 잼"; why: string }
  | { kind: "통과" | "실패"; why: string; rounds: number; wholeRewrites: number; broke: number; cumulativeRatio: number };

/**
 * **연 판을 전부 기록한다** (3판, 사장님 09-21).
 * 회차를 다시 하는 것은 막았지만, 판이 무효·실패가 되면 **새 판을 열 수 있으니**
 * 결국 성공한 판 하나만 남기는 모양이 된다. 판 수를 제한하지는 않는다 — **전부 적는다.**
 * 무효도 실패도 지우지 않고, 결과는 항상 **"N판 중 M판 통과"** 로 적는다.
 */
export function judgeStage4Runs(runs: Stage4Run[]): { line: string; total: number; passed: number; failed: number; void_: number; unmeasured: number } {
  const vs = runs.map((r) => judgeStage4(r));
  const passed = vs.filter((v) => v.kind === "통과").length;
  const failed = vs.filter((v) => v.kind === "실패").length;
  const void_ = vs.filter((v) => v.kind === "무효").length;
  const unmeasured = vs.filter((v) => v.kind === "못 잼").length;
  return { line: `${runs.length}판 중 ${passed}판 통과 (실패 ${failed} · 무효 ${void_} · 못 잼 ${unmeasured})`, total: runs.length, passed, failed, void_, unmeasured };
}

export function judgeStage4(run: Stage4Run): Stage4Verdict {
  const { rounds, cumulative, ownerSaidDone } = run;

  // ── 무효: 안 된 회차를 다시 해서 통과로 만드는 길을 먼저 막는다 (사장님 09-21)
  const redone = rounds.filter((r) => r.redone);
  if (redone.length) return { kind: "무효", why: `다시 한 회차가 ${redone.length}번 있다 — 다섯 번은 **연속된 다섯 번**이다. 이 판은 무효이고 새 판을 연다` };

  if (rounds.length < TARGET_ROUNDS) return { kind: "못 잼", why: `고침이 ${rounds.length}/${TARGET_ROUNDS} 번` };
  if (ownerSaidDone === null) return { kind: "못 잼", why: "사장님이 '이제 됐다' 고 하셨는지 아직 모른다" };
  if (!cumulative) return { kind: "못 잼", why: "원본과 최종본을 견준 누적 diff 가 없다" };

  // ── 못 잼: 안 본 것·안 적은 것을 통과 쪽으로 반올림하지 않는다
  const noRequest = rounds.filter((r) => !r.request.trim());
  if (noRequest.length) return { kind: "못 잼", why: `요청 원문이 없는 회차 ${noRequest.length}번` };
  const unseen = rounds.filter((r) => r.asked === null || r.broke === null);
  // **확인은 그 회차 안에서 끝낸다.** 나중에 채운 확인은 안 친다 — 그러면 못 잰 회차를 뒤늦게 확인해
  // 통과로 바꿀 수 있다(3판, 사장님). 그래서 못 잼 회차가 있는 판은 **통과가 될 수 없다**.
  if (unseen.length) return { kind: "못 잼", why: `${unseen.length}번은 요청대로 바뀌었는지·깨졌는지를 아무도 안 봤다 — 이 판은 통과가 될 수 없다` };
  const byMachine = rounds.filter((r) => r.askedBy !== "사람" || r.brokeBy !== "사람");
  if (byMachine.length) return { kind: "못 잼", why: `${byMachine.length}번은 사람이 안 봤다 — 2·3번은 사람 칸이다` };

  // ── 통과·실패
  const ratio = (r: FixRound) => (r.totalLines > 0 ? r.changedLines / r.totalLines : 1);
  const whole = rounds.filter((r) => !r.patched || ratio(r) >= WHOLE_REWRITE);
  const broke = rounds.filter((r) => r.broke === true);
  const cum = cumulative.originalLines > 0 ? cumulative.changedLines / cumulative.originalLines : 1;
  const base = { rounds: rounds.length, wholeRewrites: whole.length, broke: broke.length, cumulativeRatio: Number(cum.toFixed(3)) };
  const why = [
    !ownerSaidDone ? "사장님이 아직 됐다고 안 하셨다" : null,
    whole.length ? `통째로 다시 쓴 회차 ${whole.length}번` : null,
    broke.length ? `되던 것이 깨진 회차 ${broke.length}번` : null,
    cum >= WHOLE_REWRITE ? `누적으로 원본의 ${(cum * 100).toFixed(0)}% 가 바뀌었다 — 통째로 다시 쓴 것과 같다` : null,
  ].filter(Boolean).join(" · ");
  if (!why) return { kind: "통과", why: `${rounds.length}번을 조각으로 고쳤고(누적 ${(cum * 100).toFixed(0)}%) 되던 것도 안 깨졌다 · 사장님이 됐다고 하셨다`, ...base };
  return { kind: "실패", why, ...base };
}
