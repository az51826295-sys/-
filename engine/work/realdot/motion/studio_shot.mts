// 작업실 화면을 실제 사이트에서 눌러 본다(무료 길만: 도트 변환 미리보기 · 시트 자르기 미리보기). 돈 0.
import puppeteer from "puppeteer-core";
const OUT = "C:/Users/az518/Desktop/두근도트-스레드/realdot";
const SHEET = "C:/Users/az518/Desktop/두근도트-시트/taeo-strip.png";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: process.env.TEMP + "/rp-shot2" });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 820 });
for (let i = 0; i < 40; i++) {
  await p.goto("https://dugeundot.com/pixel?from=selftest", { waitUntil: "networkidle0" });
  if (await p.$(".px-tools")) break;
  await new Promise((r) => setTimeout(r, 20000));
}
if (!(await p.$(".px-tools"))) { console.log("새 화면이 아직 안 떴다"); process.exit(1); }
await p.screenshot({ path: `${OUT}/studio-1-create.png` });
const click = async (sel: string, label: string) => {
  for (const x of await p.$$(sel)) if ((await x.evaluate((e) => e.textContent ?? "")).includes(label)) { await x.click(); return; }
  throw new Error(`없음: ${label}`);
};
await click(".px-tools button", "도트 변환");
const up = await p.$(".px-opts input[type=file]");
await up!.uploadFile(SHEET);
await p.waitForSelector(".px-canvas img", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));
await p.screenshot({ path: `${OUT}/studio-2-convert.png` });
console.log("변환:", await p.$eval(".px-canvas figcaption", (e) => e.textContent));
await click(".px-tools button", "시트 자르기");
await click(".px-opts button", "미리보기");
await p.waitForFunction(() => document.querySelector(".px-canvas figcaption")?.textContent?.includes("프레임"), { timeout: 60000 });
console.log("자르기:", await p.$eval(".px-canvas figcaption", (e) => e.textContent));
await p.setViewport({ width: 400, height: 1100 });
await new Promise((r) => setTimeout(r, 500));
await p.screenshot({ path: `${OUT}/studio-3-phone-split.png`, fullPage: true });
const err = await p.$(".px-opts .err");
console.log("오류칸:", err ? await err.evaluate((e) => e.textContent) : "없음");
await b.close();
