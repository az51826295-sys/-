/**
 * **영어로 열면 영어가 뜨나** (10-19 사장님 "모든 앱 전세계화"). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_말.mts [--sabotage]
 *
 * 178 개국에 나가는데 화면이 한국어뿐이면 읽을 사람은 한국 사람뿐이다. 말을 바깥 표로
 * 빼내는 중인데, 834 개를 한 번에 옮기면 게임이 통째로 깨진다 — **첫 화면부터 한 겹씩** 옮긴다.
 *
 * 그래서 이 자는 "전부 영어인가" 를 묻지 않는다(지금은 아니고, 아닌 게 맞다).
 * **옮기기로 한 자리가 실제로 옮겨졌나**와, **한국어로 열면 한국어로 돌아오나**를 잰다.
 * 옮긴 자리 목록은 게임 안 `말표` 에서 가져온다 — 자가 목록을 따로 들고 있으면 금세 낡는다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";

const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);

  /** 말을 정해 놓고 맨땅에서 연다 — 저장이 남아 있으면 "처음 온 사람" 이 아니다 */
  const 열기 = async (말: "ko" | "en") => {
    await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate((v) => { try { localStorage.clear(); localStorage.setItem("ash.lang", v); } catch { /* */ } }, 말);
    await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 1200));
  };

  /** `data-말` 이 붙은 자리를 전부 걷어 온다(키 · 지금 글자 · 표가 바라는 글자) */
  const 걷기 = () => page.evaluate(() => {
    const w = window as unknown as { 말표?: Record<string, Record<string, string>>; 쓰는말?: string };
    const 표 = w.말표 ?? {};
    const 쓰는 = w.쓰는말 ?? "?";
    const 들 = Array.from(document.querySelectorAll("[data-말]")).map((el) => {
      const 키 = el.getAttribute("data-말") ?? "";
      return { 키, 글: (el.textContent ?? "").trim(), 바란것: (표[키]?.[쓰는] ?? "").trim() };
    });
    return { 쓰는, 표크기: Object.keys(표).length, 들 };
  });

  /**
   * 심은 고장: **영어로 열었는데 한국어로 되돌려 놓는다.**
   *
   * 첫 판엔 `evaluateOnNewDocument` + `load` 로 심었는데 **안 물었다** — 이 창은 그림이 174장이라
   * `load` 가 한참 뒤에 뜨고, 그때는 자가 이미 다 걷어 간 뒤였다. 자를 고치기 전에
   * **심은 것을 먼저 의심한다**(09-21 기록). 지금은 걷기 직전에 손으로 되돌린다.
   */
  const 고장심기 = () => page.evaluate(() => {
    const w = window as unknown as { 말표?: Record<string, Record<string, string>> };
    for (const el of Array.from(document.querySelectorAll("[data-말]"))) {
      const ko = w.말표?.[el.getAttribute("data-말") ?? ""]?.ko;
      if (ko) el.textContent = ko;
    }
  });

  /* ── ① 영어로 열었을 때 ── */
  await 열기("en");
  if (process.argv.includes("--sabotage")) await 고장심기();
  const 영 = await 걷기();
  재기("말 표가 창 안에 있다", 영.표크기 > 0, { 표크기: 영.표크기 });
  재기("영어로 열면 쓰는말이 en 이다", 영.쓰는 === "en", { 쓰는: 영.쓰는 });
  재기("옮긴 자리가 하나 이상 있다", 영.들.length > 0, { 자리: 영.들.length });

  /* 10-19 **첫 판에 이 자가 빈 통과를 냈다.** 표를 못 읽어 `바란것` 이 전부 빈 글자였고,
     `바란것 &&` 가 모든 줄을 건너뛰어 "전부 영어로 떴다" 가 **아무것도 안 재고** 통과했다.
     그래서 **바랄 것이 없는 줄을 먼저 떨어뜨린다** — 못 재는 것은 통과가 아니다. */
  const 바랄것없음 = 영.들.filter((x) => !x.바란것);
  재기("자가 바랄 글자를 읽어 왔다(빈 통과 막기)", 바랄것없음.length === 0, 바랄것없음.slice(0, 6).map((x) => x.키));

  const 안옮김 = 영.들.filter((x) => x.바란것 && x.글 !== x.바란것);
  재기(`옮긴 자리 ${영.들.length}개가 전부 영어로 떴다`, 안옮김.length === 0, 안옮김.slice(0, 6));

  const 한글남음 = 영.들.filter((x) => /[가-힣]/.test(x.글));
  재기("옮긴 자리에 한국어가 안 남았다", 한글남음.length === 0, 한글남음.slice(0, 6).map((x) => `${x.키}=${x.글}`));

  /* **여기서 센다 — 영어로 연 화면에서.** 10-20 에 이 줄을 아래(한국어 판 뒤)에 두는 바람에
     한국어 화면을 세고 "아직 61자 남았다" 고 적었다. 세 겹을 옮겨도 숫자가 61 에서 꿈쩍 안 해
     들통났다(진짜 남은 것은 2자였다). **재는 자리가 틀리면 숫자가 안 움직인다.** */
  const 남은 = await page.evaluate(() => {
    const 글 = document.body.innerText ?? "";
    return {
      자수: (글.match(/[가-힣]/g) ?? []).length,
      줄: [...new Set((글.match(/[^\n]*[가-힣][^\n]*/g) ?? []).map((s) => s.trim()))].slice(0, 5),
    };
  });

  /* ── ② 한국어로 돌아오나 ── */
  await 열기("ko");
  const 한 = await 걷기();
  재기("한국어로 열면 쓰는말이 ko 다", 한.쓰는 === "ko", { 쓰는: 한.쓰는 });
  const 한안됨 = 한.들.filter((x) => x.바란것 && x.글 !== x.바란것);
  재기("한국어로 열면 한국어로 돌아온다", 한안됨.length === 0, 한안됨.slice(0, 6));

  /* ── ③ 아직 얼마나 남았나 (판정하지 않는다 — 숫자만) ── */
  console.log(`     말 표 ${영.표크기}줄 · 옮긴 자리 ${영.들.length}개`);
  console.log(`     **영어로 연 첫 화면**에 남은 한국어 ${남은.자수}자 — 못 옮긴 것이지 고장이 아니다`);
  for (const l of 남은.줄) console.log(`       · ${l.slice(0, 60)}`);
} finally { await 창.browser.close(); await 창.close?.(); }

console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
