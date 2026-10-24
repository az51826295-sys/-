/** 캐릭터 탭에서 「기술」 곁탭이 어떻게 열리나 — 딱지가 0개인 까닭을 찾는다 */
import { openHeadless } from "../../../src/lib/video/headless";

const 주소 = process.env.ASH_URL ?? "http://127.0.0.1:8124/ash/index.html";
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate(() => { try { localStorage.clear(); localStorage.setItem("ash.lang", "en"); } catch { /* */ } });
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1500));

  const 눌러 = async (s: string) => {
    const r = await page.evaluate((x) => { const el = document.querySelector(x) as HTMLElement | null; if (!el) return false; el.click(); return true; }, s);
    await new Promise((r2) => setTimeout(r2, 700));
    return r;
  };

  console.log("crew 탭 눌림:", await 눌러(`[data-t="crew"]`));
  console.log("곁탭들:", await page.$$eval("[data-대원탭]", (들) => 들.map((e) => (e as HTMLElement).dataset.대원탭)));
  console.log("카드칸들:", await page.$$eval("[data-카드], [data-넣], .칸슬롯", (들) => 들.length));
  console.log("칸슬롯 눌림:", await ∈러(".칸슬롯"));
  console.log("곁탭들2:", await page.$eval("[data-대원탭]", (들) => 들.map((e) => (e as HTMLElement).dataset.대원탭)));
  console.log("기술 곁탭 눌림:", await 눌러(`[data-대원탭="기술"]`));
  console.log("곁탭 누른 뒤 딱지:", await page.$$eval("[data-풀이]", (들) => 들.map((e) => (e as HTMLElement).dataset.풀이).slice(0, 8)));
  const 글 = await page.evaluate(() => (document.body.innerText ?? "").replace(/\s*\n\s*/g, " | ").slice(0, 700));
  console.log("\n화면 글:", 글);
} finally { await 창.close(); }
