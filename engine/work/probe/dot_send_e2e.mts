/**
 * **정말 한 마디가 가나** (10-28). 모델 1회(싼 자리).
 *   npx tsx engine/work/probe/dot_send_e2e.mts
 *
 * 단추가 안 꺼져 있는 것과 **말이 오가는 것**은 다른 일이다. 10-28 에 단추가 꺼져 있던
 * 까닭이 익명 세션이었는데, 세션이 생겼다고 대화가 되는지는 아직 안 재 봤다
 * ([[unrun-code-is-unmeasured]]).
 *
 * 처음 온 사람과 똑같이 — 빈 브라우저로 들어가 치고 보내고, **답이 오나** 본다.
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://dot-web-production-7e03.up.railway.app";
const profile = mkdtempSync(join(tmpdir(), "rk-hl-e2e-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: profile, args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log((ok ? "맞음  " : "어긋남") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본))); };

try {
  const p = await browser.newPage();
  const 오류: string[] = [];
  p.on("pageerror", (e) => 오류.push(String(e).slice(0, 120)));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto(BASE + "/dot/nabi", { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4000));

  const 켜짐 = await p.evaluate(() => !(document.querySelector(".kk-input") as HTMLInputElement | null)?.disabled);
  재기("입력칸이 켜진다(익명 세션이 생겼다)", 켜짐);
  if (!켜짐) throw new Error("입력칸이 꺼져 있어 더 못 잰다");

  const 전줄수 = await p.evaluate(() => document.querySelectorAll(".kk-log .kk-row, .kk-log .kk-bubble").length);
  await p.click(".kk-input");
  await p.type(".kk-input", "안녕 오늘 뭐 했어?");
  await new Promise((r) => setTimeout(r, 400));
  const 보낼수있나 = await p.evaluate(() => !(document.querySelector(".kk-send") as HTMLButtonElement | null)?.disabled);
  재기("글자를 치면 보내기가 살아난다", 보낼수있나);

  await p.click(".kk-send");
  /* 답은 글자가 흘러나오는 대로 온다. **생각 중 점(● ● ●)을 답으로 세면 안 된다** —
     첫 판에서 그걸 통과로 적었다. 점과 이름을 걷어낸 뒤 남는 글자로 센다. */
  const 걷어내기 = (t: string) => t.split("안녕 오늘 뭐 했어?").pop()?.replace(/[●·•\s]/g, "").replace(/^나비/, "") ?? "";
  let 답 = "", 끝 = "";
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    답 = await p.evaluate(() => (document.querySelector(".kk-log")?.textContent ?? ""));
    끝 = 걷어내기(답);
    if (끝.length >= 4) break;
  }
  재기("내 말이 화면에 붙는다", 답.includes("안녕 오늘 뭐 했어?"));
  재기("**진짜 답**이 온다(생각 중 점 말고)", 끝.length >= 4, (답.split("안녕 오늘 뭐 했어?").pop() ?? "").replace(/\s+/g, " ").trim().slice(0, 70));

  if (오류.length) console.log("\n페이지 오류:", [...new Set(오류)].slice(0, 3).join(" | "));
} catch (e) {
  재기("자가 끝까지 돌았다", false, String(e).slice(0, 120));
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(나쁨 === 0 ? "\n전부 맞음" : `\n${나쁨}개 어긋남`);
process.exit(나쁨 === 0 ? 0 : 1);
