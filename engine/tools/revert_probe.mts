/** 되돌림 검사에 이빨이 있나 — 실제 세 판(0b2b6f97 → 0bff69f3 → cfbc57c5)으로. 브라우저 0 · 모델 0. */
const { revertedFixes } = await import("../../src/lib/skills/appBuild/revertCheck");
const { readFileSync } = await import("node:fs");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got).slice(0, 200)); };
const A = readFileSync("engine/work/cleared/index.html", "utf8");                                   // 0b2b6f97 (앞앞)
const B = readFileSync("engine/work/hist-0bff69f3-9c3c-49b0-a450-d5e2169153ab/index.html", "utf8"); // 0bff69f3 (앞: "클리어!" 로 고침)
const C = readFileSync("engine/work/hist-cfbc57c5-9b0e-4f83-a11b-72359e508923/index.html", "utf8"); // cfbc57c5 (이번: 도로 "클리어")
// ① 실제 되돌림을 잡는가
{
  const r = revertedFixes(A, B, C);
  check("**앞 판의 고침이 되돌려진 것을 잡는다**", r.length >= 1, r);
  check("되돌아간 줄이 '클리어' 단추 줄이다", r.some((x) => /클리어/.test(x.line) && x.되돌아간줄 !== null), r);
}
// ② 되돌리지 않은 판은 안 잡는가 — 이번 판이 앞 판 그대로면 0 이어야
check("고침이 살아 있으면 안 잡는다", revertedFixes(A, B, B).length === 0, revertedFixes(A, B, B));
// ③ 앞 판이 아무것도 안 고쳤으면 0
check("앞 판이 안 고쳤으면 0", revertedFixes(A, A, C).length === 0, revertedFixes(A, A, C));
// ④ 공백만 달라진 줄은 되돌림이 아니다
check("공백만 달라진 줄은 안 잡는다", revertedFixes(A, B, B.replace("restartButton.textContent", "restartButton.textContent ")).length === 0);
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
