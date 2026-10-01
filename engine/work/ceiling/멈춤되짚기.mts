/**
 * **멈춤 되짚기가 일을 하나** (228회차 09-30). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/멈춤되짚기.mts
 *
 * 5판 마지막 바퀴는 **판 전체가 멈춘 채로** 돌았다. 대본이 '일시정지' 를 켰는데, 멈추면 단추 글자가
 * "다시 시작" 으로 바뀌어 같은 글자로 못 끈다. 그 뒤에 타워 고르기 단추를 누르는 바람에
 * 내 '멈춤 풀기' 는 **엉뚱한 단추**(번개 타워)를 눌러 보고 "풀어도 안 움직임" 이라 적었다.
 * 그래서 심판은 멀쩡한 판에 **틀린 틀림 둘**(타워가 안 쏜다·일시정지가 안 풀린다)을 적었다.
 * (내가 따로 재니 돈 125→526 으로 잘 죽이고, 풀면 잘 돈다.)
 *
 * 고친 것: 누른 단추를 **전부 기억했다가 뒤에서부터** 되짚는다. 그 대본 그대로 먹여 확인한다.
 */
import { runWeb, factLines, type RunAction } from "../../../src/lib/skills/appBuild/run";
import { readFileSync } from "node:fs";

const 판 = [{ path: "index.html", contents: readFileSync("engine/work/ceiling/게임5/index.html", "utf8") }];
// 5판 마지막 바퀴가 실제로 한 조작
const 그때대본: RunAction[] = [
  { do: "click_text", text: "시작" }, { do: "wait", ms: 800 },
  { do: "click_text", text: "일시정지" }, { do: "wait", ms: 1500 },
  { do: "click_text", text: "일시정지" }, { do: "wait", ms: 3000 },
  { do: "click_text", text: "번개" }, { do: "click_text", text: "길 위" },
  { do: "click_text", text: "일시정지" }, { do: "wait", ms: 5000 },
  { do: "taps_moving", n: 6 }, { do: "wait", ms: 800 },
];

const f = await runWeb(판, { mobile: false, actions: 그때대본 });
for (const l of factLines(f)) if (/놀아 본 뒤 그대로|숫자|해 본 조작/.test(l)) console.log("- " + l);
console.log("");
console.log(f.resumeProbe === "풀려서움직임"
  ? "**맞음** — 되짚어서 멈춤을 풀었다. 심판은 이제 '멈춰 있었다' 를 보고 '고장' 이라 안 적는다."
  : `**어긋남** — ${f.resumeProbe}. 아직 멈춘 채로 심판에게 간다.`);
