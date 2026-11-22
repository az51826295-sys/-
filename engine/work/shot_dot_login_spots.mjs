// 손님(새 브라우저)으로 로그인 문이 있는 자리들을 폰 크기로 찍는다: 내 창 · 설정 · 로그인 화면.
import puppeteer from "puppeteer-core";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const out = process.argv[2] ?? ".";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.setCookie({ name: "dot_from", value: "selftest", url: BASE });
await p.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 180000 });
await new Promise((r) => setTimeout(r, 4000));
for (const [path, name] of [["/dot/me", "spot-me"], ["/dot/settings", "spot-settings"], ["/dot/login", "spot-login"]]) {
  await p.goto(BASE + path, { waitUntil: "networkidle2", timeout: 180000 });
  await new Promise((r) => setTimeout(r, 2500));
  if (await p.$(".ci-later")) { await p.click(".ci-later"); await new Promise((r) => setTimeout(r, 800)); }
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(name, "login link:", await p.evaluate(() => !!document.querySelector('a[href="/dot/login"]')), "google btn:", await p.evaluate(() => !!document.querySelector(".lg-google")));
}
await b.close();
