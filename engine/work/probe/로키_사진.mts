/**
 * 로키 화면 사진 — 사장님이 보시게 (10-25).
 * 미리보기 창은 안 쓴다. 헤드리스로 찍어 파일로 낸다.
 */
import { openHeadless } from "../../../src/lib/video/headless";
import { mkdirSync } from "node:fs";

const 터 = process.env.ROOKERY_URL ?? "https://rookery-web-production.up.railway.app";
const 낼곳 = process.env.OUT ?? "engine/work/probe/shots";
mkdirSync(낼곳, { recursive: true });

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  for (const [이름, 길] of [["1-첫화면", "/"], ["2-로그인", "/login"], ["3-대화", "/ask"]] as Array<[string, string]>) {
    await page.goto(터 + 길, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 2500));
    const 어디 = page.url().replace(터, "") || "/";
    const 글자수 = await page.evaluate("(document.body.innerText||'').length") as number;
    await page.screenshot({ path: `${낼곳}/${이름}.png` });
    console.log(`${이름}  요청 ${길} → 실제 ${어디}  (글 ${글자수}자)`);
  }
} finally { await 창.close(); }
