/**
 * **고쳐 달라고 했을 때 고치기만 하는가** (165회차 09-17).
 *
 *   npx tsx engine/tools/fix_round_probe.mts                 — 붙이는 기계(applyEdits)만. 돈 0.
 *   npx tsx engine/tools/fix_round_probe.mts --sabotage <폴더> — **사장님이 실제로 당한 판**(v1→v2, v2→v3)을 이 자에 댄다.
 *                                                               둘 다 어긋남으로 잡아야 자가 산 것. 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/fix_round_probe.mts --live <폴더>
 *                                                             — 그날의 v2 파일 + 사장님 말 그대로, 진짜 모델로 고쳐 본다. 약 $0.1~0.3.
 *
 * <폴더> 에는 그날 판의 파일이 있어야 한다: v1-*.html, v2-fps_prototype_singlefile.html, v3-fps_wasd_fix_validator.html
 * (운영 DB 의 deliverables.content_json.files 에서 내려받은 것 — 저장소에 넣지 않는다, 사장님 게임이다).
 *
 * 재는 것: 새 파일이 생겼나 · 지난 파일의 몇 %가 바뀌었나(작은 고침은 5% 이하) · 말한 고장이 고쳐졌나.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
const { applyEdits, buildPatch } = await import("../../src/lib/skills/appBuild/patch");

const SMALL_FIX_MAX_RATIO = 0.05;
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

type F = { path: string; language: string; contents: string };
/** 지난 판 → 이번 판: 새 경로, 그리고 같은 경로 파일에서 바뀐 줄의 비율(줄 집합 비교 — 순서 이동은 안 센다). */
function measureFix(prev: F[], next: F[]) {
  const newPaths = next.filter((n) => !prev.some((p) => p.path === n.path)).map((n) => n.path);
  let changed = 0, total = 0;
  for (const p of prev) {
    const n = next.find((x) => x.path === p.path);
    const a = p.contents.replace(/\r\n/g, "\n").split("\n");
    total += a.length;
    if (!n) { changed += a.length; continue; }
    const b = new Map<string, number>();
    for (const l of n.contents.replace(/\r\n/g, "\n").split("\n")) b.set(l, (b.get(l) ?? 0) + 1);
    for (const l of a) { const k = b.get(l) ?? 0; if (k > 0) b.set(l, k - 1); else changed++; }
  }
  return { newPaths, changed, total, ratio: total ? changed / total : 0 };
}
const html = (p: string, name = "fps_prototype_singlefile.html"): F => ({ path: name, language: "html", contents: readFileSync(p, "utf8") });

const mode = process.argv.includes("--live") ? "live" : process.argv.includes("--sabotage") ? "sabotage" : "unit";
const dir = process.argv[process.argv.length - 1];

if (mode === "unit") {
  const src: F[] = [{ path: "a.js", language: "js", contents: "const rightX = Math.sin(yaw);\nconst rightY = -Math.cos(yaw);\nlet x = 1;\nlet y = 1;\n" }];
  const ok1 = applyEdits(src, [{ path: "a.js", find: "const rightX = Math.sin(yaw);\nconst rightY = -Math.cos(yaw);", replace: "const rightX = -Math.sin(yaw);\nconst rightY = Math.cos(yaw);", why: "부호" }]);
  check("한 번 나오는 원문은 붙는다", ok1.failures.length === 0 && ok1.files[0].contents.includes("-Math.sin(yaw)") && ok1.files[0].contents.includes("let x = 1;"), ok1.failures);
  check("원본은 안 건드린다(사본을 고친다)", src[0].contents.includes("const rightX = Math.sin(yaw);"));
  const twice = applyEdits(src, [{ path: "a.js", find: " = 1;", replace: " = 2;", why: "" }]);
  check("두 번 나오는 find 는 안 붙인다(엉뚱한 자리를 고치지 않는다)", twice.failures[0]?.reason === "여러 번 나옴" && twice.files[0].contents === src[0].contents, twice.failures);
  const miss = applyEdits(src, [{ path: "a.js", find: "const rightX = Math.sin( yaw );", replace: "x", why: "" }]);
  check("기억으로 쓴(글자가 다른) find 는 못 찾음", miss.failures[0]?.reason === "못 찾음", miss.failures);
  check("없는 파일", applyEdits(src, [{ path: "b.js", find: "x", replace: "y", why: "" }]).failures[0]?.reason === "파일 없음");
  const crlf = applyEdits([{ ...src[0], contents: src[0].contents.replace(/\n/g, "\r\n") }], [{ path: "a.js", find: "let x = 1;\nlet y = 1;", replace: "let x = 2;\nlet y = 2;", why: "" }]);
  check("줄바꿈(CRLF/LF)만 다른 것은 같은 것으로 친다", crlf.failures.length === 0 && crlf.files[0].contents.includes("let x = 2;"), crlf.failures);
  const dollar = applyEdits(src, [{ path: "a.js", find: "let x = 1;", replace: "let x = '$&$1';", why: "" }]);
  check("replace 안의 $& 가 특수문자로 안 먹힌다", dollar.files[0].contents.includes("'$&$1'"), dollar.files[0].contents);
  const m = measureFix(src, ok1.files);
  check("자: 두 줄 고침은 새 파일 0 · 바뀐 줄 2", m.newPaths.length === 0 && m.changed === 2, m);
}

