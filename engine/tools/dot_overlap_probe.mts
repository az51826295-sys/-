/**
 * 화면 요소 겹침 자 (108회차 09-14, 95회차의 "다음"). 돈 0, 모델 없음.
 *   npx tsx engine/tools/dot_overlap_probe.mts [https://…]
 *
 * 09-13 사장님 화면: 밤하늘 배경 위에서 스티커 판이 배경에 묻혀 안 보였다. 그때는 눈으로 잡았고 자가 없었다.
 * 여기서는 배경(테마) 10개 × 폰 화면(375×812)에서, 눌러야 하는 것들(스티커 6개·입력창·스티커 단추·보내기·상단 바 단추)의
 * 가운데 점에 `elementFromPoint` 를 찍어 **그 요소(또는 그 안)** 가 맨 위에 있는지 본다. 배경·다른 판이 덮고 있으면 실패.
 * 씨앗 계정은 매직 링크로 들어가고 끝에 지운다. 설치된 Edge 를 임시 프로필로.
 */
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim(); }
const { createServiceClient } = await import("../../src/lib/supabase/service");

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "https://dot-web-production-7e03.up.railway.app";
const THEMES = ["kakao", "night", "peach", "mint", "paper", "pixel", "nightsky", "sakura", "rain", "sunset"];
const WALL = new Set(["nightsky", "sakura", "rain", "sunset"]); // 배경 그림이 있는 테마 — 09-13 고장은 여기서만 난다
const SABOTAGE = process.argv.includes("--sabotage");
const svc = createServiceClient();
let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

// 브라우저 먼저 — 브라우저가 안 뜨면 씨앗 계정을 만들지 않는다(첫 판에 고아 계정이 하나 남았다).
const profile = mkdtempSync(join(tmpdir(), "dot-ov-"));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true, userDataDir: profile, args: ["--no-first-run", "--lang=ko-KR", "--disable-gpu"], dumpio: process.argv.includes("--dumpio") });
const email = `overlap-${Date.now()}@dugeun.local`;
const { data: made, error } = await svc.auth.admin.createUser({ email, password: `ov-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
if (error) { await browser.close(); throw error; }
const uid = made.user.id;
try {
  const { data: link, error: le } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (le) throw le;
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle2" });
  check("로그인 → /dot", page.url().includes("/dot"), page.url());
  const { data: yuna } = await svc.from("dot_characters").select("slug").eq("is_public", true).eq("slug", "yuna").maybeSingle();
  const slug = yuna?.slug ?? "yuna";

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

  type Hit = { sel: string; label: string; ok: boolean; top: string; x: number; y: number };
  const measure = async (): Promise<Hit[]> => page.evaluate(() => {
    const targets: [string, string][] = [
      [".kk-stickers button", "스티커"], [".kk-input-row textarea, .kk-input-row input", "입력창"], [".kk-emo", "스티커 단추"],
      [".kk-send", "보내기"], [".kk-bar button, .kk-bar a", "상단 바"], [".kk-limit-btn", "한도 단추"],
    ];
    const out: { sel: string; label: string; ok: boolean; top: string; x: number; y: number }[] = [];
    for (const [sel, label] of targets) {
      document.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return;
        const hit = document.elementFromPoint(x, y);
        const ok = !!hit && (hit === el || el.contains(hit));
        const top = hit ? `${hit.tagName.toLowerCase()}.${(hit as HTMLElement).className?.toString().split(" ")[0] ?? ""}` : "없음";
        out.push({ sel: `${label}#${i}`, label, ok, top, x: Math.round(x), y: Math.round(y) });
      });
    }
    return out;
  });

  for (const theme of THEMES) {
    await page.goto(`${BASE}/dot/${slug}`, { waitUntil: "networkidle2" });
    await page.evaluate((k) => { localStorage.setItem("dot-theme", k); localStorage.setItem("dot-bubble", "kakao"); }, theme);
    await page.reload({ waitUntil: "networkidle2" });
    // 처음 들어온 사람에게 뜨는 소개 카드(.kk-peek, z-index 20)는 일부러 다 덮는 판이다 — 닫고 잰다. (첫 판: 이게 안 닫혀 10테마 전부 '실패'로 나왔다.)
    const peek = await page.$(".kk-peek-close");
    if (peek) { await peek.click(); await page.waitForSelector(".kk-peek", { hidden: true, timeout: 4000 }).catch(() => undefined); }
    // 스티커 판 열기
    const opened = await page.$(".kk-emo").then(async (b) => { if (!b) return false; await b.click(); return page.waitForSelector(".kk-stickers button", { timeout: 4000 }).then(() => true, () => false); });
    await new Promise((r) => setTimeout(r, 300));
    // --sabotage: 09-13 고장을 일부러 되살린다(스티커 판·입력줄의 자리 잡기를 뺌) — 자가 그걸 잡는지 본다. 잡지 못하는 자는 자가 아니다.
    if (SABOTAGE) await page.addStyleTag({ content: ".kk-stickers, .kk-input-row { position: static !important; z-index: auto !important; }" });
    // 배경 그림은 pointer-events:none 이라 elementFromPoint 가 그냥 지나친다 — 그래서 첫 판엔 고장을 재현해도 '잡은 것 0개'였다.
    // 재는 동안만 배경을 맞히게 해서, 그리는 순서(쌓임)를 그대로 hit-test 로 읽는다. 배경이 위에 그려지면 배경이 맞는다.
    await page.addStyleTag({ content: ".kk-wall { pointer-events: auto !important; }" });
    const hits = await measure();
    const failed = hits.filter((h) => !h.ok);
    const n = hits.length;
    const wantFail = SABOTAGE && WALL.has(theme);
    check(`테마 ${theme.padEnd(8)} · 요소 ${String(n).padStart(2)}개 맨 위 · 스티커 판 ${opened ? "열림" : "안 열림"}${wantFail ? ` · 고장 재현 → 잡은 것 ${failed.length}개` : ""}`,
      wantFail ? failed.length > 0 : n >= 8 && opened && failed.length === 0, failed.map((f) => `${f.sel}→${f.top}@${f.x},${f.y}`));
    if (failed.length) await page.screenshot({ path: join(tmpdir(), `dot-overlap-${theme}.png`) as `${string}.png` });
  }
  check("페이지 오류 없음", errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
  await svc.auth.admin.deleteUser(uid);
  console.log("씨앗 계정 지움");
}
console.log(bad ? `실패 ${bad}` : "전부 통과");
process.exitCode = bad ? 1 : 0;
