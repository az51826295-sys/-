import { APPROACH_AXES } from "./types.ts";
import type { Approach, Situation, Verdict } from "./types.ts";

/**
 * 법칙을 코드가 아니라 데이터로.
 *
 * v0.2까지 세계의 법칙은 `world.ts` 안에 박힌 함수 배열이었다. 그러면
 * 세계를 진화시켜도 우리가 미리 짜 둔 다섯 개를 켜고 끄는 것 이상은
 * 못 한다 — 우리가 상상하지 못한 형태의 규칙은 영원히 나타나지 않는다.
 *
 * 그래서 법칙을 작은 문법의 표현식으로 바꾼다. 이제 세계 생성기가
 * 조건을 **조합**할 수 있고, 우리가 손으로 쓴 적 없는 법칙이 나온다.
 * "열린 성장"이 구호가 아니라 문법의 성질이 되는 지점이다.
 */

export type Feature = "kind" | "audience" | "urgency";

/** 언제 적용되는가. 중첩으로 상호작용 법칙이 표현된다. */
export type Condition =
  | { kind: "eq"; feature: Feature; value: string }
  | { kind: "and"; left: Condition; right: Condition };

/** 무엇을 만족해야 하는가. */
export type Requirement = { axis: keyof Approach; value: string };

export type Law = {
  name: string;
  when: Condition;
  require: Requirement;
  penalty: Exclude<Verdict, "approved">;
};

export function holds(c: Condition, s: Situation): boolean {
  if (c.kind === "eq") return s[c.feature] === c.value;
  return holds(c.left, s) && holds(c.right, s);
}

export function satisfied(r: Requirement, a: Approach): boolean {
  return a[r.axis] === r.value;
}

/** 조건의 깊이 = 동시에 성립해야 하는 조건 수. */
export function depthOf(c: Condition): number {
  return c.kind === "eq" ? 1 : depthOf(c.left) + depthOf(c.right);
}

export function describe(c: Condition): string {
  return c.kind === "eq"
    ? `${c.feature}=${c.value}`
    : `${describe(c.left)} & ${describe(c.right)}`;
}

export function describeLaw(l: Law): string {
  return `${describe(l.when)} → ${l.require.axis}=${l.require.value} (${l.penalty})`;
}

/**
 * v0.2까지 손으로 쓴 다섯 법칙. 새 문법으로 그대로 옮겼다.
 *
 * 기존 실행 결과가 바뀌지 않아야 한다 — 문법을 바꾸면서 세계까지
 * 바뀌면 리팩터가 성공했는지 알 수 없다.
 */
export const CLASSIC_LAWS: Law[] = [
  {
    name: "executive_wants_short",
    when: { kind: "eq", feature: "audience", value: "executive" },
    require: { axis: "length", value: "short" },
    penalty: "revision",
  },
  {
    name: "research_requires_citations",
    when: { kind: "eq", feature: "kind", value: "research" },
    require: { axis: "cites", value: "yes" },
    penalty: "rejected",
  },
  {
    name: "client_wants_formal",
    when: { kind: "eq", feature: "audience", value: "client" },
    require: { axis: "tone", value: "formal" },
    penalty: "revision",
  },
  {
    name: "unhurried_work_must_be_deep",
    when: { kind: "eq", feature: "urgency", value: "low" },
    require: { axis: "depth", value: "deep" },
    penalty: "revision",
  },
  {
    // 상호작용 법칙. 요약이면서 동시에 급할 때만.
    name: "urgent_summary_must_be_short",
    when: {
      kind: "and",
      left: { kind: "eq", feature: "kind", value: "summary" },
      right: { kind: "eq", feature: "urgency", value: "high" },
    },
    require: { axis: "length", value: "short" },
    penalty: "revision",
  },
];

/**
 * 기준 변경 — 법칙 하나의 요구가 뒤집힌다.
 *
 * 축의 반대값으로 바꾼다. 어제까지 정답이던 것이 오늘부터 오답이다.
 */
export function flipLaw(law: Law): Law {
  const options = APPROACH_AXES[law.require.axis] as readonly string[];
  const other = options.find((v) => v !== law.require.value) as string;
  return {
    ...law,
    name: `${law.name}__flipped`,
    require: { axis: law.require.axis, value: other },
  };
}

/** 기존 세계의 기준 변경: 세 번째 법칙(고객 어조)이 뒤집힌다. */
export function flipNamed(laws: Law[], name: string): Law[] {
  return laws.map((l) => (l.name === name ? flipLaw(l) : l));
}
