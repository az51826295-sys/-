// 새 브라우저(폰 390×844)로 대화방에 처음 들어가 뜬 창을 센다. 출석 판(.ci-back)이 0 이 될 때까지 30초마다(최대 12분).
import puppeteer from "puppeteer-core";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const out = process.argv[2] ?? ".";
for (let i = 0; i < 24; i++) {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.setCookie({ name: "dot_from", value: "selftest", url: BASE });
  await p.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 180000 });
  await p.waitForNavigation({ waitUntil: "networkidle2", timeout: 8000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  const n = await p.evaluate(() => ({ 출석판: document.querySelectorAll(".ci-back").length, 도움말: document.querySelectorAll(".kk-guide").length, 하트카드: document.querySelectorAll(".kk-limit, [class*=limit]").length }));
  console.log(new Date().toTimeString().slice(0, 5), JSON.stringify(n));
  if (n.출석판 === 0) { await p.screenshot({ path: `${out}/room-first-390.png` }); await b.close(); break; }
  await b.close();
  await new Promise((r) => setTimeout(r, 30000));
}
