/**
 * **대본이 게임을 켜고 시작하나** (228회차 09-30). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/시작붙나.mts
 *
 * 3판(숫자 자취를 붙인 뒤)에서 **다시 보기 대본이 시작 단추를 안 눌러** 게임이 끝내 안 켜졌다.
 * 그 바퀴가 실제로 한 일: `'일시정지' 글자 없음 → '일시정지' 글자 없음 → 3초 기다림 → (제목 글자) 누름 → …`
 * 숫자 자취도 `titleBest 0` 하나뿐이었다 — **본 게 아무것도 없다.**
 *
 * 그때 그 대본을 그대로 먹여, 시작이 앞에 붙은 뒤에는 게임이 켜지고 숫자가 움직이는지 본다.
 */
import { runWeb, factLines, type RunAction } from "../../../src/lib/skills/appBuild/run";
import { readFileSync } from "node:fs";

const 판 = [{ path: "index.html", contents: readFileSync("engine/work/ceiling/게임3/index.html", "utf8") }];

// 3판 2바퀴의 대본(시작이 없다)
const 그때대본: RunAction[] = [
  { do: "click_text", text: "일시정지" }, { do: "click_text", text: "일시정지" }, { do: "wait", ms: 3000 },
  { do: "wait", ms: 10000 }, { do: "click_text", text: "다시 하기" }, { do: "wait", ms: 1000 },
  { do: "taps_moving", n: 6 }, { do: "wait", ms: 800 },
];
// 고친 고리가 앞에 붙이는 것(loop.ts 와 같은 규칙)
const 붙인대본: RunAction[] = [{ do: "click_text", text: "시작|start|play|플레이|게임 시작" }, { do: "wait", ms: 800 }, ...그때대본];

for (const [이름, 대본] of [["그때 대본 (시작 없음)", 그때대본], ["시작을 앞에 붙인 대본", 붙인대본]] as const) {
  console.log(`\n══════ ${이름}`);
  const f = await runWeb(판, { mobile: false, actions: 대본 });
  const 움직인것 = Object.entries(f.numberTrail).filter(([, v]) => v.length > 1);
  console.log("- 한 일:", f.did.slice(0, 4).join(" → "));
  for (const l of factLines(f)) if (/숫자|놀아 본 뒤 그대로/.test(l)) console.log("- " + l);
  console.log(`  → 숫자가 움직인 칸 ${움직인것.length}개 · 게임 글자에 "돈|점수|목숨|웨이브" ${/돈|점수|목숨|웨이브|life|score/i.test(f.text) ? "있음" : "없음"}`);
}
console.log("\n붙인 쪽에서만 숫자가 움직이면, 이 한 줄이 '못 본 바퀴' 를 없앤다는 뜻이다.");
