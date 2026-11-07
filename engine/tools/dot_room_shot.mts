/**
 * **대화방 화면 한 장** — 한도에 닿은 자리(광고 단추 포함)를 폰 크기로 (11-05).
 *
 *   npx tsx engine/tools/dot_room_shot.mts
 *
 * `dot_limit_card_shot.mts` 는 카드만 봤다. 사장님이 보고 싶은 것은 **창 전체**다 —
 * 카드가 방 안에서 어떤 크기로, 말풍선들 아래 어디에 앉는가.
 *
 * ## 정직하게: 한 곳을 손으로 붙인다
 *
 * 카드는 `mounted` 가 참일 때만 그려진다(하이드레이션 안전장치) → 서버 렌더에 안 나온다.
 * 그래서 **방을 렌더한 HTML** 의 메시지 목록 끝에 **`LimitCard` 를 렌더한 HTML** 을 끼운다.
 * 둘 다 제품 컴포넌트가 낸 것이고, 끼우는 자리는 제품이 그리는 자리와 같다 —
 * 내가 하는 일은 브라우저에서 `mounted` 가 참이 되는 것을 대신하는 것뿐이다.
 * (베껴 적은 HTML 은 한 줄도 없다. 베끼면 제품이 바뀐 날 사진만 맞는다.)
 *
 * 그림은 **진짜 주소**를 그대로 쓴다(운영 서버의 스프라이트) — 깨진 그림도 보이게.
 */
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
/** 11-06: 화면 점검과 **같은 자**를 댄다. 광고 단추가 그려진 방은 서버에서 보려면
 *  한도에 닿은 계정을 공유 DB 에 심어야 해서, 조각으로 그린 이 방이 그 화면을 재는 유일한 자리다. */
import { CHECK_CODE, split, group, dotSkin, type Measured } from "./dot_ui_checks.js";

const OUT = "C:/Users/az518/Desktop/두근도트-광고단추";
mkdirSync(OUT, { recursive: true });

const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
const mod = await import("../../src/app/dot/[slug]/DotChat");
const DotChat = mod.default, LimitCard = mod.LimitCard;
const { AUTO_HEARTS_PER_DAY, CHECKIN_HEARTS } = await import("../../src/lib/dot/bond");
const { AD_REFILLS_PER_DAY } = await import("../../src/lib/dot/money");

/** 캐릭터는 **진짜 표에서** 가져온다. 지어낸 캐릭터로 찍으면 그림이 다 깨진 사진이 나온다. */
const r = await fetch(`${vars.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/dot_characters?select=*&is_public=is.true&limit=5`, {
  headers: { apikey: vars.SUPABASE_SECRET_KEY, authorization: `Bearer ${vars.SUPABASE_SECRET_KEY}` },
});
const 다 = await r.json() as Record<string, never>[];
const who = 다.find((c) => Object.keys(c.sprites ?? {}).length > 0);
if (!who) { console.log("  ❌ 그림 있는 캐릭터가 표에 없다 — 사진을 안 찍는다"); process.exit(1); }
console.log(`  캐릭터: ${who.name} (${who.slug})`);

const 어제 = new Date(Date.now() - 3 * 60 * 1000).toISOString();
const history = [
  { role: "assistant", content: "왔네. 오늘 학교는 어땠어?", emotion: "happy", at: 어제 },
  { role: "user", content: "그냥 그랬어 시험기간이라 죽겠다", emotion: null, at: 어제 },
  { role: "assistant", content: "고생했어…\n많이 힘들면 나한테 다 말해도 돼", emotion: "sad", at: 어제 },
  { role: "user", content: "응 고마워", emotion: null, at: 어제 },
];

/** 남은 하트를 바꿔 렌더한다 — 0개(벽)와 3개(벽 앞)는 **다른 화면**이다(11-06 광고 자리). */
const 방 = (하트: number) => renderToStaticMarkup(React.createElement(DotChat, {
  signedIn: true, who, bond: { points: 140, stage: 3, streakDays: 4, toNext: { need: 260, total: 280 } },
  remaining: 하트, history, limit: AUTO_HEARTS_PER_DAY,
  account: { linked: true, email: "me@example.com" },
  balance: { remaining: 하트, freeLeft: 하트, credits: 0, adLeft: AD_REFILLS_PER_DAY, menheraUntil: null, 출석함: 하트 > 0 },
  adOpen: true,
} as never));

/** 카드는 두 얼굴이다(11-06) — **출석 전**(하트 받는 문)과 **출석 후**(다 씀). 둘 다 잰다. */
const 카드 = (adOpen: boolean, checkedIn = true) => renderToStaticMarkup(React.createElement(LimitCard, {
  name: who.name as unknown as string, checkedIn, checkinHearts: CHECKIN_HEARTS, checkinBusy: false, adOpen,
  adLeft: AD_REFILLS_PER_DAY, adBusy: false, push: "off",
  onCheckIn: () => {}, onAd: () => {}, onPush: () => {},
}));

