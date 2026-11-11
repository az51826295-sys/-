/* 없는 캐릭터·빈 화면을 손님이 보면 무엇이 뜨나 — Next #97354 의 진짜 증상 자리 */
import puppeteer from "puppeteer-core";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: `${process.env.TEMP}/rk-nf-${process.pid}`, args: ["--no-first-run", "--lang=ko-KR"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
let 터짐 = [];
p.on("pageerror", (e) => 터짐.push(String(e).slice(0, 70)));
for (const 곳 of ["/dot/chats", "/dot/no-such-character", "/dot/settings"]) {
  터짐 = [];
  const r = await p.goto(BASE + 곳, { waitUntil: "networkidle2", timeout: 120000 });
  await new Promise((x) => setTimeout(x, 4000));
  const t = await p.evaluate(() => document.body.innerText.trim());
  console.log(`\n=== ${곳}  (HTTP ${r?.status()}) 제목 "${await p.title()}" 터짐 ${터짐.length}회`);
  console.log(`글자 ${t.length} | 본문: ${JSON.stringify(t.slice(0, 300))}`);
  if (터짐.length) console.log(`터짐: ${[...new Set(터짐)].join(" / ")}`);
  /* 직접 들어온 것 말고 **안에서 눌러 이동**할 때가 문제라고 했다 — 그것도 잰다 */
}
console.log("\n=== 안에서 눌러 이동 (/dot → 없는 캐릭터) ===");
터짐 = [];
await p.goto(BASE + "/dot", { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((x) => setTimeout(x, 3500));
await p.evaluate(() => { history.pushState({}, "", "/dot/no-such-character"); });
await p.evaluate(() => { const a = document.createElement("a"); a.href = "/dot/no-such-character"; a.id = "zz"; document.body.appendChild(a); a.click(); });
await new Promise((x) => setTimeout(x, 5000));
const t2 = await p.evaluate(() => document.body.innerText.trim());
console.log(`지금 ${new URL(p.url()).pathname} · 글자 ${t2.length} · 터짐 ${터짐.length}회`);
console.log(`본문: ${JSON.stringify(t2.slice(0, 300))}`);
await p.screenshot({ path: process.argv[2] });
await b.close();
