/**
 * 판정을 학습 라벨로 바꾸는 한 곳 (129회차 09-16).
 *
 * 왜 필요한가: 우리 판정은 **많이 말할수록 불리하다.** 126회차에 Astra 를 시험판에 대 보다 드러났다 —
 * 99개 주장 중 97개를 맞힌 판(PARTIAL)이 17개 중 17개 맞힌 판(PASS)보다 나쁘게 매겨졌다.
 * 그 라벨이 그대로 학습 재료가 되면(`cases.ts`) **말을 아끼는 쪽이 옳다고 배운다.**
 *
 * 검사에는 두 종류가 있다:
 *   **계약(contract)** — 개수가 고정이다. 영상 길이·장면 수·자막 수, 유니티 규격·기대치.
 *                        하나라도 어기면 어긴 것이다. 비율로 봐주면 안 된다.
 *   **주장(claim)**   — 말한 양만큼 늘어난다. 분석의 `근거_N`·`숫자_N` 은 주장 하나에 검사 하나다.
 *                        99개 중 2개가 틀린 것과 17개 중 0개가 틀린 것을 같은 자로 재면 안 된다.
 *
 * 그래서 **사람에게 보이는 합격 문턱은 그대로 두고**(PASS 는 여전히 흠 없음), 학습 라벨만 갈라 쓴다.
 * 문턱을 낮추는 게 아니다 — 자가 재는 대상이 다르다는 것을 인정하는 것이다.
 */

export type VerdictPayload = {
  verdict?: string | null;
  passed?: number;
  failed?: number;
  /** 검사 개수가 말한 양에 따라 늘어나는가(분석의 근거·숫자). 계약형 검사는 false/없음. */
  scales?: boolean;
  /** 맞힌 비율. `scales` 인 판정에만 뜻이 있다. */
  rate?: number;
  cases?: { name: string; result: string }[];
};

/** 주장형 판정에서 이 아래로 떨어지면 실패로 센다. 99개 중 2개 틀림(0.98)은 통과, 10개 중 2개(0.80)는 실패. */
export const CLAIM_RATE_FLOOR = 0.9;
/** 비율이 좋아도 틀린 주장이 이만큼 많으면 실패다 — 1,000개 중 50개 틀린 것을 비율로 봐주지 않는다. */
export const CLAIM_MAX_FAILED = 5;

/** 맞힌 비율. 잰 것이 없으면 null. */
export function claimRate(v: VerdictPayload | null | undefined): number | null {
  if (!v) return null;
  if (typeof v.rate === "number") return v.rate;
  const p = v.passed ?? 0, f = v.failed ?? 0;
  return p + f > 0 ? p / (p + f) : null;
}

/**
 * 이 결과물을 학습에서 **실패 사례**로 셀 것인가.
 * 계약형: PASS 가 아니면 실패. 주장형: 비율이 문턱 아래거나 틀린 개수가 너무 많으면 실패.
 */
export function isBadForLearning(v: VerdictPayload | null | undefined): boolean {
  if (!v) return false;
  if (v.scales === true) {
    const r = claimRate(v);
    if (r === null) return v.verdict !== "PASS";
    return r < CLAIM_RATE_FLOOR || (v.failed ?? 0) > CLAIM_MAX_FAILED;
  }
  return v.verdict !== "PASS";
}

/** 사람이 읽을 한 줄. 주장형이면 비율을 같이 적는다 — 많이 말한 것이 숨지 않게. */
export function verdictLine(v: VerdictPayload | null | undefined): string {
  if (!v) return "판정 없음";
  const r = claimRate(v);
  const base = `${v.verdict ?? "?"} · 통과 ${v.passed ?? 0} · 떨어짐 ${v.failed ?? 0}`;
  return v.scales === true && r !== null ? `${base} (맞힌 비율 ${Math.round(r * 100)}%)` : base;
}
