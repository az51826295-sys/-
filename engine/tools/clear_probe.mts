/**
 * **게임.클리어 칸에 이빨이 있나** (205회차 09-23). 고리가 쓰는 길(runWeb) 그대로.
 * 깨신 판 → 1 · 원본(회귀) → 0 · 점프 없는 판 → 못 잼(null, 통과 아님).
 */
const { runWeb } = await import("../../src/lib/skills/appBuild/run");
const { checkGuards } = await import("../../src/lib/skills/appBuild/webMeasures");
const { readFileSync } = await import("node:fs");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const 난간 = [{ measure: "게임.클리어", min: 1, max: 1, why: "끝까지 깨져야 한다" }];
const 재기 = (html: string) => runWeb([{ path: "index.html", contents: html, language: "html" }], { mobile: false, measures: ["게임"] });
{
  const f = await 재기(readFileSync("engine/work/cleared/index.html", "utf8"));
  check("**깨신 판은 클리어 1**", f.measured?.["게임.클리어"] === 1, f.measured);
  check("깨신 판은 난간 통과", checkGuards(f.measured, 난간).length === 0, checkGuards(f.measured, 난간));
}
{
  const f = await 재기(readFileSync("engine/work/stage4-run1/origin/index.html", "utf8"));
  check("**원본(회귀)은 클리어 0**", f.measured?.["게임.클리어"] === 0, f.measured);
  check("원본은 난간에 걸린다", checkGuards(f.measured, 난간).length === 1, checkGuards(f.measured, 난간));
  check("닿은 무대가 2 다(무대 2 에서 막힘)", f.measured?.["게임.닿은무대"] === 2, f.measured);
}
{
  const f = await 재기("<html><body><h1>점프 없음</h1></body></html>");
  check("점프 없는 판은 값이 없다", f.measured?.["게임.클리어"] == null, f.measured);
  check("**못 재면 못 잼으로 걸린다(통과 아님)**", /못 잼/.test(checkGuards(f.measured, 난간)[0] ?? ""), checkGuards(f.measured, 난간));
}
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
