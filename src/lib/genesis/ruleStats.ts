import { createHash } from "node:crypto";

/**
 * 검증된 규칙 고리의 셈 (100회차 09-14, 사장님 "2,3").
 *
 * 규칙 하나를 **본 적 없는 사례(보류분)** 에 대 보고, 그 규칙을 어긴 사례가 실제로 더 자주 실패했는지를 센다.
 * 모델이 "좋은 규칙 같다" 고 말하는 것은 증거가 아니다 — 판정은 여기 숫자로만 한다.
 *
 *               실패   성공
 *   어김(위반)     a      b
 *   안 어김        c      d
 *
 * lift = P(실패|어김) − P(실패|안 어김). 효과가 있으면 양수.
 * p = 한쪽 피셔 정확 검정 — "어김과 실패가 무관하다" 면 a 이상이 나올 확률. 표본이 수십 건이라 근사가 아니라 정확 검정을 쓴다.
 * Genesis 실험 교훈(실험 6·7A): 효과의 원천은 **관측 → 제안 → 블라인드 검증** 고리다. 여기가 블라인드 검증이다.
 */

export type Counts = { a: number; b: number; c: number; d: number };

export function countsFrom(rows: { bad: boolean; violates: boolean }[]): Counts {
  const k: Counts = { a: 0, b: 0, c: 0, d: 0 };
  for (const r of rows) {
    if (r.violates && r.bad) k.a++;
    else if (r.violates && !r.bad) k.b++;
    else if (!r.violates && r.bad) k.c++;
    else k.d++;
  }
  return k;
}

export function lift(k: Counts): number | null {
  if (k.a + k.b === 0 || k.c + k.d === 0) return null;
  return k.a / (k.a + k.b) - k.c / (k.c + k.d);
}

const logFactCache: number[] = [0];
function logFact(n: number): number {
  for (let i = logFactCache.length; i <= n; i++) logFactCache[i] = logFactCache[i - 1] + Math.log(i);
  return logFactCache[n];
}
const logChoose = (n: number, k: number) => (k < 0 || k > n ? -Infinity : logFact(n) - logFact(k) - logFact(n - k));

/** 한쪽 피셔: 위반자 중 실패 수가 a 이상일 확률(여백 고정). 작을수록 "우연이 아니다". */
export function fisherOneSided(k: Counts): number {
  const N = k.a + k.b + k.c + k.d;
  const K = k.a + k.c; // 실패 총수
  const n = k.a + k.b; // 위반 총수
  if (N === 0 || n === 0 || K === 0) return 1;
  const denom = logChoose(N, n);
  let p = 0;
  for (let x = k.a; x <= Math.min(K, n); x++) p += Math.exp(logChoose(K, x) + logChoose(N - K, n - x) - denom);
  return Math.min(1, p);
}

/**
 * 채택 문턱. 수십 건 규모에 맞춘 값이고, 일부러 까다롭다 — 틀린 규칙은 이후 모든 일의 프롬프트에 들어가 조용히 망친다.
 * 사례가 모자라면 규칙을 시험하지도 않는다(돈을 아낀다).
 */
export const ADOPT = { minBadHoldout: 3, minOkHoldout: 3, minSupport: 3, minBadViolators: 2, minLift: 0.2, maxP: 0.1 } as const;

export function decide(k: Counts): { adopt: boolean; reason: string; lift: number | null; p: number; support: number } {
  const L = lift(k);
  const p = fisherOneSided(k);
  const support = k.a + k.b;
  const fmt = (x: number | null) => (x === null ? "—" : x.toFixed(2));
  if (support < ADOPT.minSupport) return { adopt: false, reason: `어긴 사례 ${support}건(<${ADOPT.minSupport}) — 판단 불가`, lift: L, p, support };
  if (k.a < ADOPT.minBadViolators) return { adopt: false, reason: `어기고 실패한 사례 ${k.a}건(<${ADOPT.minBadViolators})`, lift: L, p, support };
  if (L === null || L < ADOPT.minLift) return { adopt: false, reason: `효과 lift ${fmt(L)} (<${ADOPT.minLift})`, lift: L, p, support };
  if (p > ADOPT.maxP) return { adopt: false, reason: `우연일 수 있음 p=${p.toFixed(3)} (>${ADOPT.maxP})`, lift: L, p, support };
  return { adopt: true, reason: `채택: lift ${fmt(L)}, p=${p.toFixed(3)}, 어긴 사례 ${support}건`, lift: L, p, support };
}

/** 보류분(검증용) 인가. 사례 id 로 정해진다 — 날마다 같은 사례가 같은 쪽에 서야 제안에 쓴 사례로 검증하는 일이 없다. 약 40%. */
export function isHoldout(id: string): boolean {
  const h = createHash("sha1").update(`genesis-holdout-v1:${id}`).digest();
  return h[0] % 10 < 4;
}
