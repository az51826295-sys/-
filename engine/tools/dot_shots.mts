/**
 * **두근도트 화면 찍기** (227회차 09-29, 사장님 "하나하나 캡쳐해서 설명"). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_shots.mts <magicLink>
 *
 * 설치된 Edge 를 **임시 프로필**로 띄운다 — 사장님 브라우저 세션을 안 건드린다.
 * 매직 링크는 한 번만 쓰이므로 **로그인은 한 번**, 그다음 주소만 바꿔 가며 찍는다.
 * 끝나면 임시 프로필을 지운다(내 헤드리스 고아가 기계를 잡아먹은 적이 있다 — [[orphaned-headless-blamed-the-user]]).
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const magic = process.argv[2];
if (!magic) { console.error("사용: <magicLink>"); process.exit(1); }
const BASE = "https://dot-web-production-7e03.up.railway.app";
const OUT = "C:/Users/az518/Desktop/두근도트-화면";
mkdirSync(OUT, { recursive: true });

const 찍을것: [string, string, number][] = [
  ["1-피드", "/dot/feed", 2500],
  ["2-검색", "/dot/search", 2000],
  ["3-채팅목록", "/dot/chats", 2000],
  ["4-내창", "/dot/me", 2500],
  ["5-대화방", "/dot/yuna", 3500],
];

const profile = mkdtempSync(join(tmpdir(), "dot-shots-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  userDataDir: profile,
  args: ["--no-first-run", "--lang=ko-KR"],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.goto(magic, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(2500);
  console.log("로그인 뒤 주소:", page.url());
  for (const [이름, 길, 기다림] of 찍을것) {
    await page.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(기다림);
    const p = `${OUT}/${이름}.png`;
    await page.screenshot({ path: p as `${string}.png` });
    console.log("찍음", p);
  }
  // 대화방 메뉴(나가기가 보이게) 한 장 더
  const 메뉴 = await page.$('button[aria-label="메뉴"]');
  if (메뉴) {
    await 메뉴.click();
    await sleep(900);
    await page.screenshot({ path: `${OUT}/6-방메뉴.png` as `${string}.png` });
    console.log("찍음", `${OUT}/6-방메뉴.png`);
  } else console.log("메뉴 단추를 못 찾음 — 방 메뉴는 못 찍었다");
} finally {
  await browser.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
}
