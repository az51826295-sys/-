// 두근도트를 PC 화면(1440×900)으로 찍는다. 새 브라우저(쿠키 0).
// BASE=… PAGES=/dot,/dot/yuna node engine/work/shot_dot_desktop.mjs <출력폴더>
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? ".";
const BASE = process.env.BASE ?? "https://dot-web-production-7e03.up.railway.app";
const PAGES = (process.env.PAGES ?? "/dot").split(",");
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 900);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
for (const path of PAGES) {
  const p = await b.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  // 방에 들어가면 손님 계정이 생긴다 — 시험 계정은 selftest 꼬리표로 남겨 세는 도구에서 빠지게 한다.
  await p.setCookie({ name: "dot_from", value: "selftest", url: BASE });
  await p.goto(BASE + path, { waitUntil: "networkidle2", timeout: 180000 });
  await p.waitForNavigation({ waitUntil: "networkidle2", timeout: 8000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const name = `desk${path.replace(/[^a-z0-9]+/gi, "-")}-${W}.png`;
  await p.screenshot({ path: `${out}/${name}` });
  console.log(name, p.url(), "scrollWidth", await p.evaluate(() => document.documentElement.scrollWidth));
  await p.close();
}
await b.close();
