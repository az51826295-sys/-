/**
 * **턴제 길드 판이 끝까지 도나** (228회차 10-04). 모델 0 · 값 0.
 *   npx tsx engine/work/ask/턴제자.mts [폴더]
 *
 * 한 턴이 1.4초라 사람이 100층까지 보려면 한참이다. 그래서 **창 안에서 턴을 직접 돌린다** —
 * 기다리는 대신 빨리 감는다. 재는 것은 셋이다:
 *   ① 층이 오르나 ② 보스에서 제어가 없으면 막히나(대조군) ③ 수명이 다하면 죽나
 */
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

// `--` 로 시작하는 건 스위치다 — 폴더로 읽으면 빈 판을 열고 "한턴 is not a function" 으로 죽는다(10-07)
const 뿌리 = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "C:/Users/az518/Desktop/로키-길드턴제").split("\\").join("/");
mkdirSync("C:/Users/az518/Desktop/로키-턴제-사진", { recursive: true });
const 종류: Record<string, string> = { ".html":"text/html", ".png":"image/png", ".js":"text/javascript", ".css":"text/css" };
const 서버 = createServer((q, s) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((q.url ?? "/").split("?")[0]))).split("\\").join("/");
  const f = (existsSync(길) && statSync(길).isDirectory()) || !extname(길) ? join(뿌리, "index.html") : 길;
  if (!f.split("\\").join("/").startsWith(뿌리) || !existsSync(f)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { "content-type": 종류[extname(f)] ?? "text/plain" }); s.end(readFileSync(f));
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
const 오류: string[] = [];
page.on("pageerror", (e) => 오류.push(String(e).slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.location()?.url ?? "")) 오류.push(m.text().slice(0, 140)); });
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));
// 지난 판의 저장이 남아 있으면 그 위에서 재게 된다 — 비우고 새로 연다(10-07 저장 기능)
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload({ waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 1500));

const 잰것: [string, boolean | null, string][] = [];
const 재 = (n: string, ok: boolean | null, 본: string) => { 잰것.push([n, ok, 본]); console.log(`${ok===true?"맞음  ":ok===false?"**어긋남**":"못 잼 "} ${n}\n        ${본}`); };

/** 창 안에서 턴을 n번 돌리고 상태를 가져온다. 기다리지 않는다 — 기다리면 100층에 두 시간이다. */
const 돌리기 = (n: number) => page.evaluate((n) => {
  const w = window as any;
  for (let i = 0; i < n; i++) { if (!w.S.진행) break; w.한턴(); }
  const 글 = (document.querySelector("#log") as HTMLElement).innerText;
  return {
    층: w.S.층, 단계: w.S.단계, 금화: w.S.금화,
    대원: w.S.대원.length, 산것: w.S.대원.filter((c: any) => c.살아있나).length,
    최고출전: Math.max(0, ...w.S.대원.map((c: any) => c.출전)),
    최고레벨: Math.max(0, ...w.S.대원.map((c: any) => c.레벨)),
    글끝: 글.slice(-900),
  };
}, n);

/**
 * **게임의 제 타이머를 먼저 끈다.** 10-04 첫 판에서 1.4초짜리 setInterval 이 내가 재는 사이에도 계속 돌아
 * 상태가 흔들렸다(보스 칸을 10층으로 맞춰 놨는데 9층이 나왔다). 자와 게임이 **같은 판을 동시에 밀면** 잰 게 아니다.
 */
await page.evaluate(() => { const w = window as any; for (let i = 1; i < 9999; i++) clearInterval(i); w.S.진행 = true; });

const a = await 돌리기(3000);   // 장면을 흘리는 데도 턴이 쓰인다 — 넉넉히
재("① 층이 오르나", a.층 > 1, `${a.층}층 · ${a.단계}구간 · 금화 ${a.금화.toLocaleString()}`);
재("② 보스를 넘으면 대원이 늘어나나", a.대원 > 3, `대원 ${a.대원}명 (산 사람 ${a.산것})`);
재("③ 레벨이 오르나", a.최고레벨 > 1, `가장 높은 레벨 ${a.최고레벨}`);
await page.screenshot({ path: "C:/Users/az518/Desktop/로키-턴제-사진/중간.png", fullPage: false });

/**
 * ④ 보스 보호막은 **제어가 있어야 바로** 벗겨지나 — 대조군으로 (10-07 새 규칙: 다른 궁극기는 25%씩만 깎는다).
 * 그래서 "끝까지 못 깎나" 가 아니라 **3턴 안에** 보스 체력이 깎였나로 잰다: 제어 빼면 0, 넣으면 >0.
 * 세리안 궁극기는 막 3번 뒤라 3턴 안에는 안 터진다 — 터지더라도 25% 라 보호막이 남는다.
 */
