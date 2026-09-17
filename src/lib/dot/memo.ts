/**
 * 기억 — **모델이 낸 "기억할 것" 을 그대로 믿지 않는다.**
 *
 * 09-11 시행착오학습 65회차, 운영 표를 재 보니:
 *   - 서하가 사장님에 대해 "RPG 장르를 좋아한다" 를 **세 번** 적었다. 사장님은 RPG 라는 말을
 *     한 번도 안 했다 — 서하가 "어떤 장르 좋아해?" 하고 물은 뒤 스스로 지어냈다.
 *   - "게임 만드는 AI 를 개발하고 시행착오가 많아 힘들어함" 이 말만 바꿔 **세 번** 들어 있었다.
 *     12칸짜리 기억이 같은 말로 차서, 진짜 새 사실이 밀려 나간다.
 *
 * 프롬프트에 "지어내지 마라" 는 이미 적혀 있었다. 안 지켜졌다. 부탁은 안 되고 **문이** 된다:
 *   1) 방금 사용자가 한 말에 **없는 낱말로 된 기억은 버린다.** 기억은 "방금 말한 것" 이어야 하므로
 *      그 한 문장과만 대조하면 된다. 남의 말을 뒤질 필요가 없다.
 *   2) 이미 있는 기억과 **같은 얘기면 갈아 끼운다**(덧붙이지 않는다). 낱말 집합이 6할 이상 겹치면 같은 얘기다.
 *
 * 전부 세면 나오는 것이다. 모델도 DB 도 없이 시험한다.
 */

/** 낱말 뿌리: 2글자 이상 한글·영숫자 덩어리의 **앞 두 글자**. "고양이를"·"고양이" 가 같은 뿌리가 된다(조사 무시). */
export function roots(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/[가-힣A-Za-z0-9]{2,}/g)) out.add(m[0].slice(0, 2).toLowerCase());
  return out;
}

/** 기억 문장의 뿌리 중 몇 할이 사용자 말에 있나. */
export function support(fact: string, userText: string): number {
  const f = roots(fact);
  if (f.size === 0) return 0;
  const u = roots(userText);
  let hit = 0;
  for (const r of f) if (u.has(r)) hit++;
  return hit / f.size;
}

/** 두 기억이 같은 얘기인가(자카드 ≥ 0.6). */
export function sameFact(a: string, b: string): boolean {
  const A = roots(a), B = roots(b);
  if (A.size === 0 || B.size === 0) return a.trim() === b.trim();
  let inter = 0;
  for (const r of A) if (B.has(r)) inter++;
  return inter / (A.size + B.size - inter) >= 0.6;
}

export const MAX_MEMO = 12;
/** 기억 뿌리의 이만큼은 사용자 말에 있어야 받아 준다. 절반: "고양이를 키운다" ← "고양이 키우는데" 는 통과, "RPG 를 좋아함" ← (RPG 없음) 은 탈락. */
export const MIN_SUPPORT = 0.5;

export type MemoDecision = { memo: string[]; accepted: boolean; why: "empty" | "unsupported" | "replaced" | "added" };

/**
 * 모델이 낸 `remember` 를 기억에 넣을지 정한다.
 * 문장 자체는 안 고친다 — 고치면 그것도 지어내는 것이다. 받거나 버리거나.
 */
export function mergeMemo(memo: string[], fact: string, userText: string): MemoDecision {
  const f = fact.trim();
  if (!f) return { memo, accepted: false, why: "empty" };
  if (support(f, userText) < MIN_SUPPORT) return { memo, accepted: false, why: "unsupported" };
  const idx = memo.findIndex((m) => sameFact(m, f));
  if (idx >= 0) {
    // 같은 얘기 — 옛것을 빼고 새것을 **맨 뒤에**. 최근 것이 끝에 있어야 밀려날 때 오래된 것부터 나간다.
    const next = [...memo.slice(0, idx), ...memo.slice(idx + 1), f].slice(-MAX_MEMO);
    return { memo: next, accepted: true, why: "replaced" };
  }
  return { memo: [...memo, f].slice(-MAX_MEMO), accepted: true, why: "added" };
}
