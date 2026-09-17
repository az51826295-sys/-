/**
 * 자가 재는 값의 종류 (119회차 09-15).
 *
 * 유니티 검사가 재는 값은 **세는 것**(개수)과 **이어진 것**(길이·비율)이 섞여 있다. 그 둘은 같은 기대치를 쓰면 안 된다:
 * 개수는 `18~18` 이 정확히 잴 수 있지만, 이어진 값에 `6.3~6.3` 을 적으면 **어떤 값도 통과할 수 없다**(실측 6.295).
 *
 * 실제로 그렇게 떨어진 줄이 5건이었다(`기대_head_count — 실측 6.295, 기대 6.3~6.3`). 게임은 멀쩡한데 계획이 자기가
 * 통과 못 하는 시험을 써 놓고 떨어진 것이다. 42회차(빈 범위)·57회차(숫자 자에 참/거짓)와 **같은 종류의 고장**이고,
 * 그 둘은 이미 "실패" 가 아니라 "못 잼" 으로 적고 있다. 이것도 같은 자리에 놓는다.
 *
 * 두 군데서 막는다:
 *   계획할 때 — 폭이 0이면 **조금 벌려서** 잴 수 있게 만든다(`widenExpectation`).
 *   잴 때 — 그래도 폭이 0으로 들어오면 실패가 아니라 "못 잼" 으로 적는다(`api/unity/checks`).
 * 자를 느슨하게 하는 것이 아니다. 잴 수 없는 시험을 "떨어졌다" 고 적지 않는 것뿐이다.
 */

/** 개수처럼 딱 떨어지는 값 — `18~18` 이 올바른 기대치다. */
export const COUNT_MEASURES = new Set(["coin_count", "landmark_count", "ground_color_count", "parts_attached", "part_triangles"]);

/** 참/거짓으로 재는 값 — min·max 가 아니라 equals 로 적는다. */
export const BOOLEAN_MEASURES = new Set(["hud_score_visible", "part_covers_bone"]);

/** 이어진 값(길이·비율·위치) — 폭이 0인 범위는 못 잰다. */
export function isContinuous(measure: string): boolean {
  return !COUNT_MEASURES.has(measure) && !BOOLEAN_MEASURES.has(measure);
}

export type Expectation = { measure: string; min?: number | null; max?: number | null; equals?: boolean | null; why?: string };

/** 폭이 0인 이어진 값의 범위인가 — 그러면 아무 값도 못 지나간다. */
export function isUnmeasurableRange(e: Expectation): boolean {
  return (
    typeof e.equals !== "boolean" &&
    typeof e.min === "number" && typeof e.max === "number" &&
    e.min === e.max && isContinuous(e.measure)
  );
}

/**
 * 폭이 0이면 잴 수 있을 만큼만 벌린다. 0.2% 또는 0.001 중 큰 쪽 — 재는 값들이 m·비율 단위라 이 정도면
 * 소수점 흔들림은 통과하고 뜻 있는 차이는 그대로 걸린다(6.3 → 6.2874~6.3126, 실측 6.295 통과).
 * 벌린 것은 `why` 에 적어 둔다 — 자가 몰래 느슨해지면 안 된다.
 */
export function widenExpectation<T extends Expectation>(e: T): { fixed: T; widened: boolean } {
  if (!isUnmeasurableRange(e)) return { fixed: e, widened: false };
  const v = e.min as number;
  const pad = Math.max(Math.abs(v) * 0.002, 0.001);
  return {
    fixed: { ...e, min: Number((v - pad).toFixed(4)), max: Number((v + pad).toFixed(4)), why: `${e.why ?? ""} (${v} 딱 맞추기는 못 재서 ±${pad.toFixed(4)} 로 벌림)`.trim() },
    widened: true,
  };
}