const 보스시험 = (제어넣기: boolean) => page.evaluate((제어넣기) => {
  const w = window as any;
  const 키들 = 제어넣기 ? ["기사","검사","회복술사","흑마법사"] : ["기사","검사","회복술사"];
  const 파티 = 키들.map((k) => w.S.대원.find((c: any) => c.키 === k) ?? (() => { const c = w.대원만들기(k, 30); w.S.대원.push(c); return c; })());
  for (const c of 파티) c.레벨 = Math.max(c.레벨, 30);
  w.S.파티 = 파티.map((c: any) => c.id);
  w.S.쉼 = 0; w.S.층 = 40; w.S.단계 = 4;
  w.적만들기();
  for (const c of 파티) { c.hp = w.최대체력(c); c.막 = 0; c.쿨 = 0; c.궁 = 0; }
  const 보스앞 = w.적들[0]?.hp ?? null;
  let 턴 = 0;
  for (let i = 0; i < 400 && 턴 < 3; i++) {
    for (const c of 파티) c.hp = w.최대체력(c);              // 안 죽게 붙잡아 둔다
    const 앞턴 = (document.querySelector("#log") as HTMLElement).innerText.split("턴 ").length;
    w.한턴();
    if ((document.querySelector("#log") as HTMLElement).innerText.split("턴 ").length > 앞턴) 턴++;
  }
  // 3턴째 장면까지 다 흘린다
  for (let i = 0; i < 60; i++) { const 앞 = w.적들[0]?.hp; w.한턴(); if (w.적들[0]?.hp !== 앞) break; }
  const 보스뒤 = w.적들.length ? w.적들[0].hp : 0;
  return { 보스앞, 보스뒤, 깎임: 보스앞 !== null ? 보스앞 - 보스뒤 : null, 보호막: w.적들[0]?.보호막 };
}, 제어넣기);

const 없이 = await 보스시험(false);
const 넣고 = await 보스시험(true);
재("④ 제어가 있어야 보스 보호막이 바로 벗겨지나",
  없이.깎임 === null || 넣고.깎임 === null ? null : 없이.깎임 === 0 && 넣고.깎임 > 0,
  없이.깎임 === null ? "보스 체력을 못 읽어 못 잰다"
    : `3턴 — 제어 빼고 → 보스 체력 ${없이.깎임} 깎임(보호막 ${없이.보호막}%) · 넣고 → ${넣고.깎임} 깎임`);

/**
 * ⑤ **속도 순서가 아군·적을 섞나** (10-07 사장님 A). 예전처럼 "아군 전원 → 적 전원" 이면 어긋남.
 * 박쥐(125)가 모두보다 빠르고 쥐(105)는 리안(108)과 미르(100) 사이라, 섞이면 적 사이에 아군이 끼어야 한다.
 */
const 순서 = await page.evaluate(() => {
  const w = window as any;
  const 파티 = ["기사","검사","회복술사"].map((k) => w.S.대원.find((c: any) => c.키 === k));
  w.S.파티 = 파티.map((c: any) => c.id); w.S.쉼 = 0; w.S.층 = 5; w.S.단계 = 1;   // 5층: 쥐·슬라임·박쥐 셋
  w.적만들기();
  for (const c of 파티) c.hp = w.최대체력(c);
  // 앞 시험(④ 보스전)의 순서가 남아 있다 — **새 턴이 실제로 돌아 순서가 새로 만들어질 때까지** 돌린다(10-07 거짓 어긋남)
  const 옛 = w.행동순서;
  for (let i = 0; i < 200 && w.행동순서 === 옛; i++) w.한턴();
  return { 순서: [...w.행동순서], 적: w.적들.map((e: any) => `${e.이름}(${e.속도})`) };
});
const 섞임 = 순서.순서.join("").replace(/(아군)+/g, "A").replace(/(적)+/g, "E");
재("⑤ 속도 순서가 아군·적을 섞나", 순서.순서.length ? /E.*A.*E|A.*E.*A/.test(섞임) : null,
  `한 턴의 행동 순서 ${순서.순서.join("→")} · 적 ${순서.적.join(", ")}`);

/**
 * ⑦ **기술마다 빛이 터지나**. 일반공격·스킬·궁극기·회복·사슬이 저마다 빛 종류를 낸다.
 * `--sabotage` 를 붙이면 회복의 빛을 지운다 — 그때 이 줄이 떨어져야 자가 이빨이 있는 것이다.
 */
