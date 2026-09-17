/**
 * **부탁 심판자가 그날 밤의 판을 잡는가** (166회차 09-17). 약 $0.3 (판정 8번).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ask_judge_probe.mts <그날 파일 폴더> [반복=2]
 *
 * 그날(09-17) 실제로 나온 판 셋 + 지어낸 대조 하나. **기대는 돌리기 전에 아래에 얼렸다.**
 *   A  v1→v2  "wsad가 잘 적용 안됨"            → 84% 를 다시 썼다                     기대: 넘쳤다
 *   B  v2→v3  "오른쪽 눌렀는데 왼쪽으로"        → 새 파일 911줄, 쓰던 파일 0줄 고침     기대: 되돌린다 · 안 고쳤다
 *   C  v2→v4  같은 말                          → 부호 두 줄                           기대: 내보낸다 · 고쳤다 · 맞다
 *   D  (지어낸 대조) "통째로 새로 만들고 디버그 화면·로그 내보내기도 넣어줘" → B 와 같은 큰 변화를 같은 파일에
 *                                                기대: 되돌리지 **않는다** — 많이 바뀐 것만 보고 되돌리면 그건 심판자가 아니라 5% 자다
 * 판정 단위는 호출 하나다(케이스로 뭉치지 않는다).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
const { changeFacts, judgeAsk } = await import("../../src/lib/genesis/askJudge");
const { defaultProviders } = await import("../../src/lib/execution/shared");

const dir = process.argv[2];
const repeat = Number(process.argv[3] ?? 2);
const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
const GAME = "fps_prototype_singlefile.html";
const v1 = { path: GAME, contents: read("v1-fps_prototype_singlefile.html") };
const v2 = { path: GAME, contents: read("v2-fps_prototype_singlefile.html") };
const v3new = { path: "fps_wasd_fix_validator.html", contents: read("v3-fps_wasd_fix_validator.html") };
const v4 = { path: GAME, contents: read("v4-patched.html") };

type V = Awaited<ReturnType<typeof judgeAsk>>["verdict"];
const cases: { id: string; said: string; prev: typeof v1[]; next: typeof v1[]; expect: (v: V) => boolean; expectText: string }[] = [
  { id: "A v1→v2", said: "수정 요청: wsad가 잘 적용 안됨", prev: [v1], next: [v2], expect: (v) => v.sizeMatch === "넘쳤다", expectText: "넘쳤다" },
  { id: "B v2→v3", said: "아니 오른쪽 눌렀는 데 왼쪽으로 가고 왼", prev: [v2], next: [v3new, v2], expect: (v) => v.verdict === "되돌린다" && v.fixedTheThing !== "고쳤다", expectText: "되돌린다 · 안 고쳤다" },
  { id: "C v2→v4", said: "아니 오른쪽 눌렀는 데 왼쪽으로 가고 왼", prev: [v2], next: [v4], expect: (v) => v.verdict === "내보낸다" && v.fixedTheThing === "고쳤다" && v.sizeMatch === "맞다", expectText: "내보낸다 · 고쳤다 · 맞다" },
  { id: "D 대조(큰 부탁)", said: "이 게임 통째로 새로 만들어줘. 디버그 화면이랑 로그 내보내기, 4방향 이동 검증 표도 넣고", prev: [v2], next: [{ path: GAME, contents: v3new.contents }], expect: (v) => v.verdict !== "되돌린다", expectText: "되돌리지 않는다" },
];

const ai = defaultProviders().ai;
let calls = 0, hit = 0;

// --loop: 그날 밤을 되돌려 본다 — 나쁜 판(B) → 심판자가 되돌림 → 그 말을 얹어 조각 고침 → 심판자가 다시 봄. 약 $0.3.
// 엔진(appBuild 2.5 단계)이 하는 순서 그대로, 같은 함수들로. 업무 설명은 그날의 **불어난 설명 그대로** 쓴다.
if (process.argv.includes("--loop")) {
  const { buildPatch } = await import("../../src/lib/skills/appBuild/patch");
  const bloated = "WASD 좌우 반전(부호 오류) 수정 및 4방향 검증\nWASD 이동에서 D를 눌렀을 때 왼쪽으로, A를 눌렀을 때 오른쪽으로 가는 방향 반전 문제를 추적·수정한다. yaw 기준 전진/우측 벡터의 부호와 sin/cos 적용을 점검하고, W/S 포함 4방향이 의도대로 가는지 재현 테스트(입력별 예상 방향 표)로 검증한다. 동작 외 결과는 불변 유지.\n\n매니저가 한 말(원문 — 이것이 고칠 범위다): \"아니 오른쪽 눌렀는 데 왼쪽으로 가고 왼\"";
  const first = await judgeAsk(ai, { said: bloated, facts: changeFacts([v2], [v3new, v2]) });
  console.log(`1) 나쁜 판을 본 심판자: [${first.verdict.verdict}] ${first.verdict.toWorker}`);
  const r = await buildPatch(ai, { title: "WASD 좌우 반전 수정", ask: bloated + `\n\n## 심판자가 방금 판을 되돌렸다 — 이번엔 이것만 한다\n${first.verdict.toWorker}`, criteria: [{ id: "move_lr", when: "D 를 누르면", then: "오른쪽으로 간다" }], failedChecks: [], full: [{ ...v2, language: "html" }], rest: [] });
  if (!r.ok) { console.log("2) 조각이 안 붙었다", r.failures); process.exit(1); }
  const f2 = changeFacts([v2], r.files);
  console.log(`2) 다시 고친 판: 조각 ${r.patch.edits.length}개 · 새 파일 ${f2.newPaths.length} · ` + f2.files.map((f) => `-${f.removed}/+${f.added}`).join(" "));
  const second = await judgeAsk(ai, { said: bloated, facts: f2 });
  console.log(`3) 다시 본 심판자: [${second.verdict.verdict} · ${second.verdict.sizeMatch} · ${second.verdict.fixedTheThing}] ${second.verdict.toPerson}`);
  const ok = first.verdict.verdict === "되돌린다" && f2.newPaths.length === 0 && f2.files[0].removed <= 10 && second.verdict.verdict === "내보낸다";
  console.log(ok ? "\n맞음 — 그날 밤이 이 고리였다면 사장님은 두 줄 고친 판을 받았다" : "\n어긋남");
  process.exit(ok ? 0 : 1);
}
for (const c of cases) {
  const facts = changeFacts(c.prev, c.next);
  console.log(`\n== ${c.id} — "${c.said}"  (기대: ${c.expectText})`);
  console.log(`   사실: 새 파일 ${facts.newPaths.length} · ` + facts.files.map((f) => `${f.path} -${f.removed}/+${f.added}`).join(" · "));
  for (let i = 0; i < repeat; i++) {
    const t0 = Date.now();
    try {
      const { verdict: v } = await judgeAsk(ai, { said: c.said, facts });
      const ok = c.expect(v); calls++; if (ok) hit++;
      console.log(`   ${ok ? "맞음  " : "어긋남"} [${v.verdict} · ${v.sizeMatch} · ${v.fixedTheThing} · 믿음 ${v.confidence}] ${Math.round((Date.now() - t0) / 1000)}초`);
      console.log(`          사람에게: ${v.toPerson}`);
      if (v.toWorker) console.log(`          직원에게: ${v.toWorker}`);
      if (v.uninvited.length) console.log(`          안 시킨 것: ${v.uninvited.slice(0, 4).join(" / ")}`);
    } catch (e) { calls++; console.log("   어긋남 (호출 실패)", e instanceof Error ? e.message : e); }
  }
}
console.log(`\n호출 ${calls} · 기대와 맞음 ${hit}`);
process.exit(hit === calls ? 0 : 1);
