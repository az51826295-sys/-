/**
 * # 이모티콘 서랍을 **방에서 열어** 본다 (11-10 사장님 "이모티콘 화면도 이쁘게 전체적으로 꾸며")
 *
 *   npm run dev 를 띄우고: npx tsx engine/tools/dot_sticker_shot.mts
 *
 * 꾸몄다는 말은 재지 않은 말이다([[adjectives-dont-survive-the-ruler]]). 두 모습을 다 찍고
 * **숫자로** 본다:
 *
 *  · 잠긴 모습(2단계) — 칸 12개가 다 보이나 · 자물쇠가 그려지나 · 그 사람 칸이 안 눌리나
 *  · 열린 모습(5단계) — 자물쇠가 사라지나 · 눌리나
 *  · 가로로 넘치지 않나(390 폭) · 서랍이 화면을 다 먹지 않나
 */
import { readFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import puppeteer from "puppeteer-core";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { todayKST, stageFor } = await import("../../src/lib/dot/bond");
const { FACE_KEYS, faceStage } = await import("../../src/lib/dot/stickers");

const BASE = process.env.DOT_BASE ?? "http://localhost:3000";
const OUT = "C:/Users/az518/Desktop/로키-도트/이모티콘-20261110";
mkdirSync(OUT, { recursive: true });
const db = createServiceClient();
const { data: c } = await db.from("dot_characters").select("id, slug, name").eq("slug", "rin").single();

const 적은것: string[] = [];
let 나쁨 = 0;
const 재기 = (맞음: boolean, 말: string) => { if (!맞음) 나쁨++; 적은것.push(`${맞음 ? "✅" : "❌"} ${말}`); };

async function 한판(점수: number, 이름: string) {
  const 메일 = `stk-${점수}-${Date.now()}@dugeun.local`;
  const { data: 만든것 } = await db.auth.admin.createUser({ email: 메일, password: `t-${Math.random().toString(36).slice(2)}!A1`, email_confirm: true });
  const USER = 만든것!.user!.id;
  await db.from("dot_usage").upsert({ user_id: USER, day: todayKST(), turns: 0, bonus_turns: 20, ad_refills: 0 }, { onConflict: "user_id,day" });
  await db.from("dot_bonds").upsert({ user_id: USER, character_id: c!.id, points: 점수, stage: stageFor(점수), streak_days: 1, last_talked_on: todayKST() }, { onConflict: "user_id,character_id" });
  const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email: 메일 });

  const browser = await puppeteer.launch({
    executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true, userDataDir: `${process.env.TEMP}/rk-hl-stk-${점수}-${process.pid}`, args: ["--no-first-run", "--lang=ko-KR"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    page.setDefaultNavigationTimeout(180_000);
    await page.goto(`${BASE}/auth/confirm?token_hash=${link!.properties!.hashed_token}&type=magiclink&next=/dot/${c!.slug}`, { waitUntil: "domcontentloaded" });
    await page.goto(`${BASE}/dot/${c!.slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('button[aria-label="스티커"]:not([disabled])', { timeout: 120_000 });
    for (const b of await page.$$("button")) {
      const t = await page.evaluate((e) => e.textContent ?? "", b);
      if (t.includes("알겠어요")) { await b.click(); break; }
    }
    await new Promise((r) => setTimeout(r, 500));
    /**
     * **개발 서버의 표시등을 치운다** (11-10).
     *
     * `npm run dev` 는 왼쪽 아래 구석에 `<nextjs-portal>` 을 띄운다. 그게 입력줄 왼쪽 단추(선물)를
     * 정확히 덮어서, 눌러도 **표시등이 눌렸다.** 자는 "선물 서랍이 안 열린다" 고 적었는데
     * 제품은 멀쩡했다 — 배포본엔 이 덮개가 없다. 재는 화면에만 있는 것을 제품 고장으로 읽지 않는다.
     */
    await page.evaluate(() => { for (const el of document.querySelectorAll("nextjs-portal")) el.remove(); });
    await (await page.$('button[aria-label="스티커"]'))!.click();
    await page.waitForSelector(".kk-stk", { timeout: 20_000 });
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/${이름}.png` });

    /* 11-10 해금 판: 칸은 늘 여섯이고 **잠긴 수**가 단계에 따라 달라진다. */
    const 칸 = await page.$$eval(".kk-stk-grid button", (e) => e.length);
    재기(칸 === 6, `${이름}: 표정 6칸 (본 것 ${칸})`);
    const 머리 = await page.$eval(".kk-stk-tabname", (e) => (e.textContent ?? "").trim());
    재기(/[0-9]\/6 열림/.test(머리), `${이름}: 아래 띠에 n/6 열림 (${머리})`);
    const 자물쇠 = await page.$$eval(".kk-lock", (e) => e.length);
    /* 가로 넘침 — 390 폭에서 서랍이 밖으로 나가면 안 된다. */
    const 넘침 = await page.$$eval(".kk-stk", (e) => e.map((x) => Math.round(x.scrollWidth - x.clientWidth)));
    재기(넘침.every((n) => n <= 1), `${이름}: 가로 넘침 ${넘침.join(",")}px`);
    /* 서랍 높이 — 화면의 절반을 넘으면 대화가 안 보인다. */
    const 높이 = await page.$eval(".kk-stk", (e) => Math.round(e.getBoundingClientRect().height));
    재기(높이 <= 844 * 0.5, `${이름}: 서랍 높이 ${높이}px (≤422)`);

    /* 선물 서랍도 **같은 결**이어야 한다(11-10) — 한 번 들어온 김에 같이 찍는다. */
    const 선물단추 = await page.$('button[aria-label="선물"]');
    재기(!!선물단추, `${이름}: 선물 단추가 있다`);
    await 선물단추?.click();
    await new Promise((r) => setTimeout(r, 400));
    const 선물판 = await page.$(".kk-gifts");
    재기(!!선물판, `${이름}: 선물 서랍이 열린다`);   // 못 보면 **못 본 것으로 적는다** — 건너뛰면 0 이 통과가 된다
    if (!선물판) {
      const 왜 = await page.evaluate(() => ({
        스티커판: !!document.querySelector(".kk-stk"),
        막힘: (document.querySelector('button[aria-label="선물"]') as HTMLButtonElement | null)?.disabled,
        클래스: [...document.querySelectorAll("[class*=kk-gift]")].map((e) => e.className).slice(0, 3),
      }));
      const 가린것 = await page.evaluate(() => {
        const b = document.querySelector('button[aria-label="선물"]') as HTMLElement | null;
        if (!b) return "단추 없음";
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null;
        return { 자리: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
          창: [window.innerWidth, window.innerHeight],
          그자리에있는것: el ? `${el.tagName}.${el.className}` : "없음" };
      });
      console.log("  (왜 안 열렸나)", JSON.stringify(왜), JSON.stringify(가린것));
      await page.screenshot({ path: `${OUT}/${이름}-선물안열림.png` });
    }
    if (선물판) {
      await page.screenshot({ path: `${OUT}/${이름}-선물.png` });
      const 선물넘침 = await page.$eval(".kk-gifts", (e) => Math.round(e.scrollWidth - e.clientWidth));
      재기(선물넘침 <= 1, `${이름}: 선물 서랍 가로 넘침 ${선물넘침}px`);
      const 값 = await page.$$eval(".kk-gift-price", (e) => e.map((x) => (x.textContent ?? "").trim()));
      재기(값.length === 5 && 값.every((v) => v.includes("하트")), `${이름}: 선물 값이 하트로 보인다 (${값.join(",")})`);
      /* 11-10: 선물 그림이 **실제로 그려졌나**. src 가 있어도 404 면 naturalWidth 가 0 이다 —
         "넣었다" 와 "보인다" 는 다르다([[art-urls-must-be-knocked]]). */
      const 그림 = await page.$$eval(".kk-gift-img", (e) => e.map((x) => (x as HTMLImageElement).naturalWidth));
      재기(그림.length === 5 && 그림.every((w) => w > 0), `${이름}: 선물 그림 5개가 그려진다 (${그림.join(",")})`);
    }
    return { 자물쇠, 높이 };
  } finally { await browser.close(); }
}

const 잠김 = await 한판(100, "1-잠김(2단계)");
/* 2단계 = 무표정·웃음·부끄가 열리고 시무룩·삐짐·놀람이 잠긴다. 기대값은 **손으로 세지 않고**
   단계표에서 뽑는다 — 11-10 에 손으로 세다 두 번 틀렸다([[constant-failure-means-a-rule-bug]]). */
const 잠겨야 = FACE_KEYS.filter((e) => faceStage(e) > 2).length;
재기(잠김.자물쇠 === 잠겨야, `2단계면 자물쇠 ${잠겨야}개 (본 것 ${잠김.자물쇠})`);
const 열림 = await 한판(1200, "2-열림(5단계)");
재기(열림.자물쇠 === 0, `열렸을 때 자물쇠 0개 (본 것 ${열림.자물쇠})`);

console.log(적은것.join("\n"));
console.log(`\n사진: ${OUT}`);
process.exit(나쁨 ? 1 : 0);