const 망치기 = process.argv.includes("--sabotage");
const 빛 = await page.evaluate((망치기) => {
  const w = window as any;
  if (망치기) delete w.빛표.회복;
  for (const k of Object.keys(w.빛셈)) delete w.빛셈[k];
  const 넷 = ["기사","검사","회복술사","흑마법사"].map((k) => w.S.대원.find((c: any) => c.키 === k) ?? (() => { const c = w.대원만들기(k, 30); w.S.대원.push(c); return c; })());
  w.S.파티 = 넷.map((c: any) => c.id); w.S.쉼 = 0; w.S.층 = 40; w.S.단계 = 4; w.S.진행 = true;
  w.적만들기();
  for (const c of 넷) { c.hp = Math.floor(w.최대체력(c) * 0.6); c.궁 = 0; c.쿨 = 0; }   // 다친 채로 — 회복이 쓸 자리가 있어야 한다
  for (let i = 0; i < 160; i++) { for (const c of 넷) if (c.hp <= 0) c.hp = 1; w.한턴(); }
  const 기대 = ["탄", "막", "섬광", "회복", "사슬"];
  return { 셈: { ...w.빛셈 }, 빠짐: 기대.filter((k) => !(w.빛셈[k] > 0)) };
}, 망치기);
재(`⑦ 기술마다 빛이 터지나${망치기 ? " (sabotage: 회복 빛 지움)" : ""}`, 빛.빠짐.length === 0,
  `${Object.entries(빛.셈).map(([k, v]) => `${k} ${v}`).join(" · ") || "빛 0"}${빛.빠짐.length ? ` — 빛 없음: ${빛.빠짐.join(", ")}` : ""}`);
/**
 * ⑧ **공방이 실제로 세지게 하나** (10-07). 만들기 → 장착 → 공격력이 정확히 +18 오르나,
 * 재료가 모자라면 안 만들어지나, 회복약을 챙기면 절반 아래에서 실제로 깨지나.
 */
const 공 = await page.evaluate(async () => {
  const w = window as any;
  w.S.최고층 = 10; w.S.금화 = 100000; Object.assign(w.S.가방, { 파편:100, 잔혼:100, 수호핵:3 });
  const 리안 = w.S.대원.find((c: any) => c.키 === "검사");
  const 앞 = w.공격력(리안);
  const 됨 = w.만들기("철검");
  const 템 = w.S.가방.장비[w.S.가방.장비.length - 1];
  w.장착(템.id, 리안.id);
  const 차이 = w.공격력(리안) - 앞;
  w.S.가방.수호핵 = 0;
  const 안됨 = !w.만들기("철검");
  w.만들기("회복약"); w.S.약챙김 = true;
  w.S.파티 = [리안.id]; w.S.쉼 = 0; w.S.층 = 5; w.S.단계 = 1;
  w.적만들기(); w.전투준비();
  // 리안은 앞 시험에서 레벨이 높아 5층 몹이 거의 못 깎고 층이 먼저 끝났다(10-07 거짓 어긋남) — 적을 단단하고 세게
  for (const e of w.적들) { e.hp = e.최대 = 1e9; e.공격 = w.최대체력(리안) * 0.3; }
  리안.hp = Math.floor(w.최대체력(리안) * 0.55);
  const el = document.querySelector("#log") as HTMLElement;
  let 깨짐 = false;
  for (let i = 0; i < 120 && !깨짐; i++) { if (리안.hp <= 0) 리안.hp = 1; w.한턴(); 깨짐 = el.innerText.includes("별빛 회복약이 깨졌다"); }
  return { 됨, 차이, 안됨, 깨짐 };
});
재("⑧ 공방: 만들고 끼우면 세지나", 공.됨 && 공.차이 === 18 && 공.안됨 && 공.깨짐,
  `철검 ${공.됨 ? "만듦" : "못 만듦"} · 공격 +${공.차이} · 재료 없을 때 ${공.안됨 ? "막힘" : "만들어짐"} · 회복약 ${공.깨짐 ? "깨짐" : "안 깨짐"}`);
/** ⑨ **저장하고 다시 켜면 이어지나** (10-07). 층·금화·대원 수를 바꿔 저장하고 창을 새로 연다. */
const 저장전 = await page.evaluate(() => { const w = window as any; for (let i = 1; i < 9999; i++) clearInterval(i);
  w.S.층 = 7; w.S.최고층 = 7; w.S.금화 = 4321; w.저장(); return { 층: w.S.층, 금화: w.S.금화, 대원: w.S.대원.length }; });
await page.reload({ waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 1500));
const 저장후 = await page.evaluate(() => { const w = window as any; return { 층: w.S.층, 금화: w.S.금화, 대원: w.S.대원.length }; });
재("⑨ 저장하고 다시 켜면 이어지나", 저장후.층 === 저장전.층 && 저장후.금화 === 저장전.금화 && 저장후.대원 === 저장전.대원,
  `저장 ${저장전.층}층·금화 ${저장전.금화}·대원 ${저장전.대원} → 다시 켬 ${저장후.층}층·금화 ${저장후.금화}·대원 ${저장후.대원}`);
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
재("⑥ 오류 없이 도나", 오류.length === 0, 오류.length ? 오류.slice(0, 3).join(" | ") : "창 오류 0");
await page.screenshot({ path: "C:/Users/az518/Desktop/로키-턴제-사진/끝.png", fullPage: false });

const 맞 = 잰것.filter((x) => x[1] === true).length, 어 = 잰것.filter((x) => x[1] === false).length, 못 = 잰것.filter((x) => x[1] === null).length;
console.log(`\n맞음 ${맞} · 어긋남 ${어} · 못 잼 ${못}`);
await 창.browser.close(); await 창.close?.(); 서버.close();
