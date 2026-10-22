/**
 * **토씨가 제대로 붙나** (10-22). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_토씨.mts [--sabotage]
 *
 * 전투 글을 말 표로 옮기면서 조사를 `{이가}` 같은 토막으로 적어 뒀다. 한국어는 앞 글자
 * 받침을 보고 고르고, 영어는 그 토막이 없어 저절로 사라진다.
 *
 * **안 재면 한국어가 깨진 걸 모른다** — "해골가 쓰러졌다" 는 게임이 안 죽으니 자가 없으면
 * 영영 안 보인다. 받침 있는 이름과 없는 이름을 **둘 다** 넣어 본다(한쪽만 보면 반쪽 자다).
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";

const 주소 = (process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html") + `?cb=${Date.now()}`;
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate(() => { try { localStorage.clear(); localStorage.setItem("ash.lang", "ko"); } catch { /* */ } });
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1500));

  if (process.argv.includes("--sabotage")) {
    /* 심은 고장: 토씨를 **늘 받침 있는 쪽**으로 고른다 → 받침 없는 이름에서 틀려야 한다 */
    await page.evaluate(() => {
      const w = window as unknown as { 말?: (k: string, v?: Record<string, unknown>) => string };
      const 원 = w.말!;
      w.말 = (k, v) => 원(k, v).replace(/가 /g, "이 ").replace(/는 /g, "은 ");
    });
  }

  const 본 = await page.evaluate(() => {
    const w = window as unknown as { 말?: (k: string, v?: Record<string, unknown>) => string; 쓰는말?: string };
    if (!w.말) return null;
    /* 받침 **있는** 이름(해골·박쥐 아님)과 **없는** 이름(기사·검사)을 둘 다 */
    return {
      쓰는: w.쓰는말,
      받침있음: w.말("fight.down", { name: "해골" }),      // 골 → 받침 O → "이"
      받침없음: w.말("fight.down", { name: "박쥐" }),      // 쥐 → 받침 X → "가"
      태그앞: w.말("fight.twoCuts", { name: "기사" }),      // <b> 태그를 건너뛰고 "사" 를 봐야 한다
      태그앞받침: w.말("fight.twoCuts", { name: "로건" }), // 건 → 받침 O
    };
  });

  if (!본) { console.error("창 안에서 말() 을 못 찾았다 — **못 잼**"); process.exit(1); }
  재기("한국어로 열렸다", 본.쓰는 === "ko", 본);
  재기('받침 있는 이름엔 "이" (해골이 쓰러졌다)', 본.받침있음.includes("해골이"), { 본: 본.받침있음 });
  재기('받침 없는 이름엔 "가" (박쥐가 쓰러졌다)', 본.받침없음.includes("박쥐가"), { 본: 본.받침없음 });
  /* 10-22 **첫 판에 이 자가 틀렸다.** 게임은 `<b>기사</b>가` 로 맞게 냈는데 자가 `기사가` 를
     찾아 "실패" 라 했다 — 태그가 사이에 끼는 걸 안 걷어냈다. 자를 고쳤지 게임을 고치지 않았다.
     그리고 "{ 가 없나" 는 JSON 중괄호까지 세어 늘 떨어지는 헛검사였다 — 토막 이름으로 바꿨다. */
  const 민 = (s: string) => s.replace(/<[^>]*>/g, "");
  재기('HTML 태그를 건너뛰고 고른다 (기사가)', 민(본.태그앞).includes("기사가"), { 본: 본.태그앞 });
  재기('태그 뒤 받침도 본다 (로건이)', 민(본.태그앞받침).includes("로건이"), { 본: 본.태그앞받침 });
  const 샌토막 = Object.values(본).filter((v) => typeof v === "string" && /\{(은는|이가|을를|와과|으로)\}/.test(v));
  재기("토씨 토막이 글자로 새지 않는다", 샌토막.length === 0, 샌토막);

  /* 영어로 열면 토씨 토막이 아예 없어야 한다 */
  await page.evaluate(() => { try { localStorage.setItem("ash.lang", "en"); } catch { /* */ } });
  await page.goto(주소, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1200));
  const 영 = await page.evaluate(() => {
    const w = window as unknown as { 말?: (k: string, v?: Record<string, unknown>) => string };
    return { 쓰러짐: w.말!("fight.down", { name: "Skeleton" }), 벰: w.말!("fight.twoCuts", { name: "Knight" }) };
  });
  재기("영어엔 토씨가 안 붙는다", /^Skeleton goes down\.$/.test(영.쓰러짐), 영);
  재기("영어 문장이 한국어로 안 샌다", !/[가-힣]/.test(영.쓰러짐 + 영.벰), 영);
} finally { await 창.browser.close(); await 창.close?.(); }

console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
