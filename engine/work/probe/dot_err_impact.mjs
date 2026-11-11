/* #310 이 사람에게 무엇을 망가뜨리나 — 터지는 횟수와 화면이 멀쩡한지 같이 센다 */
import puppeteer from "puppeteer-core";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: `${process.env.TEMP}/rk-im-${process.pid}`, args: ["--no-first-run", "--lang=ko-KR"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
let 터짐 = [];
p.on("pageerror", (e) => 터짐.push(String(e).slice(0, 80)));
const 재기 = async (곳) => {
  터짐 = [];
  await p.goto(BASE + 곳, { waitUntil: "networkidle2", timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4500));
  const n = await p.evaluate(() => ({
    글자: document.body.innerText.trim().length,
    그림: document.querySelectorAll("img").length,
    깨진그림: [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).length,
    단추: document.querySelectorAll("a,button").length,
    빈화면: document.body.innerText.trim().length < 100,
  }));
  console.log(`${곳.padEnd(12)} 터짐 ${터짐.length}회 | 글자 ${String(n.글자).padStart(5)} | 그림 ${n.그림}(깨짐 ${n.깨진그림}) | 누를것 ${n.단추}${n.빈화면 ? "  ← 빈 화면!" : ""}`);
  if (터짐.length) console.log(`             ${[...new Set(터짐)].join(" / ")}`);
  return n;
};
for (const 곳 of ["/dot", "/dot", "/dot/feed", "/dot/chats", "/dot/privacy"]) await 재기(곳);
/* 눌러서 돌아다닐 수 있나 — 에러가 길을 막는지 */
터짐 = [];
await p.goto(BASE + "/dot", { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
const 간곳 = await p.evaluate(() => { const a = [...document.querySelectorAll('a[href^="/dot/"]')].find((x) => /\/dot\/[a-z-]+$/.test(x.getAttribute("href"))); if (a) { a.click(); return a.getAttribute("href"); } return null; });
await new Promise((r) => setTimeout(r, 4000));
console.log(`\n눌러서 이동: ${간곳 ?? "누를 링크 없음"} → 지금 ${new URL(p.url()).pathname} · 글자 ${(await p.evaluate(() => document.body.innerText.trim().length))} · 터짐 ${터짐.length}회`);
await p.screenshot({ path: process.argv[2] });
await b.close();
