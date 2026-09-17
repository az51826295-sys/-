/**
 * **배치가 판마다 달라지는가** (152회차 09-16). 모델 호출 있음(routine, 판당 $0.001 쯤).
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/rookery_env.mts engine/tools/place_probe.mts
 *
 * 149회차 `look_probe` 와 같은 물음이다: **상수를 다른 상수로 바꾼 게 아니라 정말 판단인가.**
 * 배치가 무슨 일이 와도 같은 자리를 고르면 그건 자를 하나 더 만든 것이다.
 * 그래서 성질이 다른 주문 넷을 같은 코드에 넣고 **고른 자리·이유·틀릴 위험**을 나란히 본다.
 *
 * 난간(`safePlace`)도 같이 시험한다 — 없는 자리, 그림이 필요한 일, 빈 답.
 */
const { placeWork, placeFacts, placeLine, safePlace, PLACES } = await import("../../src/lib/providers/place");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const ai = defaultProviders().ai;
const CO = "5925c03a-557f-46d7-8589-7388b769df40";

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

// ── 난간부터 (돈 0)
check("없는 자리를 대면 하던 자리로", safePlace({ place: "gpt-9-imaginary" }).place === "deepseek-v4-pro");
check("   그때 '골랐다' 고 하지 않는다", safePlace({ place: "gpt-9-imaginary" }).picked === false);
check("빈 답도 안 터진다", safePlace(null).place === "deepseek-v4-pro");
check("고른 자리는 그대로 둔다", safePlace({ place: "gpt-5-mini" }).place === "gpt-5-mini");
check("그림이 필요하면 눈 없는 자리를 안 앉힌다", safePlace({ place: "deepseek-v4-pro" }, { needsEyes: true }).place === "gpt-5");
check("   눈 있는 자리는 그대로", safePlace({ place: "gpt-5-mini" }, { needsEyes: true }).place === "gpt-5-mini");

const facts = await placeFacts(db, CO);
console.log("\n── 기계가 댄 사실(의견 0):\n" + facts);

const ORDERS = [
  ["영상", "로키 15초 광고를 만들어 줘. 3초 안에 눈을 잡고 끝에 한 줄만 남겨라."],
  ["유니티 코드", "검사에서 떨어진 줄 세 개(컴파일이_된다, 규격_조각_크기, 발_IK)를 고쳐 줘. 바꾼 파일과 다시 잰 값을 적어."],
  ["조사", "2026년 한국 고등학생의 AI 학습 도구 사용 실태를 출처 달아서 정리해 줘. 숫자는 전부 출처 쪽수까지."],
  ["잔손질", "저번에 만든 문서에서 오타 두 개만 고쳐 줘. 3쪽 '되요' → '돼요', 5쪽 '몇일' → '며칠'."],
];
const picks: string[] = [];
for (const [kind, order] of ORDERS) {
  const p = await placeWork(ai, { order, kind, facts });
  picks.push(p.place);
  console.log(`\n[${kind}] ${placeLine(p)}`);
}
check("\n판마다 같은 자리만 고르지 않는다(=자가 아니다)", new Set(picks).size >= 2, picks);
check("고른 자리는 전부 실제로 부를 수 있는 곳", picks.every((p) => p in PLACES), picks);
console.log(bad ? `\n${bad}건 실패` : "\n전부 통과");
process.exit(bad ? 1 : 0);
