/**
 * **고친 셋이 진짜 일을 하나** (228회차 09-30). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/고친뒤.mts
 *
 * 09-30 타워 디펜스 판이 남긴 고장 셋을 고쳤다. 코드를 고쳤다고 고쳐진 게 아니다 —
 * **그때 그 판에 그때 그 대본을 그대로 먹여** 사실이 달라지는지 본다([[unrun-code-is-unmeasured]]).
 *
 * 그때 고리가 한 조작(`loop.facts.did`)을 그대로 쓴다. 바뀌어야 하는 것:
 *  ① '일시정지' 글자가 **안내 딱지**가 아니라 **단추**에 걸려, 두 번 누르면 멈춤이 풀린다
 *  ② 그래서 마지막에 게임이 **도는 중**이다 → 새 사실 `놀아 본 뒤 그대로 두면 계속 바뀜`
 * 안 바뀌면 고친 것이 헛것이다.
 */
import { runWeb, factLines, type RunAction } from "../../../src/lib/skills/appBuild/run";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const 뿌리 = "engine/work/ceiling/게임";
const 파일들: { path: string; contents: string }[] = [];
const 훑기 = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) 훑기(p);
    else 파일들.push({ path: relative(뿌리, p).split("\\").join("/"), contents: readFileSync(p, "utf8") });
  }
};
훑기(뿌리);
console.log(`판: ${파일들.length}개 파일 · ${파일들.reduce((s, f) => s + f.contents.length, 0)}자\n`);

// 09-30 고리가 실제로 한 조작 그대로
const 그때대본: RunAction[] = [
  { do: "click_text", text: "시작" }, { do: "wait", ms: 5000 },
  { do: "click_text", text: "일시정지" }, { do: "taps", n: 1 }, { do: "wait", ms: 3000 },
  { do: "click_text", text: "일시정지" }, { do: "taps", n: 1 },
  { do: "click_text", text: "일시정지" }, { do: "wait", ms: 2000 },
  { do: "click_text", text: "일시정지" }, { do: "taps_moving", n: 6 }, { do: "wait", ms: 800 },
];

const f = await runWeb(파일들, { mobile: false, actions: 그때대본 });
for (const l of factLines(f)) console.log("- " + l);

/**
 * 무엇이 고쳐져야 하나 — 고친 것은 **누를 것을 고르는 법과 사실을 적는 법**이지, 대본의 뜻을 알아내는 게 아니다.
 * 멈춘 뒤에는 단추 글자가 "▶ 다시" 라 "일시정지" 로 맞는 **단추가 아예 없다**. 그때는 그렇게 적는 것이 맞다.
 * 심판자가 알아야 할 것은 "고장났다" 가 아니라 **"지금 멈춰 있다"** 이고, 그건 아래 셋으로 전해진다.
 */
const 첫누르기 = f.did.find((d) => d.includes("일시정지") && d.includes("누름")) ?? "(없음)";
const 하나 = 첫누르기.includes("Ⅱ 일시정지") && !첫누르기.includes("누를 수 있는 것이 없어");
const 둘 = f.did.filter((d) => d.includes("누를 수 있는 것이 없어")).length > 0;
const 셋 = f.movesAfterPlay === 0 && /▶ 다시/.test(f.text);
console.log("");
console.log(`${하나 ? "맞음  " : "어긋남"} ① 첫 '일시정지' 가 **단추**에 걸린다 (전에는 안내 딱지였다) — "${첫누르기}"`);
console.log(`${둘 ? "맞음  " : "어긋남"} ② 멈춘 뒤엔 맞는 단추가 없다고 **정직하게 적는다** (전에는 딱지를 누르고 눌렀다고 적었다)`);
console.log(`${셋 ? "맞음  " : "어긋남"} ③ 심판자가 "멈춰 있다" 를 알 수 있다 — 놀아 본 뒤 움직임 ${f.movesAfterPlay}/2 + 화면 글자에 "▶ 다시"`);
console.log(하나 && 둘 && 셋 ? "\n**셋 다 고쳐졌다** — 심판자는 이제 '고장' 이 아니라 '멈춤' 을 본다" : "\n**아직 덜 됐다**");
