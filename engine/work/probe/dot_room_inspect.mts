/** 대화방 아래쪽 단추가 무엇이고 왜 죽어 있나 (10-28). */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://dot-web-production-7e03.up.railway.app";
const profile = mkdtempSync(join(tmpdir(), "rk-hl-insp-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: profile, args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const p = await browser.newPage();
  const 오류: string[] = [];
  p.on("console", (m) => { if (m.type() === "error") 오류.push(m.text().slice(0, 160)); });
  p.on("pageerror", (e) => 오류.push("throw: " + String(e).slice(0, 160)));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto(BASE + "/dot/nabi", { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, Number(process.argv[2] ?? 3000)));

  const 본 = await p.evaluate(() => {
    const bs = [...document.querySelectorAll("button, a, [role=button]")].map((e) => {
      const r = e.getBoundingClientRect();
      return {
        tag: e.tagName.toLowerCase(),
        cls: (e.className || "").toString().slice(0, 40),
        aria: e.getAttribute("aria-label") ?? "",
        disabled: (e as HTMLButtonElement).disabled ?? false,
        글: (e.textContent ?? "").trim().slice(0, 20),
        자리: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      };
    });
    const inp = document.querySelector("input[type=text], textarea, .kk-input") as HTMLInputElement | null;
    return {
      bs,
      입력: inp ? { disabled: inp.disabled, placeholder: inp.placeholder, cls: inp.className } : null,
      경고: (document.querySelector(".kk-warn")?.textContent ?? "").trim().slice(0, 70),
    };
  });

  console.log("입력칸:", JSON.stringify(본.입력));
  console.log("경고줄:", 본.경고 || "(없음)");
  console.log("\n눌리는 것:");
  for (const b of 본.bs) console.log(`  ${b.tag.padEnd(6)} ${b.disabled ? "**꺼짐**" : "      "} ${b.cls.padEnd(22)} ${(b.aria || b.글).padEnd(16)} ${b.자리}`);
  if (오류.length) { console.log("\n콘솔 오류:"); for (const e of [...new Set(오류)].slice(0, 6)) console.log("  " + e); }
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
