/** 하트 판을 열어 **무엇이 들어 있나** 그대로 찍는다 — 광고 줄이 왜 없는지 보려고. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import puppeteer from "puppeteer-core";
const BASE = process.env.DOT_BASE ?? "http://127.0.0.1:3010";
const LINK = process.argv[2];
const b = await puppeteer.launch({
  executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, userDataDir: `${process.env.TEMP}/rk-adrow-${process.pid}`, args: ["--no-first-run", "--lang=ko-KR"],
});
try {
  const p = await b.newPage();
  /* 하트 판이 안 열린다 = 보통 **화면 쪽 코드가 죽은 것**이다. 추측 말고 콘솔을 읽는다. */
  p.on("console", (m) => { if (m.type() === "error") console.log("  [콘솔]", m.text().slice(0, 200)); });
  p.on("pageerror", (e) => console.log("  [터짐]", String(e).slice(0, 300)));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const u = new URL(LINK); u.protocol = new URL(BASE).protocol; u.host = new URL(BASE).host;
  await p.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await p.goto(`${BASE}/dot/chats`, { waitUntil: "networkidle2", timeout: 120_000 });
  await new Promise((r) => setTimeout(r, 9000));   // dev 는 첫 방문에 화면 코드를 그 자리에서 컴파일한다
  await p.evaluate(() => { for (const el of document.querySelectorAll("nextjs-portal")) el.remove(); });
  /* 첫 방문 안내가 화면을 덮는다 — 치우지 않으면 **눌러도 안 눌린다**(11-10 에 또 걸렸다). */
  for (const btn of await p.$$("button")) {
    const t = await p.evaluate((e) => e.textContent ?? "", btn);
    // 11-10: 덮는 것이 둘이다 — 첫 방문 안내("알겠어요")와 **출석 팝업("나중에")**.
    // 출석 팝업을 몰라서 "판이 안 열린다" 를 네 번 봤다. 덮개는 **사진을 찍어 보면** 바로 보인다.
    if (t.includes("알겠어요") || t.includes("닫기") || t.trim() === "나중에") { await btn.click(); }
  }
  await new Promise((r) => setTimeout(r, 500));
  const 뱃지 = await p.$(".hb");
  console.log("하트 단추:", 뱃지 ? "있다" : "없다");
  console.log(".hb 개수:", await p.$$eval(".hb", (e) => e.length));
  if (뱃지) {
    /* 화면 좌표로 누르면 덮개에 막힌다 — **요소에 직접** 누른다(React 핸들러는 그래도 돈다). */
    await p.evaluate(() => (document.querySelector(".hb") as HTMLButtonElement | null)?.click());
    await new Promise((r) => setTimeout(r, 2000));
    console.log("'지금 하트' 글이 보이나:", await p.evaluate(() => document.body.innerText.includes("지금 하트")));
    console.log("hb-back:", await p.$$eval(".hb-back", (e) => e.length), "· hb-sheet:", await p.$$eval(".hb-sheet", (e) => e.length));
    const 판 = await p.$eval(".hb-sheet", (e) => e.innerHTML).catch(() => "(판이 안 열렸다)");
    console.log("판 안:", 판.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300));
    console.log("button.hb-row 개수:", await p.$$eval("button.hb-row", (e) => e.length));
    await p.screenshot({ path: "engine/work/하트판.png" });
  }
} finally { await b.close(); }
