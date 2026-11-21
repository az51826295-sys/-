// 두근도트를 처음 온 사람 눈으로: 새 브라우저(쿠키 0)로 /dot 를 열고, 첫 화면과 캐릭터 하나 들어간 화면을 찍는다.
// node engine/work/shot_dot_first.mjs <출력폴더>
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? ".";
const BASE = process.env.BASE ?? "https://dot-web-production-7e03.up.railway.app";
const FROM = process.env.FROM ? `?from=${process.env.FROM}` : "";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const t0 = Date.now();
await p.goto(`${BASE}/dot${FROM}`, { waitUntil: "networkidle2", timeout: 180000 });
console.log("첫 화면", Date.now() - t0, "ms", p.url());
// 열리자마자 다른 곳으로 넘어간다 — 넘어간 뒤 조용해질 때까지 기다린다.
await p.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));
console.log("넘어간 곳", Date.now() - t0, "ms", p.url());
await p.screenshot({ path: `${out}/dot-first.png` });
const text = await p.evaluate(() => document.body.innerText.slice(0, 800));
console.log("---글---\n" + text);
const links = await p.evaluate(() => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).filter(Boolean).slice(0, 30));
console.log("---링크---\n" + links.join("\n"));
console.log("---쿠키---\n" + (await p.cookies()).filter((c) => c.name === "dot_from").map((c) => `${c.name}=${c.value}`).join(" ") || "(dot_from 없음)");
await b.close();
