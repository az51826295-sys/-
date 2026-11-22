// /dot/login 이 뜰 때까지 30초마다(최대 12분). 뜨면: 사진(폰), 손님으로 구글 단추 → 구글 화면까지 가는지(로그인은 안 함),
// 구글로 가는 길에 실린 redirect_to 가 우리 바깥 주소인지(localhost 아님) 본다. /login → /dot/login 도 본다.
import puppeteer from "puppeteer-core";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const out = process.argv[2] ?? ".";
for (let i = 0; i < 24; i++) {
  const r = await fetch(BASE + "/dot/login", { redirect: "manual" });
  const html = r.status === 200 ? await r.text() : "";
  if (html.includes("lg-card")) break;
  console.log(new Date().toTimeString().slice(0, 5), "not yet", r.status);
  await new Promise((res) => setTimeout(res, 30000));
}
const old = await fetch(BASE + "/login?error=test", { redirect: "manual" });
console.log("/login ->", old.status, old.headers.get("location"));

const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.setCookie({ name: "dot_from", value: "selftest", url: BASE });
await p.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 180000 });
await new Promise((r) => setTimeout(r, 4000));
await p.goto(BASE + "/dot/login", { waitUntil: "networkidle2", timeout: 180000 });
await new Promise((r) => setTimeout(r, 2500));
if (await p.$(".ci-later")) { await p.click(".ci-later"); await new Promise((r) => setTimeout(r, 800)); }
await p.screenshot({ path: `${out}/dot-login-390.png` });
console.log("text", (await p.evaluate(() => document.querySelector(".lg-card")?.innerText ?? "")).replace(/\s+/g, " ").slice(0, 200));
const hops = [];
p.on("request", (q) => { if (q.isNavigationRequest()) hops.push(q.url()); });
await p.click(".lg-google");
await new Promise((r) => setTimeout(r, 8000));
const supa = hops.find((u) => u.includes("/auth/v1/authorize")) ?? "";
const rt = supa ? new URL(supa).searchParams.get("redirect_to") : null;
console.log("authorize hop:", !!supa, "| redirect_to:", rt, "| landed:", new URL(p.url()).host);
await b.close();
