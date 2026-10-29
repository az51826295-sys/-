import { openHeadless } from "../../../src/lib/video/headless";
import { 이름헬퍼 } from "../../tools/ash_공통.mjs";
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await 이름헬퍼(page);
  await page.goto(process.env.ASH_URL!, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1500));
  const 본 = await page.evaluate(() => {
    const w = window as any;
    const 결 : string[] = [];
    try { w.자동시작(); 결.push("자동시작 ok"); } catch (e) { 결.push("자동시작 던짐: " + String(e).slice(0, 90)); }
    try { const r = w.자동요약(); 결.push("자동요약 ok " + JSON.stringify(r)); } catch (e) { 결.push("자동요약 던짐: " + String(e).slice(0, 90)); }
    try { w.S.자동오름 = true; w.자동끄기("목표"); 결.push("자동끄기 ok · 켜짐=" + w.S.자동오름); } catch (e) { 결.push("**자동끄기 던짐**: " + String(e).slice(0, 110)); }
    결.push("수() 있나: " + (typeof w.수));
    return 결.join("\n");
  });
  console.log(본);
} finally { await 창.browser.close().catch(() => {}); }
