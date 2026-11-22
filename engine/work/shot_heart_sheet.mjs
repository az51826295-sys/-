// 하트 시트에 "Get hearts" 줄이 보이는지 — 손님으로 방에 한 번 들어갔다가 피드에서 하트를 눌러 찍는다.
import puppeteer from "puppeteer-core";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));
await p.goto(BASE + "/dot/feed", { waitUntil: "networkidle2", timeout: 90000 });
await new Promise((r) => setTimeout(r, 2000));
const later = await p.$(".ci-later");
if (later) { await later.click(); await new Promise((r) => setTimeout(r, 800)); }
const hb = await p.$(".hb");
console.log("badge", !!hb);
if (hb) { await hb.click(); await new Promise((r) => setTimeout(r, 1000)); }
const rows = await p.$$eval(".hb-row, .hb-note", (els) => els.map((e) => e.innerText.replace(/\n/g, " | ")));
console.log(JSON.stringify(rows));
await p.screenshot({ path: "heart-sheet.png" });
const buy = await p.$('a.hb-row[href="/dot/pay"]');
if (buy) {
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }), buy.click()]);
  console.log("pay url", p.url());
  await p.screenshot({ path: "heart-pay.png" });
}
await b.close();
