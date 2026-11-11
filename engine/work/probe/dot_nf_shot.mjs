import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: `${process.env.TEMP}/rk-s-${process.pid}`, args: ["--no-first-run", "--lang=ko-KR"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 600, deviceScaleFactor: 2 });
await p.goto("https://dot-web-production-7e03.up.railway.app/dot/no-such-character", { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));
await p.screenshot({ path: process.argv[2] });
await b.close();
