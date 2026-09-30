/**
 * **2048 이 진짜 2048 인가** — 로키가 만든 판을 실제로 눌러 보며 잰다 (228회차 09-30). 모델 0.
 *   npx tsx engine/work/perf2048/자.mts [수=150]
 *
 * 로키의 고리는 이 판을 **바퀴 1에 "done"** 으로 닫으면서 핵심 기준 둘을 `unknown` 으로 남겼다:
 *   c05 한 번 누를 때 이미 합쳐진 타일이 또 합쳐지지 않는다   c07 안 움직였으면 새 타일도 안 생긴다
 * 고리가 한 조작은 "다시 시작 누름 · 아무 데나 6번 누름 · ArrowRight · Space · KeyD" 였다.
 * **[4,4,4,4] 를 만들어 보지 않았으니 잴 수가 없었다** — 벽이 아니라 눈이 없었다.
 *
 * 이 자는 게임 속을 안 들여다본다(스크립트가 IIFE 라 닿지도 않는다). 대신:
 *  ① 화면(DOM)에서 판을 읽고 ② **내가 따로 짠 정답 규칙**으로 다음 판을 셈한 뒤
 *  ③ 진짜로 키를 눌러 나온 판과 **한 수씩** 댄다. 다른 곳이 나오면 그 수를 통째로 남긴다.
 * 새로 생기는 타일 하나는 자리가 무작위라 빼고 견준다(그 하나가 규칙대로 하나인지도 같이 잰다).
 *
 * 정답 규칙을 내가 다시 짠 것이 요점이다 — 같은 코드를 두 번 읽으면 같은 실수를 두 번 한다.
 */
import { readFileSync } from "node:fs";
import { openHeadless } from "../../../src/lib/video/headless";

const 수 = Number(process.argv[2] ?? 150);
/**
 * `--sabotage` — **자에 이빨이 있나**(115회차 09-14 의 규율: 자는 고장을 재현해 잡아야 자다).
 * 합친 칸을 건너뛰는 `i += 1` 한 줄을 지운다. 그러면 [4,4,4,4] → 왼쪽 이 [16] 이 된다.
 * 이걸 못 잡으면 위의 "어긋남 0" 은 자가 눈을 감은 것이지 판이 맞은 것이 아니다.
 */
const 고장심기 = process.argv.includes("--sabotage");
let 게임 = readFileSync("engine/work/perf2048/index.html", "utf8");
if (고장심기) {
  const 앞 = 게임;
  게임 = 게임.replace(`            gained += merged;\n            i += 1;`, `            gained += merged;`);
  if (게임 === 앞) { console.error("고장을 못 심었다 — 지울 줄을 못 찾았다. 자를 믿지 마라."); process.exit(1); }
  console.log("**고장을 심었다** — 합친 칸을 건너뛰지 않게 했다(이중 합침이 일어난다)");
}
type 판 = number[][];

/** 정답 2048 한 줄 밀기 — 합쳐진 칸은 그 수에서 또 안 합쳐진다. */
function 밀기(줄: number[]): { 줄: number[]; 점수: number } {
  const 찬것 = 줄.filter((v) => v !== 0), 결과: number[] = [];
  let 점수 = 0;
  for (let i = 0; i < 찬것.length; i++) {
    if (찬것[i] === 찬것[i + 1]) { 결과.push(찬것[i] * 2); 점수 += 찬것[i] * 2; i++; }
    else 결과.push(찬것[i]);
  }
  while (결과.length < 4) 결과.push(0);
  return { 줄: 결과, 점수 };
}
/** 정답 한 수 — 새 타일은 안 놓는다(자리가 무작위라 견줄 수 없다). */
function 한수(b: 판, 방향: string): { 판: 판; 점수: number; 바뀜: boolean } {
  const 새: 판 = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  let 점수 = 0, 바뀜 = false;
  for (let i = 0; i < 4; i++) {
    const 줄: number[] = [];
    for (let j = 0; j < 4; j++) {
      줄.push(방향 === "ArrowLeft" ? b[i][j] : 방향 === "ArrowRight" ? b[i][3 - j] : 방향 === "ArrowUp" ? b[j][i] : b[3 - j][i]);
    }
    const r = 밀기(줄); 점수 += r.점수;
    for (let j = 0; j < 4; j++) {
      if (r.줄[j] !== 줄[j]) 바뀜 = true;
      if (방향 === "ArrowLeft") 새[i][j] = r.줄[j];
      else if (방향 === "ArrowRight") 새[i][3 - j] = r.줄[j];
      else if (방향 === "ArrowUp") 새[j][i] = r.줄[j];
      else 새[3 - j][i] = r.줄[j];
    }
  }
  return { 판: 새, 점수, 바뀜 };
}
const 셈 = (b: 판) => b.flat().filter((v) => v !== 0).length;
const 글 = (b: 판) => b.map((r) => r.map((v) => String(v).padStart(4)).join("")).join(" / ");

