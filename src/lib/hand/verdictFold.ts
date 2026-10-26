/**
 * **스프라이트 하나로는 못 재는 것을 "어긋남" 으로 적지 않는다** (10-26).
 *
 * 내가 붙는 쪽이 되어 돌려 보니 걸렸다: 투명 배경 스프라이트를 내면
 * `ground_contrast` 가 **더 나빠진다**(44.5 → 11.3). 당연하다 — 그림에 바닥이 없다.
 * 즉 **투명 스프라이트 하나로는 `min_ground_contrast 60` 을 절대 넘을 수 없는데**
 * 그걸로 떨어뜨리고 있었다. 빈 범위·폭 0 기대치와 같은 집안이다
 * ([[unmeasurable-test-is-not-a-failure]]: 잴 수 없는 시험은 실패가 아니다).
 *
 * 그래서 스프라이트일 때 바닥 관련 줄을 **못 잼**으로 옮긴다. 통과로 바꾸지 않는다 —
 * 못 잼은 합격이 아니다. 그리고 **무엇을 더 내면 잴 수 있는지**를 그 자리에 적는다.
 */

export type RawVerdict = {
  verdict?: string;
  fail?: string[];
  undefined?: string[];
  [k: string]: unknown;
};

export type Kind = "sprite" | "in_context";

/** 바닥이 있어야 재는 검사. 배경 없이 낸 그림에서는 뜻이 없다. */
const 바닥말 = ["바닥 대비", "ground_contrast", "땅에 묻힌다", "ground"];

/** 그림 **세트**를 재는 값. 한 장만 내면 늘 0 이라 재는 뜻이 없다. */
const 세트말 = ["color_spread", "색 흔들림"];

const 바닥것 = (s: string) => 바닥말.some((w) => s.includes(w));
const 세트것 = (s: string) => 세트말.some((w) => s.includes(w));

/**
 * 판정을 다시 접는다.
 *
 * `kind`가 스프라이트면 바닥 줄을 못 잼으로, 그림이 한 장이면 세트 줄을 못 잼으로.
 * 그 다음 **어긋남이 하나라도 있으면 어긋남, 아니면 못 잼이 있으면 못 잼, 아니면 맞음.**
 * 못 잼을 맞음으로 올리지 않는다.
 */
export function foldVerdict(v: RawVerdict, kind: Kind, imageCount: number): RawVerdict {
  const fail0 = v.fail ?? [];
  const und0 = v.undefined ?? [];

  const 옮길것: string[] = [];
  const 남을것: string[] = [];
  for (const f of fail0) {
    if (kind === "sprite" && 바닥것(f)) { 옮길것.push(f + " → 배경 위 장면이 없어 못 잼"); continue; }
    if (imageCount <= 1 && 세트것(f)) { 옮길것.push(f + " → 한 장만 내서 못 잼"); continue; }
    남을것.push(f);
  }

  const und = [...und0, ...옮길것];
  if (kind === "sprite" && 옮길것.some(바닥것)) {
    und.push("바닥 대비를 재려면 캐릭터를 배경 위에 올린 그림을 `kind: \"in_context\"` 로 한 번 더 내라");
  }

  const verdict = 남을것.length ? "FAIL" : und.length ? "UNDEFINED" : "PASS";
  return { ...v, verdict, fail: 남을것, undefined: und };
}
