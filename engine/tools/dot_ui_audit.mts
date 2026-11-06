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
 *  ④ **너무 작은 누를 자리** — 손가락이 못 맞힌다
 *     11-06 에 이 자를 고쳤다. 전에는 **재고도 안 셌다**(74개를 적어 놓고 끝 줄은 "전부 깨끗"),
 *     게다가 문턱이 **내가 지어낸 36px** 이었다(문서엔 44 라 써 놓고 코드는 36 을 쟀고,
 *     `dot_limit_card_shot` 은 그 44 를 "회사 기준" 이라고 인용하고 있었다 — 없는 기준이었다).
 *     지금은 **바깥 기준**을 쓴다:
 *       · **24×24 미만 = 어긋남** (WCAG 2.2 AA, 2.5.8 Target Size Minimum)
 *       · 24~44 = "아슬" (AAA 2.5.5 를 못 맞춘 것) — 적고 세지는 않는다
 *       · **문장 속 링크는 예외** (2.5.8 의 inline 예외). 기계로 가리는 법: 바로 옆에 글자 노드가
 *         있으면 문장 속이다 — 줄 높이에 묶여 있으니 크게 만들 수가 없다.
 *     한 번에 44 로 전부 올리면 글자 링크까지 빨개진다([[rule-blast-radius]]).
 *  ⑤ **아래 탭에 가린 것** — 탭 높이 안에 들어가 버린 누를 자리
 *  ⑦ **낱말 잘림** — 한국어가 글자 단위로 줄바꿈되나(11-06 에 41군데였다. 지금 0)
 *  ⑥ **빈 글자 단추** — 이름도 aria-label 도 없는 단추(읽어 주는 기계가 못 읽는다)
 *
 * 화면 그림도 같이 저장한다 — 자가 통과해도 눈이 아니라고 하면 아닌 것이다.
 */
import puppeteer, { type Page } from "puppeteer-core";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const magic0 = process.argv[2];
if (!magic0) { console.error("사용: <magicLink>  (DOT_BASE=http://localhost:3000 이면 로컬을 잰다)"); process.exit(1); }

/**
 * 11-06: **고친 것을 재려면 로컬을 볼 수 있어야 한다.** 전에는 운영 주소가 박혀 있어서
 * 내가 고친 CSS 를 재려면 먼저 배포해야 했다 — 안 재고 올리는 순서가 된다([[unrun-code-is-unmeasured]]).
 * `DOT_BASE` 를 주면 그 서버를 잰다. 로그인 링크는 **같은 Supabase 열쇠**로 만든 것이라
 * 토큰은 그대로 쓰고 **주소만 바꿔** 들어간다(그 길은 로컬 서버가 처리한다).
 */
const BASE = (process.env.DOT_BASE ?? "https://dot-web-production-7e03.up.railway.app").replace(/\/$/, "");
const magic = BASE + magic0.slice(magic0.indexOf("/auth/confirm"));
if (!magic0.includes("/auth/confirm")) { console.error("로그인 링크가 /auth/confirm 이 아니다"); process.exit(1); }
const OUT = "C:/Users/az518/Desktop/두근도트-화면점검";
mkdirSync(OUT, { recursive: true });

/**
 * 11-06: **출석 판이 첫 화면을 덮는다.** 하루 첫 입장이면 `/dot` 어디로 들어와도 뜨기 때문에,
 * 그대로 돌리면 열 화면이 전부 "판 사진" 이 되고 뒤는 **못 본 채로 통과**한다
 * ([[rulers-must-not-share-a-screen]]). 그래서 판을 **제 화면으로 먼저 재고**, 받아서 치운 다음
 * 나머지를 돈다. 판을 안 재고 닫기만 하면 새로 생긴 화면 하나가 자 밖에 남는다.
 */
const 화면: [string, string][] = [
  ["출석판", "/dot/chats"],
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

import { CHECK_CODE, WORDBREAK_CODE, split, group, type Measured, type WordBreak } from "./dot_ui_checks.js";

async function 재기(page: Page): Promise<Measured> {
  return page.evaluate(CHECK_CODE) as Promise<Measured>;
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
    const { 어긋남: 작음, 아슬, 예외 } = split(r.작음);
    const 잘림 = await page.evaluate(WORDBREAK_CODE) as WordBreak[];

    const 탈난것: string[] = [];
    if (res && res.status() >= 400) 탈난것.push(`HTTP ${res.status()}`);
    if (r.가로스크롤) 탈난것.push("가로 스크롤");
    if (r.넘침.length) 탈난것.push(`넘침 ${r.넘침.length} (${r.넘침[0]})`);
    if (r.깨짐.length) 탈난것.push(`깨진 그림 ${r.깨짐.length} (${r.깨짐[0]})`);
    if (r.빈단추.length) 탈난것.push(`이름 없는 단추 ${r.빈단추.length} (${r.빈단추[0]})`);
    if (r.가림.length) 탈난것.push(`탭에 가림 ${r.가림.length} (${r.가림[0]})`);
    if (작음.length) 탈난것.push(`작은 누를 자리 ${작음.length} (24px 미만, 조각 ${group(작음).length}가지)`);
    if (잘림.length) 탈난것.push(`낱말 잘림 ${잘림.length} ("${잘림[0].자리}")`);
    if (콘솔.length) 탈난것.push(`콘솔 오류 ${콘솔.length} (${콘솔[0]})`);
    탈 += 탈난것.length;
    console.log(`${탈난것.length ? "어긋남" : "맞음  "} ${이름.padEnd(9)} ${탈난것.length ?탈난것.join(" · ") : "깨끗"}`);
    if (작음.length) console.log(`         24px 미만(AA 어긋남): ${group(작음).join(" · ")}`);
    if (아슬.length) console.log(`         아슬(24~44, AAA 못 맞춤): ${group(아슬).join(" · ")}`);
    if (예외.length) console.log(`         문장 속 예외: ${group(예외).join(" · ")}`);
    if (잘림.length) console.log(`         낱말 잘림 ${잘림.length}: ${잘림.slice(0, 3).map((x) => `${x.어디} "${x.자리}"`).join(" · ")}`);

    /* 판을 쟀으면 **받아서 치운다** — 안 치우면 뒤의 아홉 화면이 전부 판에 덮인다.
       판이 안 떴으면(이미 출석) 그냥 지나간다. 눌린 뒤 서버가 답할 때까지 넉넉히 기다린다. */
    if (이름 === "출석판") {
      const 있나 = await page.$(".ci-go");
      if (있나) { await 있나.click(); await sleep(6000); }
      else console.log("         (판이 안 떴다 — 이미 출석한 계정이면 맞다)");
    }
  }
} finally {
  await browser.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
}
console.log(탈 ? `\n**어긋남 ${탈}건** · 그림 → ${OUT}` : `\n**전부 깨끗** · 그림 → ${OUT}`);
