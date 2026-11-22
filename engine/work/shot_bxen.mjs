import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto("https://dot-web-production-7e03.up.railway.app/dot", { waitUntil: "networkidle2", timeout: 90000 });
await new Promise(r => setTimeout(r, 2500));
console.log(p.url());
await p.screenshot({ path: "dot-promo-ben.png" });
await b.close();