const 창 = await openHeadless({ width: 800, height: 900 });
if (!창) { console.error("헤드리스 창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
// 바깥으로 나가는 길을 막는다(고리와 같은 규율) — 이 판은 어차피 파일 한 벌이다.
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().startsWith("data:") || r.url() === "about:blank" ? r.continue() : r.abort()));
await page.setContent(게임, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 400));

/** 화면에서 판을 읽는다 — 칸 16개의 글자를 그대로. 게임 속 변수는 안 본다. */
const 읽기 = async (): Promise<판> => {
  const 값 = await page.evaluate(() => {
    const 칸 = Array.from(document.querySelectorAll("#board > *"));
    return 칸.map((c) => { const t = (c.textContent ?? "").trim(); return t === "" ? 0 : Number(t); });
  });
  if (값.length !== 16 || 값.some((v) => !Number.isFinite(v))) throw new Error(`판을 못 읽었다: ${JSON.stringify(값)}`);
  return [0, 1, 2, 3].map((r) => 값.slice(r * 4, r * 4 + 4));
};
const 점수읽기 = async () => Number(await page.evaluate(() => (document.getElementById("score")?.textContent ?? "0").trim()));

const 방향들 = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
const 어긋남: string[] = [];
let 잰수 = 0, 합침본수 = 0, 이중기회 = 0, 안움직인수 = 0, 점수어긋남 = 0, 넉줄같음 = 0;

/** 한 줄이 [4,4,4,4] 처럼 같은 값 넷 — 이중 합침 덫이 **실제로 놓인** 수인지 센다. */
const 덫있나 = (b: 판, 방향: string) => {
  for (let i = 0; i < 4; i++) {
    const 줄: number[] = [];
    for (let j = 0; j < 4; j++) 줄.push(방향 === "ArrowLeft" || 방향 === "ArrowRight" ? b[i][j] : b[j][i]);
    const 찬것 = 줄.filter((v) => v !== 0);
    if (찬것.length === 4 && 찬것[0] === 찬것[1] && 찬것[1] === 찬것[2] && 찬것[2] === 찬것[3]) return true;
    if (찬것.length >= 3 && 찬것[0] === 찬것[1] && 찬것[1] === 찬것[2]) return true;   // [4,4,4,..] 도 덫이다
  }
  return false;
};

let 판앞 = await 읽기(), 점수앞 = await 점수읽기();
// 시작 상태도 잰다
if (셈(판앞) !== 2) 어긋남.push(`시작 타일이 ${셈(판앞)}개 (2개여야 한다): ${글(판앞)}`);
if (판앞.flat().some((v) => v !== 0 && v !== 2 && v !== 4)) 어긋남.push(`시작 타일에 2·4 가 아닌 값: ${글(판앞)}`);

