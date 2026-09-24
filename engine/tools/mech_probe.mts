const { isMechanical } = await import("../../src/lib/execution/mechanicalRetry");
const cases: [string, string, boolean][] = [
  ["MODEL_OUTPUT_OFF_SCHEMA: expectations.1.why: null", "MODEL_OUTPUT_OFF_SCHEMA: expectations.1.why: null", true],
  ["", "MODEL_OUTPUT_UNPARSEABLE", true],
  ["", "MODEL_OUTPUT_TRUNCATED", true],
  ["SELF_INCONSISTENT", "기준이 서로 모순", false],
  ["", "CONTEXT_INCOMPLETE", false],
];
let ok = 0; for (const [c, m, e] of cases) { const g = isMechanical(c, m); if (g === e) ok++; console.log(g === e ? "맞음" : "틀림", m.slice(0, 40), "→", g); }
console.log(`${ok}/${cases.length}`);
