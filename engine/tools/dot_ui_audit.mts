/**
 * **두근도트 화면 점검** (227회차 09-29, 사장님 "전체적인 유아이 점검"). 모델 0 · 값 0.
 *
 *   npx tsx engine/tools/dot_ui_audit.mts <magicLink>
 *
 * 눈으로만 보면 한 번 놓친다 — 09-13 에 "보내기" 가 화면 밖으로 밀린 것을 눈검수가 못 잡고
 * 넘침 자가 잡았다. 그래서 화면마다 **세면 나오는 것**을 잰다:
 *
 *  ① **넘침** — 보이는 요소의 오른쪽 끝이 화면 폭을 넘나(가로 스크롤이 생기는 자리)
 *  ② **깨진 그림** — `naturalWidth === 0` 인 img
 *  ③ **가로 스크롤** — `scrollWidth > clientWidth`
 *  ④ **너무 작은 누를 자리** — 44px 미만(손가락이 못 맞힌다, 애플·구글 권고)
 *  ⑤ **아래 탭에 가린 것** — 탭 높이 안에 들어가 버린 누를 자리
 *  ⑥ **빈 글자 단추** — 이름도 aria-label 도 없는 단추(읽어 주는 기계가 못 읽는다)
 *
 * 화면 그림도 같이 저장한다 — 자가 통과해도 눈이 아니라고 하면 아닌 것이다.
 */
import puppeteer, { type Page } from "puppeteer-core";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const magic = process.argv[2];
if (!magic) { console.error("사용: <magicLink>"); process.exit(1); }
const BASE = "https://dot-web-production-7e03.up.railway.app";
const OUT = "C:/Users/az518/Desktop/두근도트-화면점검";
mkdirSync(OUT, { recursive: true });

const 화면: [string, string][] = [
  ["피드", "/dot/feed"],
  ["피드-전체", "/dot/feed?all=1"],
  ["검색", "/dot/search"],
  ["채팅목록", "/dot/chats"],
  ["내창", "/dot/me"],
  ["대화방", "/dot/yuna"],
  ["프로필", "/dot/yuna/profile"],
  ["설정", "/dot/settings"],
  ["베타모집", "/dot/beta"],
  ["개인정보", "/dot/privacy"],
];

type 잰것 = { 넘침: string[]; 깨짐: string[]; 작음: string[]; 가림: string[]; 빈단추: string[]; 가로스크롤: boolean; 폭: number };

/**
 * 검사는 **글자로 넘긴다.**
 *
 * `page.evaluate(() => {...})` 에 화살표 함수를 넣으면 tsx(esbuild)가 그 안에 `__name(...)` 헬퍼를
 * 끼워 넣는데, 브라우저 안에는 그 헬퍼가 없어서 `__name is not defined` 로 죽는다(09-29 실제로 죽었다).
 * 글자로 주면 esbuild 가 건드리지 않는다.
 */
const 검사코드 = `(() => {
  var W = document.documentElement.clientWidth;
  var tabs = document.querySelector('.dt-tabs');
  var tabTop = tabs ? tabs.getBoundingClientRect().top : Infinity;
  var over = [], broken = [], small = [], hidden = [], unnamed = [];
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    var name = (el.textContent || '').trim().slice(0, 18) || el.getAttribute('aria-label') || el.tagName.toLowerCase();
    if (r.right > W + 1 && r.width <= W) over.push(name + ' (오른쪽 ' + Math.round(r.right) + ' > 폭 ' + W + ')');
    if (el.tagName === 'IMG' && el.naturalWidth === 0) broken.push(String(el.src).slice(-50));
    if (el.matches('button, a[href], input, textarea, [role=button]')) {
      if (!String(name).trim()) unnamed.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
      if (r.height > 0 && (r.height < 36 || r.width < 36)) small.push(name + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      if (r.top < tabTop && r.bottom > tabTop + r.height / 2) hidden.push(name);
    }
  }
  return {
    넘침: over, 깨짐: broken, 작음: small, 가림: hidden, 빈단추: unnamed,
    가로스크롤: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    폭: W
  };
})()`;

async function 재기(page: Page): Promise<잰것> {
  return page.evaluate(검사코드) as Promise<잰것>;
}

const profile = mkdtempSync(join(tmpdir(), "dot-ui-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  userDataDir: profile,
  args: ["--no-first-run", "--lang=ko-KR"],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let 탈 = 0;
try {
  const page = await browser.newPage();
  const 콘솔: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") 콘솔.push(m.text().slice(0, 100)); });
  page.on("pageerror", (e) => 콘솔.push("pageerror: " + String(e).slice(0, 100)));

  await page.goto(magic, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(2500);

  for (const [이름, 길] of 화면) {
    콘솔.length = 0;
    const res = await page.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(2200);
    const r = await 재기(page);
    await page.screenshot({ path: `${OUT}/${이름}.png` as `${string}.png` });
    const 탈난것: string[] = [];
    if (res && res.status() >= 400) 탈난것.push(`HTTP ${res.status()}`);
    if (r.가로스크롤) 탈난것.push("가로 스크롤");
    if (r.넘침.length) 탈난것.push(`넘침 ${r.넘침.length} (${r.넘침[0]})`);
    if (r.깨짐.length) 탈난것.push(`깨진 그림 ${r.깨짐.length} (${r.깨짐[0]})`);
    if (r.빈단추.length) 탈난것.push(`이름 없는 단추 ${r.빈단추.length} (${r.빈단추[0]})`);
    if (r.가림.length) 탈난것.push(`탭에 가림 ${r.가림.length} (${r.가림[0]})`);
    if (콘솔.length) 탈난것.push(`콘솔 오류 ${콘솔.length} (${콘솔[0]})`);
    탈 += 탈난것.length;
    console.log(`${탈난것.length ? "어긋남" : "맞음  "} ${이름.padEnd(9)} ${탈난것.length ?탈난것.join(" · ") : "깨끗"}`);
    if (r.작음.length) console.log(`         작은 누를 자리 ${r.작음.length}개: ${r.작음.slice(0, 3).join(", ")}`);
  }
} finally {
  await browser.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
}
console.log(탈 ? `\n**어긋남 ${탈}건** · 그림 → ${OUT}` : `\n**전부 깨끗** · 그림 → ${OUT}`);
