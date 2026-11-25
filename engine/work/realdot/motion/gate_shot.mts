// 11-25 선결제·계정 연결: 손님이 /pixel 의 AI 도구를 열면 "구글 연결" 상자가 보이고, 도트 변환은 그대로 열리는가. 돈 0 · 구글 단추는 안 누른다.
import puppeteer from "puppeteer-core";
const OUT = "C:/Users/az518/Desktop/두근도트-스레드/realdot";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: process.env.TEMP + "/rp-gate" });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 820 });
await p.goto("https://dugeundot.com/pixel?from=selftest", { waitUntil: "networkidle0" });
await p.waitForSelector(".px-tools");
await new Promise((r) => setTimeout(r, 1500));
const click = async (sel: string, label: string) => {
  for (const x of await p.$$(sel)) if ((await x.evaluate((e) => e.textContent ?? "")).includes(label)) { await x.click(); return; }
  throw new Error(`없음: ${label}`);
};
const look = async (name: string) => ({
  connect: !!(await p.$(".px-opts .connect")),
  google: !!(await p.$(".px-opts .lg-google")),
  goBtns: await p.$$eval(".px-opts .go", (xs) => xs.map((x) => x.textContent)),
  name,
});
await click(".px-tools button", "만들기");
console.log(JSON.stringify(await look("만들기")));
await p.screenshot({ path: `${OUT}/gate-1-create.png` });
await click(".px-tools button", "동작");
console.log(JSON.stringify(await look("동작")));
await click(".px-tools button", "도트 변환");
console.log(JSON.stringify(await look("도트 변환(참조 없음)")));
await p.setViewport({ width: 400, height: 1000 });
await click(".px-tools button", "만들기");
await new Promise((r) => setTimeout(r, 500));
await p.screenshot({ path: `${OUT}/gate-2-phone.png`, fullPage: true });
await b.close();
