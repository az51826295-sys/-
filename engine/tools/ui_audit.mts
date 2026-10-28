/**
 * **UI 점검** (10-28 사장님 "유아이 점검하자"). 모델 0 · 값 0.
 *   npx tsx engine/tools/ui_audit.mts [dot|ask|둘]
 *
 * 사진만 찍고 "괜찮아 보인다" 고 적지 않는다 — 설명서만 읽고 쓴 지적은 10개 중
 * 3개가 틀렸고([[verify-ui-claims-before-rebuilding]]), 사진만 본 판단도 그 집안이다.
 * 그래서 **화면마다 숫자를 뽑는다**: 콘솔 오류 · 가로 넘침 · 작은 글씨 ·
 * 손가락이 못 짚는 단추 · 빈 화면.
 *
 * 폰 폭(390)으로 본다. 두근도트는 폰 앱이고, 로키도 폰에서 열린다.
 *
 * 띄운 브라우저는 **트리째** 끝낸다([[orphaned-headless-blamed-the-user]]: 내 고아
 * 154개가 기계를 잡아먹고 남 탓을 했다).
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { browserPath } = await import("../../src/lib/video/screen");

const 무엇 = process.argv[2] ?? "둘";
const DOT = process.env.DOT_SITE ?? "https://dot-web-production-7e03.up.railway.app";
const ASK = process.env.ROOKERY_SITE ?? "https://rookery-web-production.up.railway.app";
const OUT = "engine/work/ui-audit";
mkdirSync(OUT, { recursive: true });

type 칸 = { 이름: string; url: string; 기다림?: number };
const 두근도트: 칸[] = [
  { 이름: "dot-피드", url: DOT + "/dot/feed" },
  { 이름: "dot-타로", url: DOT + "/dot/tarot", 기다림: 2500 },
  { 이름: "dot-채팅목록", url: DOT + "/dot/chats" },
  { 이름: "dot-설정", url: DOT + "/dot/settings" },
  { 이름: "dot-내창", url: DOT + "/dot/me" },
  /* 오늘 손댄 핵심 화면(소리·진동·멘헤라 테마). 자가 안 보면 안 잰 것이다. */
  { 이름: "dot-대화방", url: DOT + "/dot/yuna", 기다림: 3500 },
  /* 로그인 문을 없앴다(10-28). 없앤 것이 **정말** 없어졌나를 여기서 본다 —
     /login 이 /dot 으로 돌려보내야 한다. */
  { 이름: "dot-로그인(없어야)", url: DOT + "/login" },
];
const 로키: 칸[] = [
  { 이름: "ask-첫화면", url: ASK + "/" },
  { 이름: "ask-대화창", url: ASK + "/ask", 기다림: 3000 },
  { 이름: "ask-로그인", url: ASK + "/login" },
];

const 볼것 = 무엇 === "dot" ? 두근도트 : 무엇 === "ask" ? 로키 : [...두근도트, ...로키];

const 프로필 = mkdtempSync(join(tmpdir(), "rk-ui-"));
const browser = await puppeteer.launch({
  executablePath: browserPath() ?? undefined,
  headless: true,
  userDataDir: 프로필,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
});

/** 화면 안에서 재는 것. **눈이 아니라 자다.** */
const 재는대본 = `(() => {
  const r = { 넘침: 0, 작은글씨: [], 작은단추: [], 글자수: 0, 빈화면: false, 돌려보냄: location.pathname };
  const d = document.documentElement;
  r.넘침 = Math.max(0, d.scrollWidth - d.clientWidth);
  const txt = (document.body.innerText || "").trim();
  r.글자수 = txt.length;
  r.빈화면 = txt.length < 20;
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const 직접글 = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    const px = parseFloat(cs.fontSize);
    if (직접글 && px && px < 12) r.작은글씨.push(Math.round(px * 10) / 10 + "px " + (el.textContent || "").trim().slice(0, 18));
    const 짚는것 = el.matches("button, a[href], [role=button], input, select, textarea, label[for]");
    if (짚는것) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && Math.min(b.width, b.height) < 40) {
        r.작은단추.push(Math.round(Math.min(b.width, b.height)) + "px " + ((el.getAttribute("aria-label") || el.textContent || el.tagName) + "").trim().slice(0, 18));
      }
    }
  }
  r.작은글씨 = [...new Set(r.작은글씨)].slice(0, 6);
  r.작은단추 = [...new Set(r.작은단추)].slice(0, 6);
  return r;
})()`;

const 결과: Record<string, unknown>[] = [];

for (const c of 볼것) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const 오류: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") 오류.push(m.text().slice(0, 140)); });
  page.on("pageerror", (e) => 오류.push("throw: " + String(e.message).slice(0, 140)));
  let status = 0;
  try {
    const res = await page.goto(c.url, { waitUntil: "networkidle2", timeout: 60_000 });
    status = res?.status() ?? 0;
  } catch (e) {
    오류.push("못 열었다: " + String(e).slice(0, 120));
  }
  await new Promise((r) => setTimeout(r, c.기다림 ?? 1200));
  let 잰것: Record<string, unknown> = {};
  try { 잰것 = await page.evaluate(재는대본) as Record<string, unknown>; } catch { /* 빈 화면 */ }
  const 사진 = join(OUT, c.이름 + ".png") as `${string}.png`;
  try { await page.screenshot({ path: 사진 }); } catch { /* 못 찍음 */ }
  결과.push({ 이름: c.이름, status, 오류수: 오류.length, 오류: 오류.slice(0, 3), ...잰것 });
  await page.close();
}

await browser.close();
try { rmSync(프로필, { recursive: true, force: true }); } catch { /* 지워지면 좋고 */ }

/* ── 보고. 숫자만 적는다. "괜찮다" 는 안 적는다 ── */
console.log("화면".padEnd(20) + "상태  글자  넘침  작은글씨 작은단추 오류");
for (const r of 결과) {
  console.log(
    String(r.이름).padEnd(20) +
    String(r.status).padStart(4) +
    String(r.글자수 ?? "-").padStart(6) +
    String(r.넘침 ?? "-").padStart(6) +
    String((r.작은글씨 as string[] | undefined)?.length ?? "-").padStart(9) +
    String((r.작은단추 as string[] | undefined)?.length ?? "-").padStart(9) +
    String(r.오류수).padStart(5) +
    (r.빈화면 ? "   ← 빈 화면" : ""),
  );
}
console.log("\n── 자세히 ──");
for (const r of 결과) {
  const 할말 = [
    r.빈화면 ? "빈 화면(글자 " + r.글자수 + "자)" : "",
    Number(r.넘침) > 0 ? "가로로 " + r.넘침 + "px 넘친다" : "",
    (r.작은글씨 as string[])?.length ? "작은 글씨: " + (r.작은글씨 as string[]).join(" · ") : "",
    (r.작은단추 as string[])?.length ? "작은 단추: " + (r.작은단추 as string[]).join(" · ") : "",
    (r.오류 as string[])?.length ? "콘솔: " + (r.오류 as string[]).join(" | ") : "",
    r.이름 === "dot-로그인(없어야)" ? "주소가 " + r.돌려보냄 + " 로 갔다" : "",
  ].filter(Boolean);
  if (할말.length) console.log("\n" + r.이름 + "\n  " + 할말.join("\n  "));
}
writeFileSync(join(OUT, "결과.json"), JSON.stringify(결과, null, 2), "utf8");
console.log("\n사진·숫자: " + OUT);
