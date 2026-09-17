/**
 * "한 번도 안 떨어진 자" 다섯을 고장으로 시험한다 (130회차 09-16). 돈 0, 유니티 0, DB 0.
 *   npx tsx engine/tools/standing_checks_probe.mts
 *
 * 124회차 자 감사가 찾은 것: `기대_ground_color_count` 45번 · `규격_사람_키` 22번 · `규격_등신` 22번 ·
 * `기대_part_size_ratio` 21번 · `기대_hud_score_visible` 20번 — **전부 한 번도 안 떨어졌다.**
 * 이빨이 없는 건지, 아직 그 고장이 안 난 건지는 **고장을 넣어 봐야** 안다(108회차 규칙).
 *
 * 넣는 고장은 지어낸 것이 아니라 **실제로 있었던 것**이다:
 *   53회차 파일 단위가 바뀌어 캐릭터가 100배 · 49회차 투구가 머리의 1.3% · 09-09 투구 삼각형 30,356개.
 */
import { standingChecks, expectationChecks, isOneSided } from "../../src/lib/skills/appBuild/standing";

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };
const res = (cs: { name: string; result: string; message?: string | null }[], n: string) => cs.find((c) => c.name === n);

// ── 규격_사람_키 — 22번 재서 한 번도 안 떨어졌다. 진짜 잡나?
{
  const okNow = standingChecks({ body_height_m: 1.996 });          // 기준 맨몸 실측
  check("규격_사람_키: 정상 1.996 m 통과", res(okNow, "규격_사람_키")?.result === "Passed");
  const x100 = standingChecks({ body_height_m: 199.6 });           // 53회차 실제 고장: 파일 단위가 바뀌어 100배
  check("규격_사람_키: **100배(199.6 m) 잡는다** — 53회차에 이 줄이 없어 다 통과했던 고장", res(x100, "규격_사람_키")?.result === "Failed", res(x100, "규격_사람_키"));
  const tiny = standingChecks({ body_height_m: 0.02 });            // 1/100
  check("규격_사람_키: 1/100(0.02 m) 잡는다", res(tiny, "규격_사람_키")?.result === "Failed");
}

// ── 규격_등신 — 22번 안 떨어짐
{
  const okNow = standingChecks({ head_count: 6.295 });
  check("규격_등신: 정상 6.3 등신 통과", res(okNow, "규격_등신")?.result === "Passed");
  const chibi = standingChecks({ head_count: 2.7 });               // 실제로 있던 값(3등신 고양이)
  check("규격_등신: 3등신 고양이(2.7)도 통과 — 넓게 잡은 게 의도다", res(chibi, "규격_등신")?.result === "Passed");
  const broken = standingChecks({ head_count: 40 });               // 머리가 40분의 1 = 단위 깨짐
  check("규격_등신: **40등신 잡는다**", res(broken, "규격_등신")?.result === "Failed", res(broken, "규격_등신"));
  check("규격_등신: 1등신(머리만)도 잡는다", res(standingChecks({ head_count: 1 }), "규격_등신")?.result === "Failed");
}

// ── 규격_조각_크기 — 이건 실제로 13번 떨어졌다(0.01). 그래도 양쪽 다 잡는지 본다.
{
  check("규격_조각_크기: 49회차 고장(머리의 1.3%) 잡는다", res(standingChecks({ parts_attached: 1, part_size_ratio: 0.013 }), "규격_조각_크기")?.result === "Failed");
  check("규격_조각_크기: 삼키는 크기(3.0배)도 잡는다", res(standingChecks({ parts_attached: 1, part_size_ratio: 3.0 }), "규격_조각_크기")?.result === "Failed");
  check("규격_조각_크기: 알맞은 1.29배 통과", res(standingChecks({ parts_attached: 1, part_size_ratio: 1.29 }), "규격_조각_크기")?.result === "Passed");
  check("규격_조각_삼각형: 09-09 실측 30,356개 잡는다", res(standingChecks({ parts_attached: 1, part_triangles: 30356 }), "규격_조각_삼각형")?.result === "Failed");
}

