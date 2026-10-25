/**
 * **로키 화면이 실제로 어떤가** — 취향이 아니라 잴 수 있는 것만 잰다 (10-25).
 *
 * 내 취향으로 뜯어고치지 않는다. 대신 **사람이 겪는 고장**을 센다:
 *   · 가로로 삐져나가나   · 글자가 11px 아래인가
 *   · 누르는 것이 44px 보다 작나   · 한국어뿐인가
 *
 * 창 안에서 돌 코드는 **글자로 넘긴다** — tsx 가 함수에 `__name` 을 붙이는데
 * 브라우저엔 그게 없어서 `__name is not defined` 로 죽는다(10-25에 걸렸다).
 */
import { openHeadless } from "../../../src/lib/video/headless";

const 터 = process.env.ROOKERY_URL ?? "https://rookery-web-production.up.railway.app";
const 볼것: Array<[string, string]> = [["첫 화면", "/"], ["로그인", "/login"], ["요금", "/pricing"]];

const 잴코드 = `(() => {
  const 보이나 = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.1;
  };
  const 삐짐 = [...document.querySelectorAll("*")].filter((el) => {
    const r = el.getBoundingClientRect();
    return 보이나(el) && (r.right > innerWidth + 1 || r.left < -1);
  }).map((el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""));

  const 작은글 = [...document.querySelectorAll("p,span,div,li,small,label,a,button")].filter((el) => {
    if (!보이나(el)) return false;
    const 직접 = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 1);
    return 직접 && parseFloat(getComputedStyle(el).fontSize) < 11;
  }).map((el) => Math.round(parseFloat(getComputedStyle(el).fontSize)) + "px «" + (el.textContent || "").trim().slice(0, 18) + "»");

  const 작은단추 = [...document.querySelectorAll("button,a,[role=button],input[type=submit]")].filter((el) => {
    if (!보이나(el)) return false;
    const r = el.getBoundingClientRect();
    return r.height < 44 || r.width < 32;
  }).map((el) => { const r = el.getBoundingClientRect();
    return Math.round(r.width) + "×" + Math.round(r.height) + " «" + (el.textContent || "").trim().slice(0, 14) + "»"; });

  const 글 = document.body.innerText || "";
  return {
    가로삐짐: [...new Set(삐짐)].slice(0, 6),
    작은글: [...new Set(작은글)].slice(0, 6),
    작은단추: [...new Set(작은단추)].slice(0, 6),
    한글: (글.match(/[가-힣]/g) || []).length,
    영어: (글.match(/[A-Za-z]/g) || []).length,
    세로: document.documentElement.scrollHeight,
  };
})()`;

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  for (const [이름, 길] of 볼것) {
    const t0 = Date.now();
    await page.goto(터 + 길, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 1200));
    const 뜬시간 = Date.now() - t0;
    const r = await page.evaluate(잴코드) as {
      가로삐짐: string[]; 작은글: string[]; 작은단추: string[]; 한글: number; 영어: number; 세로: number;
    };
    console.log(`── ${이름}  (${길})  ${뜬시간}ms · 세로 ${r.세로}px`);
    console.log(`   한국어 ${r.한글}자 · 영어 ${r.영어}자`);
    console.log(`   가로 삐짐 ${r.가로삐짐.length}개` + (r.가로삐짐.length ? ": " + r.가로삐짐.join(", ") : ""));
    console.log(`   작은 글(11px↓) ${r.작은글.length}개` + (r.작은글.length ? ": " + r.작은글.join(" / ") : ""));
    console.log(`   작은 누름(44px↓) ${r.작은단추.length}개` + (r.작은단추.length ? ": " + r.작은단추.join(" / ") : ""));
    console.log("");
  }
} finally { await 창.close(); }
