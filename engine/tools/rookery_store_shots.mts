/**
 * 로키 플레이 스크린샷 (100회차 09-13) — 설치된 Edge 를 **임시 프로필**로 띄워(사장님 브라우저 세션을 안 건드린다)
 * 폰·7인치·10인치 크기로 찍는다. 플레이는 태블릿 스크린샷도 필수로 요구한다(콘솔 "확인 오류" 5개 중 2개).
 *   phone  360×640  ×3 = 1080×1920   1 로그인  2 대화  3 결과 미리보기(승인·수정 요청·신고)
 *   tab7   720×1280 ×1.5 = 1080×1920 (플레이: 태블릿은 16:9·9:16 만)   2 대화  3 결과
 *   tab10  1280×720 ×1.5 = 1920×1080   2 대화  3 결과 (가로 — lg 폭이라 미리보기가 옆 칸에 늘 떠 있다)
 *   npx tsx engine/tools/rookery_store_shots.mts <magicLink> <resultConversationId>
 * 매직 링크는 rookery_review_seed.mts 가 준 것(한 번만 쓴다 — 그래서 로그인은 한 번, 크기만 바꿔 찍는다).
 * 대화 답은 실제 모델 답(가짜 답을 찍지 않는다); 보낸 뒤 주소에 c= 가 없어 태블릿 크기마다 다시 묻는다. 끝나면 씨앗 계정을 지울 것.
 */
import puppeteer, { type Page } from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [magic, resultConv] = process.argv.slice(2);
if (!magic || !resultConv) { console.error("사용: <magicLink> <resultConversationId>"); process.exit(1); }
const BASE = "https://rookery-web-production.up.railway.app";
const OUT = "engine/docs/store-rookery";
const SIZES = [
  { key: "phone", width: 360, height: 640, deviceScaleFactor: 3, isMobile: true },
  { key: "tab7", width: 720, height: 1280, deviceScaleFactor: 1.5, isMobile: true },
  { key: "tab10", width: 1280, height: 720, deviceScaleFactor: 1.5, isMobile: false },
] as const;
const px = (s: (typeof SIZES)[number]) => `${s.width * s.deviceScaleFactor}x${s.height * s.deviceScaleFactor}`;
const file = (s: (typeof SIZES)[number], n: string): `${string}.png` =>
  s.key === "phone" ? `${OUT}/shot-${n}-${px(s)}.png` : `${OUT}/${s.key}-${n}-${px(s)}.png`;

const profile = mkdtempSync(join(tmpdir(), "rk-shots-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  userDataDir: profile,
  args: ["--no-first-run", "--lang=ko-KR"],
  defaultViewport: { ...SIZES[0], hasTouch: true },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * 화면 밖으로 삐져나간 단추·글자를 센다(100회차). 눈으로 봤을 때 "보내기"·"승인"이 오른쪽 끝에서 잘렸다 —
 * 눈검수는 한 번 놓쳤다. 보이는 요소 중 오른쪽 끝이 폭을 넘는 것을 적고, 하나라도 있으면 실패.
 */
const overflow: string[] = [];
async function checkOverflow(page: Page, label: string) {
  const bad = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>("button, a, input, textarea, span, label")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > w + 1; })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.innerText || (el as HTMLInputElement).placeholder || "").trim().slice(0, 20)}" right=${Math.round(el.getBoundingClientRect().right)} > ${w}`);
  });
  console.log(`${label} 넘침 ${bad.length}`, bad.slice(0, 5).join(" / "));
  overflow.push(...bad.map((b) => `${label}: ${b}`));
}
async function shoot(page: Page, s: (typeof SIZES)[number], n: string, label: string) {
  await page.screenshot({ path: file(s, n) });
  console.log(`${s.key} ${label} 찍음 → ${file(s, n)}`);
  await checkOverflow(page, `${s.key} ${label}`);
}
/** 결과 미리보기를 연다. 폰·7인치는 입력창 위 띠를 눌러야 올라오고, 10인치(lg)는 옆 칸에 이미 떠 있다. */
async function openResult(page: Page) {
  await page.goto(`${BASE}/ask?c=${resultConv}`, { waitUntil: "networkidle2" });
  await sleep(1500);
  const visible = await page.evaluate(() => document.body.innerText.includes("이 결과, 어때요?"));
  if (!visible) {
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("미리보기") && x.offsetParent !== null);
      if (b) { (b as HTMLButtonElement).click(); return true; } return false;
    });
    if (!opened) throw new Error("미리보기 띠를 못 찾음");
  }
  await page.waitForFunction(() => document.body.innerText.includes("이 결과, 어때요?"), { timeout: 15000 });
  await sleep(800);
}

try {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  const phone = SIZES[0];

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await shoot(page, phone, "1-login", "로그인");

  await page.goto(magic, { waitUntil: "networkidle2" });
  if (!page.url().includes("/ask")) throw new Error(`로그인 실패: ${page.url()}`);

  // 대화 — 실제 질문 하나. 답이 오면(신고 링크가 붙으면) 찍는다.
  await page.goto(`${BASE}/ask`, { waitUntil: "networkidle2" });
  const box = await page.waitForSelector('textarea, input[placeholder*="물어보세요"]', { timeout: 15000 });
  await box!.type("로키는 뭘 할 수 있어? 짧게 알려 줘");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll("a")].some((a) => a.textContent?.trim() === "신고"), { timeout: 90000 });
  await sleep(1500);
  const chatUrl = page.url();
  await shoot(page, phone, "2-chat", "대화");

  await openResult(page);
  await shoot(page, phone, "3-result", "결과");

  for (const s of SIZES.slice(1)) {
    await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: s.deviceScaleFactor, isMobile: s.isMobile, hasTouch: s.isMobile });
    // 보낸 뒤에도 주소가 /ask 그대로라(c= 없음) 같은 대화를 다시 열 수 없다 — 크기마다 한 번 더 묻는다(모델 호출 1번씩).
    await page.goto(`${BASE}/ask`, { waitUntil: "networkidle2" });
    const b = await page.waitForSelector('textarea, input[placeholder*="물어보세요"]', { timeout: 15000 });
    await b!.type("로키는 뭘 할 수 있어? 짧게 알려 줘");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => [...document.querySelectorAll("a")].some((a) => a.textContent?.trim() === "신고"), { timeout: 90000 });
    await sleep(1500);
    await shoot(page, s, "2-chat", "대화");
    await openResult(page);
    await shoot(page, s, "3-result", "결과");
  }
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
  console.log(overflow.length ? `넘침 ${overflow.length}건 — 실패` : "넘침 0 — 통과");
  process.exitCode = overflow.length ? 1 : 0;
}
