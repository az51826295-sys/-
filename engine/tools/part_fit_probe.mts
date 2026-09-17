/**
 * 조각 자리 자의 자 (121회차 09-15). 돈 0, 유니티 0, DB 안 씀.
 *   npx tsx engine/tools/part_fit_probe.mts
 *
 * 규격표 실측(기준 맨몸)으로 검산한다. 머리 중심 = Head 뼈에서 8.4 cm 위 · 정수리 = 20.1 cm 위 ·
 * 유니티의 headSize = 정수리 − 뼈 = 20.1 cm → **제대로 씌운 투구의 part_offset_ratio = 0.418**.
 *
 * 고장 재현이 여기 있다: 옛 문턱(0.35 이하)으로는 제대로 씌운 값이 떨어지고, 목덜미에 가라앉은 0.00 이 통과한다.
 * 새 문턱(0.42 ±0.15)이 그 둘을 뒤집는지 본다.
 */
const HEAD_CENTER_CM = 8.4, HEAD_TOP_CM = 20.1;
const CORRECT = HEAD_CENTER_CM / HEAD_TOP_CM; // 유니티 headSize 기준
const OLD = (off: number) => off <= 0.35;
const CENTERED = 0.42, BAND = 0.15;
const NEW = (off: number) => Math.abs(off - CENTERED) <= BAND;

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

console.log(`규격표 검산: 제대로 씌운 투구 = ${HEAD_CENTER_CM}/${HEAD_TOP_CM} = ${CORRECT.toFixed(3)}\n`);

// ── 고장 재현: 옛 문턱이 틀렸다는 것을 먼저 보인다
check("옛 문턱은 제대로 씌운 투구를 떨어뜨린다", !OLD(CORRECT), { CORRECT, 옛문턱: "≤0.35" });
check("옛 문턱은 목덜미에 가라앉은 0.00 을 통과시킨다", OLD(0), "0 = 조각 중심이 뼈 피벗 = 목덜미");

// ── 새 문턱이 뒤집는가
check("새 문턱: 제대로 씌운 투구 통과", NEW(CORRECT));
check("새 문턱: 가라앉은 0.00 떨어짐", !NEW(0));
check("새 문턱: 실제 기록값 0.336(6.8cm, 중심보다 1.6cm 낮음) 통과", NEW(0.336));
check("새 문턱: 실제 기록값 0.50(10.1cm) 통과", NEW(0.5));
check("새 문턱: 머리 위로 뜬 0.8 떨어짐", !NEW(0.8));
check("새 문턱: 0.25(가라앉음) 떨어짐", !NEW(0.25));

// ── 문턱이 대칭인지(정답을 가운데 두었는지)
check(`정답 ${CORRECT.toFixed(3)} 이 문턱 한가운데(${CENTERED})에서 0.02 안`, Math.abs(CORRECT - CENTERED) < 0.02, { CORRECT, CENTERED });

console.log(bad ? `\n실패 ${bad}` : "\n전부 통과");
process.exitCode = bad ? 1 : 0;
