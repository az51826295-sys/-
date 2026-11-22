// 새 브라우저: 손님 계정을 만든 뒤 /api/dot/pay/polar 에 직접 POST — 서버 답(오류 문구·note)을 본다. 돈은 안 낸다.
import puppeteer from "puppeteer-core";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setCookie({ name: "dot_from", value: "selftest", url: BASE });
await p.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 180000 });
await new Promise((r) => setTimeout(r, 4000));
await p.goto(BASE + "/dot/pay", { waitUntil: "networkidle2", timeout: 180000 });
const r = await p.evaluate(async () => {
  const res = await fetch("/api/dot/pay/polar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pack: "hearts_10" }) });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, error: j.error, note: j.note, urlHost: j.url ? new URL(j.url).host : null };
});
console.log(JSON.stringify(r));
await b.close();
