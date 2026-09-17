/**
 * 잴 수 없는 기대치의 자 (119회차 09-15). 돈 0, 모델 없음, DB 안 씀.
 *   npx tsx engine/tools/expectation_probe.mts
 *
 * 실제로 떨어진 줄을 그대로 되살려 본다: `기대_head_count — 실측 6.295, 기대 6.3~6.3` (5건).
 * 자가 고장을 재현해 잡는 걸 먼저 보이고(108회차 규칙), 그다음 정상이 통과하는 걸 본다.
 */
import { isUnmeasurableRange, widenExpectation, isContinuous, COUNT_MEASURES } from "../../src/lib/skills/appBuild/measures";

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

// ── 고장 재현: 실제로 5건을 떨어뜨린 그 기대치
const broken = { measure: "head_count", min: 6.3, max: 6.3, why: "등신비 불변 확인" };
check("고장 재현: head_count 6.3~6.3 은 못 잰다고 판정", isUnmeasurableRange(broken));
const { fixed, widened } = widenExpectation(broken);
check(`벌린 뒤 범위 ${fixed.min}~${fixed.max}`, widened && fixed.min! < 6.3 && fixed.max! > 6.3);
const inRange = (v: number) => v >= fixed.min! && v <= fixed.max!;
check("실측 6.295 가 이제 통과", inRange(6.295), fixed);
check("뜻 있는 차이(6.0·6.6)는 그대로 떨어짐", !inRange(6.0) && !inRange(6.6), fixed);
check("벌린 사실을 why 에 적었다", (fixed.why ?? "").includes("벌림"), fixed.why);

// ── 개수는 딱 맞추기가 옳다 — 벌리면 안 된다
for (const m of COUNT_MEASURES) {
  check(`개수 ${m} 18~18 은 그대로 둔다`, !isUnmeasurableRange({ measure: m, min: 18, max: 18 }) && !widenExpectation({ measure: m, min: 18, max: 18 }).widened);
}
check("개수는 이어진 값이 아니다", !isContinuous("coin_count") && isContinuous("head_count") && isContinuous("part_offset_m"));

// ── 멀쩡한 기대치는 안 건드린다
for (const e of [
  { measure: "player_viewport_x", min: 0.25, max: 0.41 },
  { measure: "hud_score_visible", equals: true },
  { measure: "body_height_m", min: 1.55, max: 1.85 },
  { measure: "camera_distance_m", min: null, max: 5 },
]) {
  check(`멀쩡한 기대치 ${e.measure} 는 그대로`, !isUnmeasurableRange(e) && !widenExpectation(e).widened, e);
}

// ── 0 언저리에서도 폭이 생겨야 한다(비율은 0 을 딱 맞추라고 쓰는 경우가 있다)
const zero = widenExpectation({ measure: "part_offset_m", min: 0, max: 0 });
check(`0~0 도 벌어진다 (${zero.fixed.min}~${zero.fixed.max})`, zero.widened && zero.fixed.max! > 0);

console.log(bad ? `실패 ${bad}` : "전부 통과");
process.exitCode = bad ? 1 : 0;
