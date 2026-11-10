import puppeteer from "puppeteer-core";
const BASE = process.env.DOT_BASE ?? "https://dot-web-production-7e03.up.railway.app";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: `${process.env.TEMP}/rk-st-${process.pid}`, args: ["--no-first-run", "--lang=ko-KR"] });
const p = await b.newPage();
let 길 = "(시작 전)";
p.on("pageerror", (e) => console.log(`[터짐 @${길}]`, (e.stack ?? String(e)).slice(0, 600)));
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
for (const 곳 of ["/dot", "/dot/chats", "/dot/feed"]) {
  길 = 곳;
  await p.goto(BASE + 곳, { waitUntil: "networkidle2", timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4000));
  console.log(곳, "글자", (await p.evaluate(() => document.body.innerText.trim().length)));
}
await b.close();
