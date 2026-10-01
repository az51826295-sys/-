/**
 * **새 줄이 "타워가 안 쏜다" 를 드러내나** (228회차 09-30). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/숫자자취.mts
 *
 * 고친 고리가 `done` 으로 닫은 판(게임2)에는 **타워가 한 번도 안 쏘는 고장**이 있었다
 * (겨냥 줄이 `best=Infinity` 로 시작해 조건이 영영 거짓). 기준은 `모름` 으로 남았고 사진으로는 안 보였다.
 *
 * 새로 붙인 `numberTrail` 은 놀아 보는 동안 **화면 숫자가 지나온 값**을 적는다.
 * 돈이 한 번도 안 오르면 그건 "못 본 것" 이 아니라 **적을 못 죽였다는 사실**이다.
 *
 * 대조군으로 **겨냥 줄만 고친 판**도 같이 돌린다 — 둘의 자취가 달라야 이 줄이 값을 하는 것이다.
 */
import { runWeb, factLines, type RunAction } from "../../../src/lib/skills/appBuild/run";
import { readFileSync } from "node:fs";

const 원본 = readFileSync("engine/work/ceiling/게임2/index.html", "utf8");
const 고친것 = 원본.replace("let target=null,best=Infinity;", "let target=null,best=-Infinity;").replace("e.progress>best-999", "true");
if (고친것 === 원본) { console.error("대조군을 못 만들었다"); process.exit(1); }

// 타워를 길 옆에 놓고 한참 둔다 — 핵심 한 바퀴(쏜다→죽는다→돈이 는다)를 굴려 본다.
const 대본: RunAction[] = [
  { do: "click_text", text: "시작" }, { do: "wait", ms: 1500 },
  { do: "click_text", text: "궁수" }, { do: "tap", x: 0.13, y: 0.11 },
  { do: "click_text", text: "궁수" }, { do: "tap", x: 0.16, y: 0.3 },
  { do: "click_text", text: "궁수" }, { do: "tap", x: 0.28, y: 0.62 },
  { do: "wait", ms: 12000 }, { do: "wait", ms: 12000 },
];

for (const [이름, 몸] of [["원본(타워가 안 쏨)", 원본], ["겨냥 줄만 고친 판", 고친것]] as const) {
  console.log(`\n══════ ${이름}`);
  const f = await runWeb([{ path: "index.html", contents: 몸 }], { mobile: false, actions: 대본 });
  for (const l of factLines(f)) if (/숫자|놀아 본 뒤/.test(l)) console.log("- " + l);
  const 돈 = f.numberTrail["moneyText"] ?? [];
  const 올랐나 = 돈.some((v, i) => i > 0 && Number(v.replace(/[^0-9]/g, "")) > Number(돈[i - 1].replace(/[^0-9]/g, "")));
  console.log(`  → 돈 자취 ${JSON.stringify(돈)}`);
  console.log(`  → 돈이 오른 적 ${올랐나 ? "**있음**(적을 죽였다)" : "**없음**(한 번도 못 죽였다)"}`);
}
console.log("\n둘의 '돈이 오른 적' 이 다르면, 새 줄 하나로 이 고장이 **사실로 드러난다**는 뜻이다.");
