// 사이트에 무엇이 떠 있나 — 화면 글자로(HTML 이 아니라). 돈 0.
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: process.env.TEMP + "/rp-live" });
const p = await b.newPage();
await p.goto("https://dugeundot.com/pixel?from=selftest", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));
console.log((await p.$eval(".px-opts", (e) => (e as HTMLElement).innerText)).replace(/\s+/g, " ").slice(0, 300));
await p.goto("https://dugeundot.com/dot/login?error=A%20user%20with%20this%20email%20address%20has%20already%20been%20registered", { waitUntil: "networkidle0" });
console.log("login:", (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 200));
await b.close();
