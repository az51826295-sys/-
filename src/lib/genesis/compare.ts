/**
 * **둘을 견주는 자 — 관측값이 아니라 신뢰구간으로** (204회차 09-21, 사장님).
 *
 * > *"지금 규칙은 '차이가 있나' 가 아니라 '차이가 40%p보다 큰가' 를 묻고 있어요. 관측값을 띠와 비교하는
 * >  방식이라 그래요. … 띠는 **행동을 바꿀 만한 최소 차이**로 정하고, 판정은 관측값 대신 **신뢰구간**으로
 * >  하는 게 맞아요. 구간 전체가 띠 밖이면 차이 있음, 구간 전체가 띠 안이면 무시해도 될 만큼 비슷함,
 * >  걸쳐 있으면 모름. 이렇게 하면 판을 늘릴수록 모름이 줄어들어요."*
 *
 * 왜 바뀌어야 했나: 2단계 자는 관측 차이를 고정된 40%p 띠와 견줬다. 그러면 **판을 늘릴수록** 관측 차이가
 * 참값 근처로 모여 띠를 못 넘고, 진짜 20%p 차이도 "모름" 으로 들어간다(힘 24% → 5%). 구간으로 바꾸면
 * 판이 늘수록 구간이 좁아져 **모름이 줄어든다** — 방향이 반대가 된다.
 *
 * 이것은 심판 설계의 **우위·열위·구별불가 3갈래 + 등가 검정**(judge-bench-v1)과 같은 구조다.
 *
 * 구간은 Wilson, 차이는 Newcombe 방식. 표본이 작아도 0%·100% 에서 무너지지 않는다.
 */

export type Side = { n: number; ok: number };
export type CompareVerdict = {
  kind: "우위" | "열위" | "등가" | "모름";
  why: string;
  diff: number;
  lo: number;
  hi: number;
};

/** Wilson 점수 구간. z 는 기본 1.96(95%). */
export function wilson(n: number, x: number, z = 1.96): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: NaN, lo: 0, hi: 1 };
  const p = x / n;
  const d = n + z * z;
  const c = (x + (z * z) / 2) / d;
  const h = (z / d) * Math.sqrt((x * (n - x)) / n + (z * z) / 4);
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

/**
 * `a` 가 `b` 보다 나은가. `rope` 는 **행동을 바꿀 만한 최소 차이**(예: 0.10 = 10%p).
 * 그보다 작은 차이는 알아도 우리가 하는 일이 안 바뀌므로 "등가" 로 친다.
 */
export function compare(a: Side, b: Side, rope: number, z = 1.96): CompareVerdict {
  if (a.n === 0 || b.n === 0) return { kind: "모름", why: "한쪽이 비어 있다", diff: NaN, lo: -1, hi: 1 };
  const A = wilson(a.n, a.ok, z), B = wilson(b.n, b.ok, z);
  const diff = A.p - B.p;
  // Newcombe: 두 Wilson 구간을 차이 구간으로 합친다
  const lo = diff - Math.sqrt((A.p - A.lo) ** 2 + (B.hi - B.p) ** 2);
  const hi = diff + Math.sqrt((A.hi - A.p) ** 2 + (B.p - B.lo) ** 2);
  const pct = (x: number) => `${(x * 100).toFixed(0)}%p`;
  const span = `구간 ${pct(lo)}~${pct(hi)} · 띠 ±${pct(rope)}`;
  if (lo > rope) return { kind: "우위", why: `구간 전체가 띠 위다 — ${span}`, diff, lo, hi };
  if (hi < -rope) return { kind: "열위", why: `구간 전체가 띠 아래다 — ${span}`, diff, lo, hi };
  if (lo > -rope && hi < rope) return { kind: "등가", why: `구간 전체가 띠 안이다 — 달라도 행동이 안 바뀐다 · ${span}`, diff, lo, hi };
  return { kind: "모름", why: `구간이 띠에 걸쳐 있다 — 판이 모자라다 · ${span}`, diff, lo, hi };
}

/** 이 크기로 **"모름" 말고 다른 답이 나올 수 있나.** 잠그기 전에 묻는다(09-21 규칙). */
export function decisivePower(trueA: number, trueB: number, nA: number, nB: number, rope: number, z = 1.96): number {
  const C = (n: number, k: number) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
  const pmf = (n: number, p: number) => Array.from({ length: n + 1 }, (_, k) => C(n, k) * p ** k * (1 - p) ** (n - k));
  const pa = pmf(nA, trueA), pb = pmf(nB, trueB);
  let hit = 0;
  for (let x = 0; x <= nA; x++) for (let y = 0; y <= nB; y++) {
    if (compare({ n: nA, ok: x }, { n: nB, ok: y }, rope, z).kind !== "모름") hit += pa[x] * pb[y];
  }
  return hit;
}
