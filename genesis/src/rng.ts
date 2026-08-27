/**
 * 시드 고정 난수.
 *
 * 세상은 무작위지만 재현 가능해야 한다. 같은 시드로 돌린 두 실행이
 * 완전히 같은 세상을 만들지 않으면, 두 에이전트를 비교한 결과는
 * 실력 차이가 아니라 운의 차이가 된다.
 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length)] as T;
}
