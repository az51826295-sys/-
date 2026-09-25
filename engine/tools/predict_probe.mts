/** 예측자 시험(213회차). 가짜 AI 로 predictMeasures 의 모양·scorePrediction 의 셈을 잰다. 돈 0. */
const { predictMeasures, scorePrediction } = await import("../../src/lib/skills/appBuild/predictMeasures");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const guards = [{ measure: "게임.클리어", min: 1, max: 1, why: "" }, { measure: "점프.높이px", min: null, max: 129.8, why: "" }, { measure: "점프.못오르는발판", min: 0, max: 0, why: "" }];
const fakeAi = { name: "fake", model: "fake", generateStructuredOutput: async (req: { input: string }) => ({
  output: { 값: [{ measure: "점프.높이px", value: 118 }, { measure: "점프.못오르는발판", value: 0 }, { measure: "게임.클리어", value: null }], 통과확률: 0.8, 근거: "jumpSpeed 12 · riseGravity 0.68 → v²/2g ≈ 106, 꼭대기 띠 보태 118" },
  inputTokens: 100, outputTokens: 10, model: "fake", _saw: req.input,
}) } as never;
const pred = await predictMeasures(fakeAi, { guards, files: [{ path: "index.html", contents: "<html>x</html>", language: "html" }], round: 1, lastMeasured: null, lastEdits: ["중력 조정"] });
check("예측이 돌아온다", !!pred && pred.통과확률 === 0.8 && pred.값["점프.높이px"] === 118, pred);
check("잠금 시각이 있다", !!pred?.at, pred?.at);
// 채점: 실측 통과 → brier (0.8-1)^2 = 0.04, 높이 오차 |118-100.2| = 17.8
const s1 = scorePrediction(pred!, { "게임.클리어": 1, "점프.높이px": 100.2, "점프.못오르는발판": 0 }, guards);
check("통과면 brier 0.04", s1.통과 && s1.brier === 0.04, s1);
check("높이 오차 17.8 · 견줌 2칸(클리어는 null 이라 안 셈)", s1.오차["점프.높이px"] === 17.8 && s1.견줌 === 2, s1);
// 채점: 실측 실패(높이 236) → brier (0.8-0)^2 = 0.64
const s2 = scorePrediction(pred!, { "게임.클리어": 1, "점프.높이px": 236.2, "점프.못오르는발판": 6 }, guards);
check("실패면 brier 0.64", !s2.통과 && s2.brier === 0.64, s2);
// 실측이 아예 없으면(못 잼) → 통과 아님, 견줌 0
const s3 = scorePrediction(pred!, undefined, guards);
check("못 잼이면 통과 아님·견줌 0", !s3.통과 && s3.견줌 === 0, s3);
// AI 가 죽어도 null 로 돌아오고 던지지 않는다
const deadAi = { name: "dead", model: "dead", generateStructuredOutput: async () => { throw new Error("MODEL_OUTPUT_UNPARSEABLE"); } } as never;
check("AI 가 죽으면 null(고리는 산다)", (await predictMeasures(deadAi, { guards, files: [{ path: "index.html", contents: "x", language: "html" }], round: 2 })) === null);
console.log(bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`); process.exit(bad ? 1 : 0);
