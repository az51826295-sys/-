/**
 * **꾹 눌러도 그림 메뉴가 안 뜨나** (10-17 사장님 사진). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_꾹누르기.mts [--sabotage]
 *
 * 폰에서 전투 화면을 꾹 누르니 안드로이드 **그림 메뉴**가 떴다
 * ("이미지 공유 · 다운로드 · 복사 · 보기"). 게임 글 위를 덮어 다음 턴이 안 보인다.
 *
 * `user-select:none` 은 **글자 선택**만 막는다 — 그림 메뉴는 못 막는다. 그래서 둘을 잰다:
 *   ① contextmenu 가 막히는가(이게 긴 누름 메뉴의 진짜 문)
 *   ② -webkit-touch-callout 이 none 인가(사파리·WebView 쪽)
 * 자가 **게임 안 여러 자리**에서 재는 것이 중요하다 — 한 군데만 막혀도 다른 데서 뜬다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";

const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  if (process.argv.includes("--sabotage")) {
    /* 심은 고장: 막는 줄을 걷어낸다 — 자가 침묵하면 자에 이빨이 없는 것이다 */
    await page.evaluate(() => {
      const 새 = document.cloneNode(true);
      void 새;
      // 손잡이를 떼지 못하니 **덮어쓴다** — 막은 것을 도로 흘려보낸다
      document.addEventListener("contextmenu", (e) => { e.stopImmediatePropagation(); }, true);
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) el.style.setProperty("-webkit-touch-callout", "default");
    });
  }

  const 본 = await page.evaluate(() => {
    /* 10-17: 첫 판이 touch-callout 을 **실패 4건**으로 냈는데, 데스크톱 크롬엔 그 속성이
       아예 없어서 빈 글자가 온 것이었다. **잴 수 없는 것은 실패가 아니다**(09-15 기록) —
       브라우저가 그 속성을 아는지 먼저 묻고, 모르면 그 칸은 "못 잼" 으로 적는다. */
    const 잴수있나 = CSS.supports("-webkit-touch-callout", "none");
    const 자리: Record<string, string> = {
      "전투 화면": "canvas, #판, .판, #무대, .무대",
      "글 칸": "#log, .풀이, .로그",
      "탭 단추": ".tab, nav button, .칸짜리",
      "몸통": "body",
    };
    const 답: { 어디: string; 있나: boolean; 막힘: boolean; callout: string }[] = [];
    for (const [이름, 셀] of Object.entries(자리)) {
      const el = document.querySelector(셀) as HTMLElement | null;
      if (!el) { 답.push({ 어디: 이름, 있나: false, 막힘: false, callout: "" }); continue; }
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      답.push({
        어디: 이름, 있나: true, 막힘: ev.defaultPrevented,
        callout: 잴수있나 ? getComputedStyle(el).getPropertyValue("-webkit-touch-callout").trim() : "못잼",
      });
    }
    return 답;
  });

  let 못잼수 = 0;
  for (const r of 본) {
    if (!r.있나) { console.log(`     ${r.어디} — 그런 자리가 없다(안 잼)`); continue; }
    재기(`${r.어디}: 꾹 눌러도 메뉴가 안 뜬다`, r.막힘, r);
    if (r.callout === "못잼") 못잼수++;
    else 재기(`${r.어디}: touch-callout 이 꺼져 있다`, r.callout === "none", { callout: r.callout });
  }
  if (못잼수) console.log(`     touch-callout ${못잼수}자리 — **못 잼**(이 브라우저엔 그 속성이 없다. 진짜 폰에서만 잴 수 있다)`);
  /* 글자로라도 박혀 있는지는 본다 — 못 재는 칸이라고 안 적어 두면 조용히 사라진다 */
  const 적혀있나 = await page.evaluate(() => [...document.querySelectorAll("style")].some((s) => s.textContent?.includes("-webkit-touch-callout:none")));
  재기("CSS 에 -webkit-touch-callout:none 이 적혀 있다", 적혀있나);
} finally { await 창.browser.close(); await 창.close?.(); }

console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
