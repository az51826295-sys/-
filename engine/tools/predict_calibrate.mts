/**
 * **나온 확률을 고쳐 쓴다** (226회차 2026-09-27).
 *
 *   npx tsx engine/tools/predict_calibrate.mts
 *
 * 예측자는 거의 전부 0.75~0.90 을 답하는데 실제로는 절반이 통과였다. 그러니까 **모르는 것이
 * 아니라 치우쳐 있다.** 모델을 바꿀 일이 아니라 나온 숫자를 고쳐 쓸 일이다 — 호출이 0번이라 값이 0 이다.
 *
 * 고치는 법은 한 손잡이뿐이다: 밑바탕 쪽으로 얼마나 끌어당길지.
 *     p' = 밑바탕 + k · (p - 밑바탕)      (k=1 이면 그대로, k=0 이면 전부 밑바탕)
 * 손잡이가 하나면 30건으로도 맞출 수 있고, 무엇을 했는지 눈에 보인다.
 *
 * **고르는 자료와 재는 자료를 가른다.** 같은 30건에 맞추고 같은 30건에서 좋아졌다고 하면
 * 그건 재기가 아니라 외우기다. 앞 절반에서 k 를 고르고 **뒤 절반에서만** 잰다
 * (09-22 "봉인 한 장" — 지난 실패는 시험지다).
 */
import { readFileSync } from "node:fs";

type Row = { p: number; rejected: boolean };
const 파일 = JSON.parse(readFileSync("engine/data/judge_predict.json", "utf-8")) as {
  밑바탕?: number;
  rows: Row[];
  팔들?: Record<string, Row[]>;
};

const brier = (rs: Row[], f: (p: number) => number) =>
  rs.reduce((s, r) => s + (f(r.p) - (r.rejected ? 1 : 0)) ** 2, 0) / rs.length;

const 팔들 = 파일.팔들 ?? { "저장된 팔": 파일.rows };

for (const [이름, 전부] of Object.entries(팔들)) {
  if (!전부?.length) continue;
  // 앞 절반 = 고르는 자료, 뒤 절반 = 재는 자료. 순서를 섞지 않는다 — 섞으면 판마다 답이 달라진다.
  const 반 = Math.floor(전부.length / 2);
  const 고름 = 전부.slice(0, 반);
  const 잼 = 전부.slice(반);
  const 밑고름 = 고름.filter((r) => r.rejected).length / 고름.length;

  // k 를 0.00~1.00 까지 훑어 고른다. 손잡이가 하나뿐이라 훑는 것으로 충분하다.
  let 최선 = { k: 1, b: Infinity };
  for (let i = 0; i <= 100; i++) {
    const k = i / 100;
    const b = brier(고름, (p) => 밑고름 + k * (p - 밑고름));
    if (b < 최선.b) 최선 = { k, b };
  }

  const 밑잼 = 잼.filter((r) => r.rejected).length / 잼.length;
  const 그대로 = brier(잼, (p) => p);
  const 고친것 = brier(잼, (p) => 밑고름 + 최선.k * (p - 밑고름));
  // 대조군: 재는 자료에서 **아무것도 안 하고** 앞 절반의 비율만 답하기
  const 비율만 = brier(잼, () => 밑고름);

  console.log(`\n=== ${이름} ===`);
  console.log(`  고르는 자료 ${고름.length}건(물림 ${(밑고름 * 100).toFixed(0)}%) · 재는 자료 ${잼.length}건(물림 ${(밑잼 * 100).toFixed(0)}%)`);
  console.log(`  고른 손잡이 k = ${최선.k.toFixed(2)}  ${최선.k < 0.5 ? "(확률을 많이 깎았다 — 예측자가 그만큼 치우쳐 있었다)" : ""}`);
  console.log(`  **재는 자료에서** (낮을수록 좋다)`);
  console.log(`    그대로 쓰기     ${그대로.toFixed(3)}`);
  console.log(`    고쳐 쓰기       ${고친것.toFixed(3)}${고친것 < 그대로 ? "  ← 나아졌다" : "  ← 안 나아졌다"}`);
  console.log(`    비율만 답하기   ${비율만.toFixed(3)}  ← 이걸 못 이기면 예측이 아무 값도 안 한다`);
  // **문턱 없이 "이겼다" 고 적으면 안 된다.** 첫 판에서 0.249 vs 0.253 을 내 도구가 "이겼다" 고
  // 적었는데, 15건에서 **한 건이 뒤집히면 Brier 가 0.017** 움직인다 — 0.004 는 그 1/4 이다.
  // 그래서 "한 건 값" 을 같이 내고 그보다 작은 차이는 **못 가른다**고 적는다.
  const 한건 = 1 / 잼.length;
  const 차 = 비율만 - 고친것;
  console.log(`    (한 건이 뒤집히면 Brier 가 ${한건.toFixed(3)} 만큼 움직인다)`);
  console.log(
    Math.abs(차) < 한건
      ? `  **못 가른다** — 비율과의 차이 ${차.toFixed(3)} 는 한 건 값(${한건.toFixed(3)}) 안이다. 예측이 값을 한다고 말할 수 없다.`
      : 차 > 0
        ? `  **비율보다 낫다** (차이 ${차.toFixed(3)}) — 예측이 값을 한다.`
        : `  비율을 못 이긴다 (차이 ${차.toFixed(3)}).`,
  );
  if (최선.k < 0.3) {
    console.log(
      `  다만 k=${최선.k.toFixed(2)} 는 **예측자가 낸 신호의 ${(최선.k * 100).toFixed(0)}% 만 남겼다**는 뜻이다 —` +
        " 나아진 것의 대부분은 예측을 믿은 것이 아니라 **버린 것**에서 왔다.",
    );
  }
}

console.log("\n호출 0번. 이 판은 값이 들지 않았다 — 이미 산 답을 고쳐 쓴 것뿐이다.");
