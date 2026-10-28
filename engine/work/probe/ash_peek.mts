/** 잿빛 첫 화면에 무엇이 떠 있나 — 짐작 대신 본다. */
import { openHeadless } from "../../../src/lib/video/headless";

const 주소 = process.env.ASH_URL!;
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2500));
  const 본 = await page.evaluate(() => {
    const out: string[] = [];
    for (const id of ["app", "battle", "board", "cv", "맵", "고르기", "log"]) {
      const e = document.getElementById(id);
      if (!e) { out.push(`${id}: 없음`); continue; }
      const r = e.getBoundingClientRect();
      const st = getComputedStyle(e);
      out.push(`${id}: ${Math.round(r.width)}x${Math.round(r.height)} display=${st.display} class="${e.className}"`);
    }
    const 단추 = [...document.querySelectorAll("button")].filter((b) => (b as HTMLElement).offsetParent)
      .map((b) => (b.textContent || "").trim().slice(0, 14)).filter(Boolean);
    out.push("보이는 단추: " + 단추.slice(0, 12).join(" | "));
    const w = window as any;
    out.push("S.층=" + w.S?.층 + " 진행=" + w.S?.진행 + " 대원=" + (w.S?.대원?.length ?? "?"));
    return out.join("\n");
  });
  console.log(본);
} finally { await 창.browser.close().catch(() => {}); }
