/**
 * **4단계 본판 — 같이 게임 만들기** (205회차 2026-09-21 밤, 판을 열기 **전에** 잠근다).
 *
 * 최소판은 *"로키가 혼자 게임 하나를 끝까지 만드나"* 였다. 본판은 **같이 만드나**다.
 * 사장님이 걸린 데를 말하고, 로키가 고치고, 다시 해 보고, 사장님이 "이제 됐다" 할 때까지.
 *
 * 1단계에서 사장님이 정한 문장이 그대로 여기 이어진다:
 * *"웹 게임 하나를 말로 다섯 번 고쳐도 통째로 안 다시 만든다."*
 *
 * **이건 비교 시험이 아니다.** 한 번 되느냐의 문제이므로 띠·신뢰구간·힘 점검은 안 쓴다.
 * 쓰는 것은 짧은 통과 목록 하나다(최소판과 같은 꼴).
 */

export type FixRound = {
  /** 몇 번째 고침인가 */
  n: number;
  /** 조각 고침 경로를 탔나(`content_json.patched`) */
  patched: boolean;
  /** 바뀐 줄 수 / 그 파일의 전체 줄 수 */
  changedLines: number;
  totalLines: number;
  /** 사장님이 말한 것이 실제로 바뀌었나. 사람이 보거나 기계가 확인한다. 모르면 null. */
  asked: boolean | null;
  /** 되던 것이 깨졌나. 고리가 잡았거나 사람이 봤다. 모르면 null. */
  broke: boolean | null;
};

/** 통째로 다시 쓴 것으로 치는 선. **절반**이다 — 재량으로 고른 값이 아니라 자연스러운 경계다. */
export const WHOLE_REWRITE = 0.5;

export type Stage4Verdict =
  | { kind: "못 잼"; why: string; need: number }
  | { kind: "통과" | "미통과"; why: string; rounds: number; wholeRewrites: number; broke: number; unknown: number };

/** 잠근 목표: **다섯 번의 고침**. 1단계에서 사장님이 쓴 숫자를 그대로 쓴다. */
export const TARGET_ROUNDS = 5;

export function judgeStage4(rounds: FixRound[], ownerSaidDone: boolean | null): Stage4Verdict {
  if (rounds.length < TARGET_ROUNDS) return { kind: "못 잼", why: `고침이 ${rounds.length}/${TARGET_ROUNDS} 번`, need: TARGET_ROUNDS - rounds.length };
  if (ownerSaidDone === null) return { kind: "못 잼", why: "사장님이 '이제 됐다' 고 하셨는지 아직 모른다", need: 0 };

  const ratio = (r: FixRound) => (r.totalLines > 0 ? r.changedLines / r.totalLines : 1);
  // **통째로 다시 쓴 판**: 조각 경로를 안 탔거나, 절반 넘게 바뀌었다.
  const whole = rounds.filter((r) => !r.patched || ratio(r) >= WHOLE_REWRITE);
  const broke = rounds.filter((r) => r.broke === true);
  // **모르는 것은 통과 쪽으로 반올림하지 않는다**(09-21 에 기계 심판이 못 넘는 발판을 통과시켰다).
  const unknown = rounds.filter((r) => r.asked === null || r.broke === null);
  if (unknown.length) return { kind: "못 잼", why: `${unknown.length}번은 요청대로 바뀌었는지·깨졌는지를 아무도 안 봤다`, need: 0 };

  const ok = ownerSaidDone && whole.length === 0 && broke.length === 0;
  const base = { rounds: rounds.length, wholeRewrites: whole.length, broke: broke.length, unknown: 0 };
  if (ok) return { kind: "통과", why: `${rounds.length}번을 조각으로 고쳤고 되던 것도 안 깨졌다 · 사장님이 됐다고 하셨다`, ...base };
  const why = [
    !ownerSaidDone ? "사장님이 아직 됐다고 안 하셨다" : null,
    whole.length ? `통째로 다시 쓴 판 ${whole.length}번` : null,
    broke.length ? `되던 것이 깨진 판 ${broke.length}번` : null,
  ].filter(Boolean).join(" · ");
  return { kind: "미통과", why, ...base };
}
