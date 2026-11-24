// 위 줄 고침(43158f7)이 떴나 — 결제 버튼 폭이 400px 아래가 될 때까지 기다렸다 데스크톱·폰 사진. 돈 0.
import puppeteer from "puppeteer-core";
const OUT = "C:/Users/az518/Desktop/두근도트-스레드/realdot";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: process.env.TEMP + "/rp-shot3" });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 820 });
let w = 9999;
for (let i = 0; i < 40 && w >= 400; i++) {
  await p.goto("https://dugeundot.com/pixel?from=selftest", { waitUntil: "networkidle0" });
  w = await p.$eval(".px-top .go", (e) => e.getBoundingClientRect().width).catch(() => 9999);
  if (w >= 400) await new Promise((r) => setTimeout(r, 20000));
}
console.log("버튼 폭", Math.round(w));
await p.screenshot({ path: `${OUT}/studio-1-create.png` });
await p.setViewport({ width: 400, height: 900 });
await new Promise((r) => setTimeout(r, 400));
await p.screenshot({ path: `${OUT}/studio-4-phone-create.png` });
await b.close();
