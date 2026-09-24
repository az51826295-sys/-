/**
 * **자 순서 시험**(211회차 09-25). 게임 → 점프 순서로 재도 점프 값이 단독 측정과 같아야 한다.
 * 고장 재현: 고침 전엔 원본이 높이 0·공중 3, 판 9 결과물은 점프 칸이 아예 없었다.
 */
const { runWeb } = await import("../../src/lib/skills/appBuild/run");
const { readFileSync } = await import("node:fs");
let bad = 0;
const check = (n: string, ok: boolean, got: unknown) => { if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, JSON.stringify(got)); };
const cases: [string, string, number][] = [["engine/work/candidate-na/index.html", "원본", 129.8], ["engine/work/stage4-run9/round1/index.html", "판 9 1회차", 236.2]];
for (const [p, name, want] of cases) {
  const f = await runWeb([{ path: "index.html", contents: readFileSync(p, "utf8"), language: "html" }], { mobile: false, measures: ["게임", "점프"] });
  const m = ((f as { measured?: Record<string, number> }).measured ?? {});
  check(`${name} 게임→점프: 높이 ${want}`, m["점프.높이px"] === want, m["점프.높이px"]);
  check(`${name} 게임.클리어 1`, m["게임.클리어"] === 1, m["게임.클리어"]);
}
console.log(bad ? `틀림 ${bad}` : "전부 맞음");
process.exit(bad ? 1 : 0);
