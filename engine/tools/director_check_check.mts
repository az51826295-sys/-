/**
 * director_check 의 자 (11-23). 모델 0. 기대값을 먼저 적고 맞나 본다. --sabotage 면 문이 늘 받는 고장을 심어 자가 잡나 본다.
 *   npx tsx engine/tools/director_check_check.mts [--sabotage]
 */
const D = await import("../../src/lib/director/index");
const sab = process.argv.includes("--sabotage");
const gate = sab ? ((() => ({ action: "accept" as const, why: "sabotage" })) as typeof D.checkGate) : D.checkGate;
const row = (conf: number, passed: boolean, i: number): import("../../src/lib/director/index").LedgerEntry =>
  ({ at: `2026-11-23T00:00:${String(i).padStart(2, "0")}Z`, task: "t", kind: "art", seat: "cheap", effort: "normal", predictedPass: 0.7, confidence: conf, passed });
const e = { kind: "art", seat: "cheap" };
let ok = 0, n = 0;
const expect = (name: string, got: unknown, want: unknown) => { n++; const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) ok++; console.log(`${g === w ? "✓" : "✗"} ${name}: ${g}${g === w ? "" : ` (기대 ${w})`}`); };

// 1. 기계가 먼저
expect("기계 통과 → 받음", gate([], e, 0.1, "pass").action, "accept");
expect("기계 실패 → 올림", gate([], e, 0.99, "fail").action, "escalate");
// 2. 장부 모자람 → 기본 0.93
expect("빈 장부, 0.9 → 올림", gate([], e, 0.9).action, "escalate");
expect("빈 장부, 0.95 → 받음", gate([], e, 0.95).action, "accept");
expect("자신감 없음 → 올림", gate([], e, undefined).action, "escalate");
expect("백분율 95 → 받음", gate([], e, 95).action, "accept");
// 3. 장부로 다시 맞춤: 0.85 이상은 다 맞고, 0.8 대는 반이 틀림 → τ 0.85
const L = [0.99, 0.97, 0.9, 0.88, 0.86, 0.86].map((c, i) => row(c, true, i)).concat([0.82, 0.81, 0.8, 0.8].map((c, i) => row(c, i % 2 === 0, 10 + i)));
expect("다시 맞춘 τ", D.calibrateTau(L, "art", "cheap"), { tau: 0.85, from: "ledger", n: 10 });
expect("τ0.85 장부, 0.87 → 받음", gate(L, e, 0.87).action, "accept");
expect("τ0.85 장부, 0.82 → 올림", gate(L, e, 0.82).action, "escalate");
// 4. 자신 있게 틀리는 AI: 0.99 에서도 반이 틀림 → 늘 올림
const Bad = Array.from({ length: 10 }, (_, i) => row(0.99, i % 2 === 0, i));
expect("늘 틀리는 장부 τ", D.calibrateTau(Bad, "art", "cheap").tau, 1.01);
expect("늘 틀리는 장부, 0.99 → 올림", gate(Bad, e, 0.99).action, "escalate");
// 5. 다른 종류·자리는 안 섞인다
expect("다른 자리 장부는 안 씀", D.calibrateTau(L, "art", "big").from, "default");

console.log(`\n${ok}/${n}${sab ? " (고장 심음 — 떨어져야 정상)" : ""}`);
process.exit(sab ? (ok === n ? 1 : 0) : ok === n ? 0 : 1);