// ── 조각이 없으면 조각 줄은 아예 안 붙는다(엉뚱한 실패를 만들지 않는다)
{
  const none = standingChecks({ body_height_m: 1.9, part_size_ratio: 0.01 });
  check("조각이 0개면 조각 줄을 안 붙인다", !res(none, "규격_조각_크기"), none.map((c) => c.name));
}

// ── 기대_hud_score_visible — 20번 안 떨어짐. 참/거짓이라 잡을 수 있나?
{
  const e = [{ measure: "hud_score_visible", equals: true, why: "점수가 보인다" }];
  check("기대_hud_score_visible: 보이면 통과", res(expectationChecks(e, { hud_score_visible: true }), "기대_hud_score_visible")?.result === "Passed");
  check("기대_hud_score_visible: **안 보이면 잡는다**", res(expectationChecks(e, { hud_score_visible: false }), "기대_hud_score_visible")?.result === "Failed");
}

// ── 기대_ground_color_count — 45번 안 떨어졌다. 계획이 쓴 범위가 `3~∞` 였다(한쪽만 막힘).
{
  const oneSided = { measure: "ground_color_count", min: 3, max: null, why: "바닥 색 셋 이상" };
  check("기대_ground_color_count: 한쪽만 막힌 자다(`3~∞`) — 위로는 못 떨어진다", isOneSided(oneSided as never));
  check("  아래로는 잡는다(2개)", res(expectationChecks([oneSided as never], { ground_color_count: 2 }), "기대_ground_color_count")?.result === "Failed");
  check("  위로는 못 잡는다(999개도 통과) — 45번 안 떨어진 진짜 이유", res(expectationChecks([oneSided as never], { ground_color_count: 999 }), "기대_ground_color_count")?.result === "Passed");
  const twoSided = { measure: "ground_color_count", min: 3, max: 8, why: "바닥 색 3~8" };
  check("  양쪽 막으면 999개를 잡는다", res(expectationChecks([twoSided as never], { ground_color_count: 999 }), "기대_ground_color_count")?.result === "Failed");
}

// ── 기대_part_offset_ratio — 131회차에 **기계가** 찾았다. 15번 전부 `-∞~0.35` 였다.
// 두 가지가 겹쳐 있었다: (1) 아래가 비어 0(목덜미에 가라앉음)이 통과한다 (2) 문턱이 121회차에 고친 0.42 가 아니라 옛 0.35 다.
{
  const oldOne = { measure: "part_offset_ratio", min: null, max: 0.35, why: "조각이 머리에" };
  check("기대_part_offset_ratio: 계획이 쓰던 `-∞~0.35` 는 한쪽만 막힌 자다", isOneSided(oldOne as never));
  check("  **0(목덜미에 가라앉음)이 통과한다** — 15번 안 떨어진 진짜 이유",
    res(expectationChecks([oldOne as never], { part_offset_ratio: 0 }), "기대_part_offset_ratio")?.result === "Passed");
  check("  게다가 제대로 씌운 0.42 를 떨어뜨린다 — 늘 재는 줄과 정반대다",
    res(expectationChecks([oldOne as never], { part_offset_ratio: 0.42 }), "기대_part_offset_ratio")?.result === "Failed");
  const fixed = { measure: "part_offset_ratio", min: 0.27, max: 0.57, why: "조각이 머리에" };
  check("  고친 범위(0.27~0.57): 0 을 잡는다", res(expectationChecks([fixed as never], { part_offset_ratio: 0 }), "기대_part_offset_ratio")?.result === "Failed");
  check("  고친 범위: 0.42 를 통과시킨다", res(expectationChecks([fixed as never], { part_offset_ratio: 0.42 }), "기대_part_offset_ratio")?.result === "Passed");
  check("  늘 재는 줄과 말이 맞는다(0.42 통과 · 0 실패)",
    res(standingChecks({ parts_attached: 1, part_offset_ratio: 0.42 }), "규격_조각_자리")?.result === "Passed" &&
    res(standingChecks({ parts_attached: 1, part_offset_ratio: 0 }), "규격_조각_자리")?.result === "Failed");
}

console.log(bad ? `\n실패 ${bad}` : "\n전부 통과");
process.exitCode = bad ? 1 : 0;
