// 새 브라우저(폰): 방에 들어가 손님 계정 → /dot/pay → 하트 10개 누름 → Polar 결제창이 열리나(돈은 안 냄). 30초마다 최대 12분.
import puppeteer from "puppeteer-core";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const out = process.argv[2] ?? ".";
for (let i = 0; i < 24; i++) {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.setCookie({ name: "dot_from", value: "selftest", url: BASE });
  await p.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 180000 });
  await new Promise((r) => setTimeout(r, 4000));
  await p.goto(BASE + "/dot/pay", { waitUntil: "networkidle2", timeout: 180000 });
  const soon = await p.evaluate(() => !!document.querySelector(".py-soon"));
  let res = "soon-banner";
  if (!soon) {
    await new Promise((r) => setTimeout(r, 3000)); // 단추가 살아날(hydration) 때까지
    const [btn] = await p.$$(".py-pack");
    await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}), btn.click()]);
    await new Promise((r) => setTimeout(r, 4000));
    const host = new URL(p.url()).host;
    const text = await p.evaluate(() => document.body.innerText.slice(0, 600).replace(/\s+/g, " "));
    res = `${host} | ${/₩|KRW|원/.test(text) ? "won shown" : "no won"} | ${text.slice(0, 200)}`;
    if (host.includes("polar")) {
      await p.screenshot({ path: `${out}/polar-checkout.png` });
      console.log(new Date().toTimeString().slice(0, 5), res);
      await b.close();
      break;
    }
    const toast = await p.evaluate(() => document.querySelector(".py-toast")?.textContent ?? "");
    res += " | toast " + toast;
  }
  console.log(new Date().toTimeString().slice(0, 5), res);
  await b.close();
  await new Promise((r) => setTimeout(r, 30000));
}
