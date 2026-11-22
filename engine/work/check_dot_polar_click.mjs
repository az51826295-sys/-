// 하트 묶음을 누르고 1초 간격으로 무슨 일이 일어나는지 적는다(요청·토스트·주소). 돈은 안 낸다.
import puppeteer from "puppeteer-core";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
p.on("console", (m) => console.log("console", m.type(), m.text().slice(0, 200)));
p.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 200)));
p.on("response", (r) => { if (r.url().includes("/api/dot/")) console.log("resp", r.status(), r.url().replace(BASE, "")); });
await p.setCookie({ name: "dot_from", value: "selftest", url: BASE });
await p.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 180000 });
await new Promise((r) => setTimeout(r, 4000));
await p.goto(BASE + "/dot/pay", { waitUntil: "networkidle2", timeout: 180000 });
await new Promise((r) => setTimeout(r, 3000));
console.log("packs", (await p.$$(".py-pack")).length, "soon", await p.evaluate(() => !!document.querySelector(".py-soon")));
if (await p.$(".ci-later")) { await p.click(".ci-later"); await new Promise((r) => setTimeout(r, 800)); console.log("closed check-in popup"); }
await p.click(".py-pack");
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  let info;
  try { info = await p.evaluate(() => ({ url: location.host, toast: document.querySelector(".py-toast")?.textContent ?? "" })); } catch (e) { info = { nav: String(e).slice(0, 80) }; }
  console.log(i, JSON.stringify(info), p.url().slice(0, 60));
  if (!p.url().includes("railway")) { await new Promise((r) => setTimeout(r, 3000)); await p.screenshot({ path: process.argv[2] + "/polar-checkout.png" }); console.log("text", (await p.evaluate(() => document.body.innerText)).replace(/s+/g, " ").slice(0, 300)); break; }
}
await b.close();
