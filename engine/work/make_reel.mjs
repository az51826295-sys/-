// 인스타 릴스용 화면 녹화 — 진짜 운영 화면을 손님으로 한 바퀴 돈다(새 그림·새 글 없음).
// 피드 → 유나 → 출석 하트 받기 → 말 두 번 → 답(표정 바뀜). 9:16, 녹화는 dot_from=selftest 라 집계에 안 잡힌다.
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const OUT = process.argv[2] ?? "reel-raw.webm";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 693, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.setCookie({ name: "dot_from", value: "selftest", url: BASE });
// 손님 계정을 먼저 만들어 둔다(녹화 안 함) — 첫 방문의 빈 화면·넘어감을 영상에 안 넣으려고.
// 하트도 녹화 전에 받아 둔다 — 출석 창은 손님이 만들어진 뒤 새로고침이 한 번 있어야 뜬다.
await p.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 90000 });
let got = false;
for (let i = 0; i < 6 && !got; i++) {
  await sleep(3000);
  const go0 = (await p.$(".ci-go")) ?? (await p.$(".kk-limit-btn"));
  if (go0) { await go0.click(); await sleep(2500); got = true; break; }
  await p.reload({ waitUntil: "networkidle2", timeout: 90000 });
}
const ph = await p.$eval(".kk-input", (e) => e.getAttribute("placeholder") ?? "").catch(() => "?");
console.log("checkin", got, "placeholder:", ph);
await p.goto(BASE + "/dot/feed", { waitUntil: "networkidle2", timeout: 90000 });
await sleep(1500);

const rec = await p.screencast({ path: OUT, ffmpegPath, fps: 30 });
await sleep(2500); // 피드 첫 화면
await p.evaluate(() => window.scrollBy({ top: 260, behavior: "smooth" }));
await sleep(1500);
await p.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await sleep(1000);
// 로그인된 손님 피드에는 소개 동그라미가 없다 — 방으로 바로 넘어간다(장면 전환).
await p.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 60000 });
await sleep(2000);
const go = await p.$(".ci-go");
if (go) { await go.click(); await sleep(2200); }
const later = await p.$(".ci-later");
if (later) { await later.click(); await sleep(800); }

async function say(text) {
  await p.click(".kk-input");
  await p.type(".kk-input", text, { delay: 70 });
  await sleep(400);
  await p.keyboard.press("Enter");
  // 답이 다 흐를 때까지(커서가 사라지고 입력이 다시 열릴 때까지) 기다린다
  await sleep(1500);
  for (let i = 0; i < 60; i++) {
    const busy = await p.evaluate(() => !!document.querySelector(".kk-cursor"));
    if (!busy) break;
    await sleep(500);
  }
  await sleep(2500);
  // 첫 답 뒤에 뜨는 "How this room works" 안내를 닫는다(안 닫으면 입력이 가려진다)
  const gotIt = await p.evaluateHandle(() => [...document.querySelectorAll("button")].find((x) => /^(Got it|알겠어요)$/.test(x.innerText.trim())) ?? null);
  if (gotIt && (await gotIt.evaluate((x) => !!x))) { await sleep(1200); await gotIt.click(); await sleep(900); }
}
await say("hey! what are you up to?");
await say("haha you're cute. can we be friends?");
await sleep(1500);
await rec.stop();
const lines = await p.$$eval(".kk-said", (els) => els.slice(-4).map((e) => e.innerText.replace(/\n/g, " / ").slice(0, 160)));
console.log(JSON.stringify(lines, null, 1));
await b.close();
