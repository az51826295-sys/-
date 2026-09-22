/**
 * **숫자 난간이 고리 길에서 실제로 잡히는가** (205회차 09-22).
 * `measureJump` 만 부르지 않는다 — **고리가 쓰는 길(`runWeb`) 그대로** 돌려서,
 * 배선 어딘가가 끊겨 있으면 여기서 드러나게 한다.
 * 모델 0 · 돈 0.
 */
const { runWeb } = await import("../../src/lib/skills/appBuild/run");
const { checkGuards, measureNamesFor } = await import("../../src/lib/skills/appBuild/webMeasures");
const { readFileSync } = await import("node:fs");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

const 난간 = [
  { measure: "점프.높이px", min: 129.8, max: 129.8, why: "못 닿는 발판이 생긴다" },
  { measure: "점프.공중프레임", min: 40, max: 40, why: "닿는 거리가 달라진다" },
];
const 목표 = [{ measure: "점프.하강나누기상승", max: 0.95, why: "내려올 때 더 빨라야 한다" }];
const names = measureNamesFor([...난간, ...목표]);
check("난간 이름에서 잴 묶음을 뽑는다", names.length === 1 && names[0] === "점프", names);

const 재기 = async (path: string) => {
  const f = [{ path: "index.html", contents: readFileSync(path, "utf8"), language: "html" }];
  const facts = await runWeb(f, { mobile: false, measures: names });
  return facts;
};

// ① 원본 — 난간은 지키고, 목표(하강÷상승)는 아직 못 지킨 상태여야 한다
{
  const f = await 재기("engine/work/stage4-run1/origin/index.html");
  check("원본을 돌려 봤다", f.ran === true, f.why);
  check("**고리 길로도 숫자가 나온다**", !!f.measured && Object.keys(f.measured).length > 0, f.measured);
  check("원본 높이 129.8", f.measured?.["점프.높이px"] === 129.8, f.measured);
  check("원본 공중 40프레임", f.measured?.["점프.공중프레임"] === 40, f.measured);
  check("**원본은 난간을 안 어긴다**", checkGuards(f.measured, 난간).length === 0, checkGuards(f.measured, 난간));
  check("원본은 목표를 아직 못 지켰다(1.11)", checkGuards(f.measured, 목표).length === 1, checkGuards(f.measured, 목표));
}
// ② 판 2 결과물 — 난간 둘 다 걸려야 한다. 이게 안 걸리면 자를 심은 뜻이 없다.
{
  const f = await 재기("engine/work/stage4-run2/round1/index.html");
  check("판2 높이 82.7", f.measured?.["점프.높이px"] === 82.7, f.measured);
  check("판2 공중 32프레임", f.measured?.["점프.공중프레임"] === 32, f.measured);
  const hit = checkGuards(f.measured, 난간);
  check("**판2 결과물은 난간 둘 다 걸린다**", hit.length === 2, hit);
  check("걸린 문장에 잰 값이 들어 있다", hit.every((h) => /= ?\d/.test(h)), hit);
}
// ③ 점프가 없는 판 — **'통과' 가 아니라 '못 잼'** 으로 걸려야 한다
{
  const f = await runWeb([{ path: "index.html", contents: "<html><body><h1>점프 없음</h1></body></html>", language: "html" }], { mobile: false, measures: names });
  check("점프가 없으면 숫자가 안 들어온다", !f.measured || f.measured["점프.높이px"] == null, f.measured);
  const hit = checkGuards(f.measured, 난간);
  check("**못 재면 못 잼으로 걸린다(통과 아님)**", hit.length === 2 && hit.every((h) => /못 잼/.test(h)), hit);
}
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