for (let n = 0; n < 수 && 어긋남.length < 6; n++) {
  const 방향 = 방향들[Math.floor(Math.random() * 4)];
  const 기대 = 한수(판앞, 방향);
  // 이 수에 **이중 합침 기회**가 있었나 — 한 줄에 같은 값이 네 개(또는 2쌍) 이상
  const 쌍 = 기대.판.flat().filter((v) => v !== 0).length < 셈(판앞) - 1;
  if (쌍) 이중기회++;
  if (덫있나(판앞, 방향)) 넉줄같음++;
  await page.keyboard.press(방향 as never);
  await new Promise((r) => setTimeout(r, 70));
  const 판뒤 = await 읽기(), 점수뒤 = await 점수읽기();
  잰수++;
  if (기대.점수 > 0) 합침본수++;
  if (!기대.바뀜) {
    안움직인수++;
    // c07 — 안 움직였으면 판도 점수도 그대로여야 한다
    if (글(판뒤) !== 글(판앞)) 어긋남.push(`c07 안 움직이는 ${방향} 인데 판이 바뀌었다\n  앞 ${글(판앞)}\n  뒤 ${글(판뒤)}`);
    if (점수뒤 !== 점수앞) 어긋남.push(`c07 안 움직이는 ${방향} 인데 점수가 ${점수앞}→${점수뒤}`);
  } else {
    // c05·c06 — 새로 생긴 타일 **하나**를 빼면 정답 판과 같아야 한다
    const 다른칸: string[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (판뒤[i][j] !== 기대.판[i][j]) 다른칸.push(`(${i},${j}) 기대 ${기대.판[i][j]} 실제 ${판뒤[i][j]}`);
    const 새로난것 = 다른칸.length === 1 && 기대.판[Number(다른칸[0][1])][Number(다른칸[0][3])] === 0 && [2, 4].includes(판뒤[Number(다른칸[0][1])][Number(다른칸[0][3])]);
    if (!새로난것) {
      어긋남.push(`c05/c06 ${방향} 뒤 판이 규칙과 다르다 (다른 칸 ${다른칸.length}개: ${다른칸.join(", ")})\n  앞   ${글(판앞)}\n  기대 ${글(기대.판)}\n  실제 ${글(판뒤)}`);
    }
    // c08 — 점수는 합쳐진 값의 합만큼만 오른다
    if (점수뒤 - 점수앞 !== 기대.점수) { 점수어긋남++; 어긋남.push(`c08 ${방향} 점수가 ${점수뒤 - 점수앞} 올랐다 (규칙대로면 ${기대.점수})\n  앞 ${글(판앞)}`); }
  }
  판앞 = 판뒤; 점수앞 = 점수뒤;
  const 끝 = await page.evaluate(() => (document.getElementById("message")?.textContent ?? "").trim());
  if (끝) {
    // c11 — 게임 오버는 정말 더 못 움직일 때만 떠야 한다
    const 움직일수있나 = 방향들.some((d) => 한수(판앞, d).바뀜);
    if (움직일수있나) 어긋남.push(`c11 아직 ${방향들.filter((d) => 한수(판앞, d).바뀜).join("·")} 로 움직일 수 있는데 "${끝}" 이 떴다\n  ${글(판앞)}`);
    else console.log(`  게임 오버가 제때 떴다 (${잰수}수째) — 다시 시작하고 이어 잰다`);
    await page.click("#restart");
    await new Promise((r) => setTimeout(r, 200));
    판앞 = await 읽기(); 점수앞 = await 점수읽기();
    if (셈(판앞) !== 2 || 점수앞 !== 0) 어긋남.push(`c10 다시 시작인데 타일 ${셈(판앞)}개·점수 ${점수앞}`);
  }
}
await 창.close();

console.log(`\n**${잰수}수를 눌렀다** — 합쳐진 수 ${합침본수} · 아무것도 안 움직인 수 ${안움직인수} · 한 수에 둘 이상 합쳐진 수 ${이중기회} · **이중 합침 덫이 놓인 수 ${넉줄같음}**`);
if (넉줄같음 === 0) console.log("⚠ 덫이 한 번도 안 놓였다 — c05 는 **못 잰 것**이다(통과가 아니다). 수를 늘려라.");
if (!어긋남.length) console.log(고장심기 ? "**어긋남 0 — 자가 심은 고장을 못 잡았다. 자를 고쳐야 한다.**" : "**어긋남 0** — 판·점수가 규칙과 한 수도 안 틀렸다");
else if (고장심기) console.log("↑ 심은 고장을 잡았다 — **자에 이빨이 있다**");
else { console.log(`\n**어긋남 ${어긋남.length}개**`); for (const e of 어긋남) console.log("- " + e); }
