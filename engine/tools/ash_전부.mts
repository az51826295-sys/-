/**
 * **잿빛 자를 전부 돌린다** (10-11 사장님 "자 넣었어?"). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_전부.mts [--느린것도] [--sabotage]
 *
 * 그동안 자는 **내가 매번 손으로 목록을 쳐서** 돌렸다. 그러면 두 가지가 샌다:
 *   ① 새로 만든 자를 목록에 안 넣으면 **영영 안 돈다**
 *   ② 그날 생각난 것만 돌고 나머지는 조용히 빠진다
 * (10-11 에 `물건아이콘` 표에 T4~T10 을 안 적어 그림 열넷이 빠진 채로 돌던 것과 **같은 모양**이다.)
 *
 * 그래서 목록을 파일에 적어 두고, **폴더에 있는데 목록에 없는 자를 적발한다.**
 * 순서도 뜻이 있다 — `살았나` 가 먼저다. 게임이 죽어 있으면 나머지는 손으로 부르느라
 * 전부 초록으로 통과한다(10-09 에 실제로 37/37 이 그랬다).
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

type 자 = { 이름: string; 느림?: boolean; 인자?: string[]; 까닭?: string };

/** 도는 순서 그대로. `살았나` 는 **반드시 맨 앞**이다. */
const 목록: 자[] = [
  { 이름: "ash_살았나",     까닭: "게임이 살아 있나 — 이게 떨어지면 나머지는 볼 것도 없다" },
  { 이름: "ash_문법" },
  { 이름: "ash_글자_시험" },
  { 이름: "ash_그림_빠짐" },
  { 이름: "ash_첫십분",     까닭: "처음 온 사람의 첫 십 분 — 테스터 열두 명이 겪을 자리" },
  { 이름: "ash_꾹누르기",   까닭: "10-17 폰에서 꾹 누르니 그림 메뉴가 게임을 덮었다" },
  { 이름: "ash_기술_시험" },
  { 이름: "ash_카드_시험" },
  { 이름: "ash_무리_시험" },
  { 이름: "ash_자격_시험" },
  { 이름: "ash_시장_시험" },
  { 이름: "ash_뽑기_시험" },
  { 이름: "ash_SR_시험" },
  { 이름: "ash_영혼석_시험" },
  { 이름: "ash_성장곡선" },
  { 이름: "ash_금화곡선" },
  { 이름: "ash_막힘_시험", 느림: true, 인자: ["100"], 까닭: "대조군 열하나 × 100층 — 한 시간 넘게 간다" },
  { 이름: "ash_체감",     느림: true, 까닭: "맨땅에서 실제로 돌며 장비를 맞춘다 — 십 분 넘게 간다" },
];

/** 자가 아닌 것(사진 찍는 도구·그림 뽑는 도구 등)은 세지 않는다 */
const 자아님 = new Set([
  "ash_몹그림", "ash_탑그림", "ash_아이콘", "ash_아이콘넣기", "ash_광산넣기", "ash_적넣기",
  "ash_길드홀", "ash_icons", "ash_store_shots", "ash_공통", "ash_전부", "ash_난이도",
  "ash_후보판", "ash_보스사진", "ash_SR_사진", "ash_카드_사진", "ash_맵_사진", "ash_영혼석_사진",
  "ash_관문해부", "ash_제작막힘", "ash_snd_check", "ash_맵_시험", "ash_길드_시험",
  "ash_구간배경",   // 10-11: 자가 바로 잡아냈다 — 그림 뽑는 도구다
]);

const 느린것도 = process.argv.includes("--느린것도");
const 사보 = process.argv.includes("--sabotage");

/* **폴더에 있는데 목록에 없는 자**를 먼저 적발한다 — 안 그러면 새 자가 조용히 안 돈다 */
const 폴더 = readdirSync("engine/tools")
  .filter((f) => f.startsWith("ash_") && f.endsWith(".mts"))
  .map((f) => f.replace(/\.mts$/, ""));
const 목록이름 = new Set(목록.map((r) => r.이름));
const 샌것 = 폴더.filter((n) => !목록이름.has(n) && !자아님.has(n));
const 없는것 = [...목록이름].filter((n) => !폴더.includes(n));

console.log(`잿빛 자 ${목록.length}개${느린것도 ? "" : " (느린 둘은 건너뜀 — --느린것도 로 켠다)"}\n`);
if (샌것.length) console.log(`⚠ **목록에 없는 자 ${샌것.length}개** — 이대로면 영영 안 돈다: ${샌것.join(", ")}\n`);
if (없는것.length) console.log(`⚠ 목록에 적혔는데 파일이 없다: ${없는것.join(", ")}\n`);

/* 10-13: 묶음 판에서 `ash_첫십분` 이 "3.1초 · 실패" 를 냈다. 게임은 멀쩡했고, 옆에서
   내 다른 일거리가 기계를 먹고 있었다. 시간을 재는 자는 **한가한 기계**가 있어야 뜻이 있다 —
   그래서 묶음 시작에 기계가 바쁜지 한 번 적는다(자마다 다시 재서 "못 잼" 으로 적는다). */
const 일거리 = () => { const t = Date.now(); let x = 0; for (let i = 0; i < 6e6; i++) x += i % 7; return Date.now() - t + (x ? 0 : 0); };
일거리();
const 바쁨 = Math.min(일거리(), 일거리());
if (바쁨 > 60) console.log(`⚠ **기계가 바쁘다**(일거리 ${바쁨}ms · 한가하면 20ms 안) — 시간 재는 칸은 믿지 말 것\n`);

const 결과: Array<{ 이름: string; 됨: boolean; 끝줄: string; 초: number }> = [];
for (const r of 목록) {
  if (r.느림 && !느린것도) { console.log(`${r.이름.padEnd(16)} 건너뜀 (${r.까닭})`); continue; }
  const 시작 = Date.now();
  const p = spawnSync("npx", ["tsx", `engine/tools/${r.이름}.mts`, ...(r.인자 ?? []), ...(사보 ? ["--sabotage"] : [])],
    { encoding: "utf8", shell: true, env: process.env });
  const 줄들 = `${p.stdout ?? ""}`.trimEnd().split("\n");
  const 끝줄 = 줄들[줄들.length - 1] ?? "(아무 말도 없다)";
  const 됨 = p.status === 0;
  const 초 = Math.round((Date.now() - 시작) / 1000);
  결과.push({ 이름: r.이름, 됨, 끝줄, 초 });
  console.log(`${됨 ? "통과" : "실패"} ${r.이름.padEnd(16)} ${`${초}초`.padStart(6)}  ${끝줄}`);
  /* **살았나가 떨어지면 거기서 멈춘다.** 게임이 죽은 채로 나머지를 돌리면
     손으로 함수를 부르는 자들이 전부 초록으로 지나간다(10-09 교훈). */
  if (!됨 && r.이름 === "ash_살았나") { console.log("\n**게임이 죽어 있다** — 나머지는 볼 것도 없으므로 멈춘다."); break; }
}

const 떨어진 = 결과.filter((r) => !r.됨);
console.log(`\n${결과.length}개 돌려 ${결과.length - 떨어진.length}개 통과`
  + (떨어진.length ? ` · **떨어진 것: ${떨어진.map((r) => r.이름).join(", ")}**` : "")
  + (샌것.length ? ` · ⚠ 목록에 없는 자 ${샌것.length}개` : ""));
process.exit(떨어진.length || 샌것.length ? 1 : 0);
