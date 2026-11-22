// 새 브라우저(폰)로 대화방 입력칸 안내문이 바뀔 때까지 30초마다(최대 12분), 바뀌면 사진.
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
  const ph = await p.evaluate(() => document.querySelector(".kk-input")?.getAttribute("placeholder"));
  const ci = await p.evaluate(() => document.querySelectorAll(".ci-back, .kk-guide").length);
  console.log(new Date().toTimeString().slice(0, 5), ph, "popups", ci);
  if (ph?.includes("받으면")) { await p.screenshot({ path: `${out}/room-first-390b.png` }); await b.close(); break; }
  await b.close();
  await new Promise((r) => setTimeout(r, 30000));
}
