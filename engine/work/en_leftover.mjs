// 영어 화면에 한국어가 얼마나 남았나 — 새 브라우저, dot_lang=en(쿠키+localStorage), 폰 크기.
// 화면마다 보이는 글자 중 한글 비율과 한글이 든 줄(앞 12개)을 적는다.
// BASE=… node engine/work/en_leftover.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "https://dot-web-production-7e03.up.railway.app";
const PAGES = (process.env.PAGES ?? "/dot/feed,/dot/yuna,/dot/chats,/dot/search,/dot/me,/dot/settings,/dot/pay,/dot/login,/dot/yuna/profile").split(",");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--lang=en-US"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await p.setCookie({ name: "dot_from", value: "selftest", url: BASE }, { name: "dot_lang", value: "en", url: BASE });
await p.evaluateOnNewDocument(() => { try { localStorage.setItem("dot_lang", "en"); } catch {} });
let total = 0, hangul = 0;
for (const path of PAGES) {
  await p.goto(BASE + path, { waitUntil: "networkidle2", timeout: 180000 });
  await new Promise((r) => setTimeout(r, 3000));
  const text = await p.evaluate(() => document.body.innerText);
  const chars = text.replace(/\s/g, "");
  const h = (chars.match(/[\uac00-\ud7a3]/g) ?? []).length;
  total += chars.length; hangul += h;
  const lines = [...new Set(text.split("\n").map((s) => s.trim()).filter((s) => /[\uac00-\ud7a3]/.test(s)))];
  console.log(`\n## ${path}  한글 ${h}/${chars.length} (${chars.length ? Math.round((100 * h) / chars.length) : 0}%) · 한글 줄 ${lines.length}`);
  for (const l of lines.slice(0, 12)) console.log("   " + l.slice(0, 90));
}
console.log(`\n합계 한글 ${hangul}/${total} = ${Math.round((100 * hangul) / total)}%`);
await b.close();
