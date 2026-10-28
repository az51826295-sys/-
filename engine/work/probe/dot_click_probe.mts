/**
 * **안 눌리는 단추 찾기** (10-28 사장님 "버튼이 안 눌리는데?").
 *   npx tsx engine/work/probe/dot_click_probe.mts [길]
 *
 * 어느 단추인지 되묻기 전에 **직접 눌러 본다.** 화면마다 눌리는 것을 전부 눌러 보고
 * 주소가 바뀌는지·콘솔에 오류가 나는지 적는다. 안 바뀌면 그게 안 눌리는 단추다.
 *
 * 로그인 없이 보이는 화면만 본다 — 로그인이 필요한 자리는 "못 잼" 으로 적는다.
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://dot-web-production-7e03.up.railway.app";
const 길 = process.argv[2] ?? "/dot/search";

const profile = mkdtempSync(join(tmpdir(), "rk-hl-click-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: profile,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const p = await browser.newPage();
  const 오류: string[] = [];
  p.on("console", (m) => { if (m.type() === "error") 오류.push(m.text().slice(0, 140)); });
  p.on("pageerror", (e) => 오류.push("throw: " + String(e).slice(0, 140)));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  /* 눌리는 것 목록. **보이는 것만** — 숨은 것은 사람이 못 누른다. */
  const 것들 = await p.evaluate(() => {
    const out: { i: number; tag: string; 글: string; href: string; 가려짐: boolean }[] = [];
    const els = [...document.querySelectorAll("a, button, [role=button]")];
    els.forEach((e, i) => {
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const st = getComputedStyle(e as Element);
      /* 그 자리에 실제로 있는 것이 이것인가 — 덮여 있으면 눌러도 다른 것이 받는다 */
      const 위 = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 2));
      out.push({
        i, tag: e.tagName.toLowerCase(),
        글: (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 28),
        href: (e as HTMLAnchorElement).href ?? "",
        가려짐: st.pointerEvents === "none" || !(위 && (e.contains(위) || 위.contains(e))),
      });
    });
    return out;
  });

  console.log(`${길} — 눌리는 것 ${것들.length}개`);
  for (const b of 것들) {
    console.log(`  [${String(b.i).padStart(2)}] ${b.tag.padEnd(6)} ${b.가려짐 ? "**가려짐**" : "        "} ${b.글.padEnd(28)} ${b.href.replace(BASE, "")}`);
  }

  /* 실제로 눌러 본다 — 주소가 바뀌나. 새로 그리는 화면이면 글이 바뀌나. */
  console.log("\n── 눌러 본다 ──");
  for (const b of 것들) {
    await p.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    const 전글 = (await p.evaluate(() => document.body.innerText)).length;
    const 전주소 = p.url();
    const 눌림 = await p.evaluate((i) => {
      const e = [...document.querySelectorAll("a, button, [role=button]")][i] as HTMLElement | undefined;
      if (!e) return false;
      e.click();
      return true;
    }, b.i);
    await new Promise((r) => setTimeout(r, 2200));
    const 후주소 = p.url();
    const 후글 = (await p.evaluate(() => document.body.innerText)).length;
    const 바뀜 = 전주소 !== 후주소 ? `→ ${후주소.replace(BASE, "")}` : 전글 !== 후글 ? `화면 바뀜(글 ${전글}→${후글})` : "**아무 일도 없음**";
    console.log(`  [${String(b.i).padStart(2)}] ${b.글.padEnd(28)} ${눌림 ? 바뀜 : "못 찾음"}`);
  }

  if (오류.length) { console.log("\n── 콘솔 오류 ──"); for (const e of [...new Set(오류)].slice(0, 8)) console.log("  " + e); }
  else console.log("\n콘솔 오류 없음");
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
