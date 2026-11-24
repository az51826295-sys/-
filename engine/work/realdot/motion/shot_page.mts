import puppeteer from "puppeteer-core";
const EDGE = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const b = await puppeteer.launch({ executablePath: EDGE, headless: true, userDataDir: process.env.TEMP + "/rp-shot" }); const p = await b.newPage();
await p.setViewport({ width: 420, height: 980 });
await p.goto("https://dugeundot.com/pixel?from=selftest", { waitUntil: "networkidle0" });
await p.screenshot({ path: "C:/Users/az518/Desktop/두근도트-스레드/realdot/pixel-page-create.png" });
console.log(await p.$eval(".rp-create", (e) => (e as HTMLElement).innerText)); await b.close();
