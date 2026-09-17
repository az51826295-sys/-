/**
 * 판정 라벨의 자 (129회차 09-16). 돈 0, 모델 0, DB 0.
 *   npx tsx engine/tools/verdict_label_probe.mts
 *
 * 고장 재현이 첫 칸이다: **99개 중 97개 맞힌 판이 17개 중 17개보다 나쁘게 매겨지는가.**
 * 126회차 Astra 시험에서 실제로 그랬고, 그 라벨이 학습 재료로 들어가면 "말을 아껴라" 를 배운다.
 * 동시에 **문턱이 느슨해지지 않았는지**도 본다 — 계약형(영상·유니티)은 하나만 어겨도 실패여야 한다.
 */
import { isBadForLearning, claimRate, verdictLine, CLAIM_RATE_FLOOR, CLAIM_MAX_FAILED } from "../../src/lib/genesis/verdictLabel";

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

// ── 고장 재현: 실제로 있었던 두 판(126회차)
const astra = { verdict: "PARTIAL", passed: 97, failed: 2, scales: true, rate: 97 / 99 };
const old = { verdict: "PASS", passed: 17, failed: 0, scales: true, rate: 1 };
check("고장 재현: 옛 자로는 97/99 가 '실패 사례'였다", astra.verdict !== "PASS");
check("새 자: 97/99(98%)는 실패 사례가 아니다", !isBadForLearning(astra), { rate: claimRate(astra) });
check("새 자: 17/17 도 그대로 성공", !isBadForLearning(old));
check("사람이 읽는 줄에 비율이 보인다", verdictLine(astra).includes("98%"), verdictLine(astra));

// ── 문턱이 느슨해지지 않았는지 (반대편 — 이게 없으면 그냥 봐주는 자다)
check(`주장 10개 중 2개 틀림(80%) → 실패 (문턱 ${CLAIM_RATE_FLOOR})`, isBadForLearning({ verdict: "PARTIAL", passed: 8, failed: 2, scales: true, rate: 0.8 }));
check(`1000개 중 50개 틀림(95%)이어도 → 실패 (틀린 개수 상한 ${CLAIM_MAX_FAILED})`, isBadForLearning({ verdict: "PARTIAL", passed: 950, failed: 50, scales: true, rate: 0.95 }));
check("주장 3개 중 1개 틀림(67%) → 실패", isBadForLearning({ verdict: "FAIL", passed: 2, failed: 1, scales: true, rate: 2 / 3 }));

// ── 계약형은 비율로 봐주지 않는다 (영상·유니티)
const video = { verdict: "FAIL", passed: 7, failed: 1 }; // scales 없음
check("계약형: 영상 7/8(87.5%)은 그대로 실패 — 첫 장면 6.6초는 봐줄 수 없다", isBadForLearning(video));
check("계약형: 흠 없으면 성공", !isBadForLearning({ verdict: "PASS", passed: 8, failed: 0 }));
const unity = { verdict: "FAIL", passed: 30, failed: 1 };
check("계약형: 유니티 30/31 도 실패", isBadForLearning(unity));

// ── 재지 못한 것
check("판정 없음은 실패가 아니다", !isBadForLearning(null) && !isBadForLearning(undefined));
check("잰 것이 0이면 비율 null", claimRate({ verdict: "UNMEASURED", passed: 0, failed: 0, scales: true }) === null);
check("비율을 못 내면 옛 방식으로 돌아간다", isBadForLearning({ verdict: "UNMEASURED", passed: 0, failed: 0, scales: true }));

console.log(bad ? `\n실패 ${bad}` : "\n전부 통과");
process.exitCode = bad ? 1 : 0;
