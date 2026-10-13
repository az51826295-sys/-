/**
 * **첫 화면이 3.1초라는데, 사람이 느끼는 것도 3.1초인가** (10-13). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/work/probe/ash_로딩_쪼개기.mts
 *
 * `ash_첫십분` 이 "3.1초 · 실패" 를 냈다(문턱 3초). 그 자가 재는 것은 `networkidle2` —
 * **그림이 다 내려올 때까지**다. 사람이 느끼는 것은 그게 아니라 **읽을 것이 뜨는 때**다.
 * 어느 쪽이 3.1초인지 모르고 고치면 **자를 속이는 쪽으로** 고치게 된다.
 *
 * 그래서 고치기 전에 **쪼개서 잰다.** 판정하지 않는다 — 숫자만 낸다.
 *
 * 첫 판에서 **내가 또 틀렸다**: ① `window.그림` 은 밖에서 안 보인다(모듈 안이다) —
 * 그래서 그림은 **망으로 센다**. ② 한 판에서 `goto` 를 세 번 불러 "41.99초" 라는
 * 쓰레기를 냈다 — **navigation 은 한 번**이어야 한다.
 */
import { openHeadless } from "../../../src/lib/video/headless";

const 주소 = process.env.ASH_URL ?? "http://127.0.0.1:8124/ash/index.html";
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  /* 저장을 비우려면 한 번 열어야 한다 — 재기는 **그 다음 판** 에서만 한다 */
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } });

  /* **그림은 망으로 센다** — 페이지 안을 들여다볼 필요가 없다 */
  let 그림수 = 0, 마지막그림 = 0, 바이트 = 0;
  let 뜬때 = Date.now();
  page.on("response", (r) => {
    const u = r.url();
    if (!/\/art\/.+\.png$/.test(u)) return;
    그림수++; 마지막그림 = Date.now() - 뜬때;
    const n = Number(r.headers()["content-length"] ?? 0);
    if (Number.isFinite(n)) 바이트 += n;
  });

  뜬때 = Date.now();
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const dom = Date.now() - 뜬때;
  await page.waitForFunction(() => (document.body.innerText ?? "").length >= 40, { timeout: 60_000, polling: 50 });
  const 글 = Date.now() - 뜬때;
  /* 같은 판에서 망이 잠잠해질 때까지 **기다리기만** 한다(다시 열지 않는다) */
  let 잠잠 = Date.now();
  while (Date.now() - 잠잠 < 1500 && Date.now() - 뜬때 < 60_000) {
    const 전 = 그림수;
    await new Promise((r) => setTimeout(r, 200));
    if (그림수 !== 전) 잠잠 = Date.now();
  }
  const 전부 = 마지막그림;

  const 초 = (ms: number) => `${(ms / 1000).toFixed(2)}초`;
  console.log(`  뼈대(domcontentloaded)     ${초(dom)}`);
  console.log(`  **읽을 글이 뜬 때**         ${초(글)}   ← 사람이 느끼는 것`);
  console.log(`  그림 ${String(그림수).padStart(3)}장 마지막이 온 때  ${초(전부)}   ← ash_첫십분 이 재던 것`);
  console.log(`  그림 무게 합              ${(바이트 / 1048576).toFixed(2)}MB`);
} finally { await 창.browser.close(); await 창.close?.(); }