/** 메시지 목록의 끝 표시(`<div ref={endRef}>`)가 제품이 카드를 그리는 바로 뒤다. 그 앞에 끼운다. */
function 끼우기(html: string, card: string) {
  const i = html.lastIndexOf("<div></div>");   // endRef 자리 — 빈 div
  if (i < 0) return null;
  return html.slice(0, i) + card + html.slice(i);
}

/**
 * **입력 줄 뒤**가 제품이 하트 광고 단추를 그리는 자리다(`.kk-foot` 다음, 같은 부모).
 * 입력 줄 안에는 단추·입력칸뿐이라 그 뒤 첫 `</div>` 가 입력 줄의 닫는 태그다.
 */
const 하트광고 = renderToStaticMarkup(React.createElement(mod.AdNudge, {
  adLeft: AD_REFILLS_PER_DAY, adBusy: false, onAd: () => {},
}));
function 끼우기_입력뒤(html: string, 조각: string) {
  const i = html.indexOf('class="kk-input-row"');
  if (i < 0) return null;
  const j = html.indexOf("</div>", i);
  if (j < 0) return null;
  return html.slice(0, j + 6) + 조각 + html.slice(j + 6);
}

const 껍데기 = await dotSkin();
const 프로필 = `${process.env.TEMP}/rk-hl-roomshot-${process.pid}`;   // rk-hl- = 내 것
const browser = await puppeteer.launch({
  executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, userDataDir: 프로필, args: ["--no-first-run", "--lang=ko-KR"],
});
const 적은것: string[] = [];
try {
  /**
   * 재는 자리 셋 — **벽**(하트 0, 광고 켜짐/꺼짐)과 **벽 앞**(하트 3).
   * 셋째가 11-06 에 생긴 자리다: 한도에 닿는 날이 0일이라 벽 안의 단추는 아무도 못 봤다.
   */
  const 판: [string, string | null, string | null][] = [
    ["방-출석전", 끼우기(방(0), 카드(true, false)), ".kk-limit-btn"],
    ["방-광고켜짐", 끼우기(방(0), 카드(true)), ".kk-limit-ad"],
    ["방-광고꺼짐", 끼우기(방(0), 카드(false)), null],
    ["방-하트3-광고켜짐", 끼우기_입력뒤(방(3), 하트광고), ".kk-foot-ad"],
  ];
  for (const [이름, html, 어디] of 판) {
    if (!html) { 적은것.push(`❌ ${이름}: 끼울 자리를 못 찾았다 — 사진이 거짓이 된다`); continue; }
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    /* 껍데기를 입혀서 잰다 — `/dot` 레이아웃과 같은 순서(화면 CSS 뒤에 PIXEL_CSS). */
    await page.setContent(`<!doctype html><meta charset="utf-8">${껍데기.앞}<body style="margin:0">${html}${껍데기.뒤}</body>`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    /* 방은 아래가 "지금" 이다 — 카드가 보이게 끝까지 내린다. */
    await page.evaluate(() => { for (const el of document.querySelectorAll("*")) if (el.scrollHeight > el.clientHeight + 8) el.scrollTop = el.scrollHeight; });
    const 잰것 = await page.evaluate((sel: string) => {
      const b = document.querySelector(sel) as HTMLElement | null;
      const r2 = b?.getBoundingClientRect();
      const 깨짐 = [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).length;
      return {
        광고: r2 ? { w: Math.round(r2.width), h: Math.round(r2.height), 보임: r2.top >= 0 && r2.bottom <= window.innerHeight } : null,
        깨진그림: 깨짐, 넘침: document.documentElement.scrollWidth > window.innerWidth,
      };
    }, 어디 ?? ".kk-limit-ad");
    const 전체 = await page.evaluate(CHECK_CODE) as Measured;
    await page.screenshot({ path: `${OUT}/${이름}.png` });
    await page.close();
    const { 어긋남, 아슬 } = split(전체.작음);
    const 맞나 = (어디 !== null ? !!잰것.광고 && 잰것.광고.보임 && 잰것.광고.h >= 44 : !잰것.광고)
      && 잰것.깨진그림 === 0 && !잰것.넘침 && 어긋남.length === 0 && 전체.빈단추.length === 0;
    적은것.push(`${맞나 ? "✅" : "❌"} ${이름}: 광고 ${잰것.광고 ? `${잰것.광고.w}×${잰것.광고.h}px 화면 안 ${잰것.광고.보임}` : "없음"}` +
      ` · 깨진 그림 ${잰것.깨진그림}` + (잰것.넘침 ? " ⚠ 가로 넘침" : "") +
      ` · 24px 미만 ${어긋남.length}${어긋남.length ? ` (${group(어긋남).join(", ")})` : ""}` +
      ` · 이름 없는 단추 ${전체.빈단추.length}${전체.빈단추.length ? ` (${전체.빈단추.slice(0, 2).join(", ")})` : ""}` +
      `\n      아슬(24~44): ${아슬.length ? group(아슬).join(" · ") : "없음"}`);
  }
} finally {
  await browser.close();
  rmSync(프로필, { recursive: true, force: true });
}
for (const s of 적은것) console.log("  " + s);
console.log(`사진: ${OUT}`);
process.exit(적은것.every((s) => s.startsWith("✅")) ? 0 : 1);
