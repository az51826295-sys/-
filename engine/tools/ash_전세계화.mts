/**
 * **영어로 열고 게임을 돌아다니며 한국어가 남았나** (10-24). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_전세계화.mts [--sabotage]
 *
 * `ash_말` 은 **첫 화면만** 본다 — 그래서 "2자 남음" 이라고 적는 동안 전투 글·기술 설명·
 * 가방·대장간에 5,650자가 그대로 있었다(10-24 실측). 첫 화면이 깨끗한 것은 전세계화가 아니다.
 *
 * 그래서 이 자는 **탭을 하나씩 열어 보고**, 그 화면에 남은 한국어를 **글자 수와 함께** 적는다.
 * 통과/실패를 정하지 않고 **잰 값을 낸다** — 지금은 줄어드는 중이고, 0 이 되기 전엔 다 실패다.
 * 다만 **올라가면** 떨어진다: 자리마다 문턱을 두고, 넘으면 실패로 적는다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";

const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 심을까 = process.argv.includes("--sabotage");

/** 자리마다 **지금까지 잰 가장 낮은 값**. 넘으면 뒤로 간 것이다. */
const 문턱: Record<string, number> = {
  "길드": 0, "캐릭터": 0, "전투": 0, "대장간": 0, "시장": 0,
  "가방": 0, "자격": 0, "탑": 0, "기술 풀이": 0,
};

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, 본 === undefined ? "" : JSON.stringify(본)); };

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);

  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate(() => { try { localStorage.clear(); localStorage.setItem("ash.lang", "en"); } catch { /* 저장소 없음 */ } });
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1500));

  const 쓰는말 = await page.evaluate(() => (window as unknown as { 쓰는말?: string }).쓰는말 ?? "?");
  재기("영어로 열렸다", 쓰는말 === "en", { 쓰는말 });

  /**
   * 심은 고장: 말표의 en 을 ko 로 바꿔 둔다 — **자가 침묵하면 자가 고장난 것이다.**
   * `말()` 은 부를 때마다 표를 보니, 표를 망가뜨리면 다시 그린 화면에 한국어가 돌아온다.
   */
  if (심을까) await page.evaluate(() => {
    const w = window as unknown as { 말표?: Record<string, { ko?: string; en?: string }> };
    for (const v of Object.values(w.말표 ?? {})) if (v.ko) v.en = v.ko;
  });

  /** 보이는 글에서 한글만 센다. 사람 이름은 어차피 영어로 적혀 있다. */
  const 재기한글 = (자리: string) => page.evaluate(() => {
    const 글 = (document.body.innerText ?? "");
    const 한 = 글.match(/[가-힣]+/g) ?? [];
    /* 같은 말이 여러 번 나와도 한 번으로 센다 — 어디를 고쳐야 하는지가 알고 싶은 것이다 */
    const 모음 = Array.from(new Set(한));
    return { 글자: 한.join("").length, 토막: 모음.length, 보기: 모음.slice(0, 12) };
  }).then((r) => ({ 자리, ...r }));

  const 눌러보기 = async (고르개: string) => {
    const 있나 = await page.$(고르개);
    if (!있나) return false;
    await page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), 고르개);
    await new Promise((r) => setTimeout(r, 700));
    return true;
  };
  const 덮개닫기 = async () => {
    await page.evaluate(() => document.querySelectorAll(".덮개, .쪽창, .overlay").forEach((e) => e.remove()));
    await new Promise((r) => setTimeout(r, 200));
  };

  const 잰것: Array<{ 자리: string; 글자: number; 토막: number; 보기: string[] }> = [];

  /* ── 탭 다섯 ── */
  const 탭들: Array<[string, string]> = [["길드", "hall"], ["캐릭터", "crew"], ["전투", "run"], ["대장간", "forge"], ["시장", "shop"]];
  for (const [이름, 키] of 탭들) {
    await 눌러보기(`[data-t="${키}"]`);
    잰것.push(await 재기한글(이름));
  }

  /* ── 창 셋 ── */
  if (await 눌러보기("#가방단추")) { 잰것.push(await 재기한글("가방")); await 덮개닫기(); }
  await 눌러보기(`[data-t="run"]`);
  if (await 눌러보기("#자격버튼")) { 잰것.push(await 재기한글("자격")); await 덮개닫기(); }
  if (await 눌러보기("#탑버튼")) { 잰것.push(await 재기한글("탑")); }

  /**
   * ── 기술 풀이 — 설명글 29개가 영어로 바뀌었나 ──
   *
   * 첫 판에 `[data-풀이]` 를 바로 눌렀는데 **아무것도 안 열렸다.** 그 딱지는 캐릭터 탭의
   * **「기술」 곁탭**을 먼저 눌러야 그려진다. 안 열린 화면은 한국어 0 으로 세지니
   * **자가 29개를 안 보고 통과**시키고 있었다 — 그래서 곁탭을 눌러 열고, 열렸는지 **확인한다.**
   */
  await 눌러보기(`[data-t="crew"]`);
  /* 캐릭터 탭은 **목록**이다 — 한 사람을 눌러 상세로 들어가야 곁탭이 그려진다 */
  await 눌러보기(`[data-카드]`);
  await 눌러보기(`[data-대원탭="기술"]`);
  const 딱지수 = await page.$$eval("[data-풀이]", (들) => 들.length).catch(() => 0);
  재기("기술·특성 딱지가 그려졌다", 딱지수 > 0, { 딱지수 });
  if (딱지수 > 0 && await 눌러보기(`[data-풀이]`)) {
    const 글있나 = await page.evaluate(() => (document.body.innerText ?? "").length);
    잰것.push(await 재기한글("기술 풀이"));
    재기("기술 풀이 창에 글이 떴다", 글있나 > 0, { 글자수: 글있나 });
    await 덮개닫기();
  }

  console.log("");
  console.log("  자리           한글 글자  토막");
  for (const x of 잰것) {
    console.log("  " + x.자리.padEnd(14) + String(x.글자).padStart(7) + String(x.토막).padStart(7)
      + (x.보기.length ? "   " + x.보기.join(" ") : ""));
  }
  console.log("");

  for (const x of 잰것) {
    const 한도 = 문턱[x.자리];
    if (한도 === undefined) { console.log("     (" + x.자리 + " 는 문턱이 없다 — 재기만 한다)"); continue; }
    재기(`${x.자리} 화면에 한국어가 ${한도}자 이하`, x.글자 <= 한도, { 잰값: x.글자, 문턱: 한도, 보기: x.보기 });
  }

  const 합 = 잰것.reduce((a, x) => a + x.글자, 0);
  console.log(`\n     영어로 연 화면 ${잰것.length}곳 · 남은 한국어 합 ${합}자`);
  if (심을까) console.log("     (심은 고장을 켰다 — 위가 **전부 실패**여야 자가 산 것이다)");
} finally { await 창.close(); }
process.exit(나쁨 ? 1 : 0);