if (mode === "sabotage") {
  // 그날 실제로 나온 판. 이 자가 이것들을 통과시키면 자가 고장이다.
  const v1 = html(path.join(dir, "v1-fps_prototype_singlefile.html"));
  const v2 = html(path.join(dir, "v2-fps_prototype_singlefile.html"));
  const v3new = html(path.join(dir, "v3-fps_wasd_fix_validator.html"), "fps_wasd_fix_validator.html");
  const a = measureFix([v1], [v2]);
  console.log(`v1→v2 ("wsad가 잘 적용 안됨"): 바뀐 줄 ${a.changed}/${a.total} = ${(a.ratio * 100).toFixed(0)}%`);
  check("v1→v2 를 '작은 고침' 으로 통과시키지 않는다", a.ratio > SMALL_FIX_MAX_RATIO, a);
  const b = measureFix([v2], [v2, v3new]);
  console.log(`v2→v3 ("오른쪽 눌렀는데 왼쪽으로"): 새 파일 ${b.newPaths.join(", ")} · 지난 파일 바뀐 줄 ${b.changed}/${b.total}`);
  check("v2→v3 의 새 파일을 잡는다", b.newPaths.length === 1, b);
  check("v2→v3: 고장 난 파일은 한 줄도 안 고쳐졌다는 것을 잡는다", b.changed === 0, b);
}

if (mode === "live") {
  const { defaultProviders } = await import("../../src/lib/execution/shared");
  // 171회차: `--model <이름>` 이면 그 OpenAI 모델로(새 모델 시험용). 없으면 지금 쓰는 자리(라우터).
  const mi = process.argv.indexOf("--model");
  const modelName = mi > 0 ? process.argv[mi + 1] : null;
  const ai = modelName ? (await import("../../src/lib/providers/openai")).createOpenAIProvider({ judgmentModel: modelName }) : defaultProviders().ai;
  console.log("모델:", modelName ?? "지금 자리(라우터)");
  const v2 = html(path.join(dir, "v2-fps_prototype_singlefile.html"));
  const t0 = Date.now();
  const r = await buildPatch(ai, {
    title: "WASD 좌우 반전 수정",
    ask: '매니저가 한 말(원문 — 이것이 고칠 범위다): "아니 오른쪽 눌렀는 데 왼쪽으로 가고 왼"',
    criteria: [{ id: "move_lr", when: "D(또는 →)를 누르면", then: "보는 방향 기준 오른쪽으로, A(또는 ←)는 왼쪽으로 간다" }],
    failedChecks: [], full: [v2], rest: [],
  });
  console.log(`소요 ${Math.round((Date.now() - t0) / 1000)}초`);
  check("조각이 붙었다", r.ok, r.ok ? undefined : r.failures);
  if (r.ok) {
    const m = measureFix([v2], r.files);
    console.log(`조각 ${r.patch.edits.length}개 · 물은 횟수 ${r.asked} · 바뀐 줄 ${m.changed}/${m.total} = ${(m.ratio * 100).toFixed(2)}% · 새 파일 ${m.newPaths.length}`);
    for (const e of r.patch.edits) console.log(`  · ${e.why}\n    - ${e.find.trim().split("\n").join("\n    - ")}\n    + ${e.replace.trim().split("\n").join("\n    + ")}`);
    check("새 파일을 안 만들었다", m.newPaths.length === 0, m.newPaths);
    check(`바뀐 줄이 ${SMALL_FIX_MAX_RATIO * 100}% 이하`, m.ratio <= SMALL_FIX_MAX_RATIO, m);
    const out = path.join(dir, "v4-patched.html");
    writeFileSync(out, r.files[0].contents);
    console.log("고친 파일:", out, existsSync(out) ? "" : "(못 씀)");
  }
}

console.log(`\n[${mode}] 본 줄 ${seen} · 어긋남 ${bad}`);
process.exit(bad === 0 ? 0 : 1);
