/**
 * 한도 카드를 **진짜 컴포넌트로 그려서** 사진 한 장 (11-04 광고 단추).
 *
 *   npx tsx engine/tools/dot_limit_card_shot.mts
 *
 * 왜 이렇게 재나: 단추가 **그려지는지**는 코드를 읽어선 모른다([[unrun-code-is-unmeasured]]).
 * 진짜 대화방을 열려면 로그인한 사람 + 한도를 다 쓴 상태 + 켜진 스위치가 다 필요한데,
 * 카드 자체는 들어온 값만 보고 그려진다. 그래서 **제품의 `LimitCard` 를 그대로** 렌더한다.
 * CSS 는 `DotChat` 을 통째로 렌더해서 그 안의 `<style>` 을 꺼내 쓴다 — 베껴 적지 않는다.
 *
 * 못 보는 것(정직하게): 누르는 것·광고 호출·토스트. 그건 `dot_ad_route_test.mts` 가 잰다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import puppeteer from "puppeteer-core";
import { mkdirSync, rmSync } from "node:fs";

const OUT = "C:/Users/az518/Desktop/두근도트-광고단추";
mkdirSync(OUT, { recursive: true });

const mod = await import("../../src/app/dot/[slug]/DotChat");
const DotChat = mod.default, LimitCard = mod.LimitCard;
const { FREE_TURNS_PER_DAY } = await import("../../src/lib/dot/bond");
const { AD_REFILLS_PER_DAY } = await import("../../src/lib/dot/money");

/** CSS — 제품 화면을 통째로 렌더해서 그 안의 `<style>` 을 꺼낸다. */
const 전체 = renderToStaticMarkup(React.createElement(DotChat, {
  signedIn: true,
  who: { id: "x", slug: "yuna", name: "유나", tagline: "", greeting: "", sprites: { neutral: "" }, faces: { neutral: "" } },
  bond: { points: 0, stage: 1, streakDays: 0, toNext: null },
  remaining: 0, history: [], limit: FREE_TURNS_PER_DAY,
  account: { linked: true, email: null },
  balance: { remaining: 0, freeLeft: 0, credits: 0, adLeft: 0, menheraUntil: null, 구독중: false },
} as never));
const style = [...전체.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join("");
if (!style) { console.log("  ❌ DotChat 에서 <style> 을 못 꺼냈다 — 사진이 거짓이 된다. 멈춘다."); process.exit(1); }

const 카드 = (adOpen: boolean, adLeft: number) =>
  renderToStaticMarkup(React.createElement(LimitCard, {
    name: "유나", limit: FREE_TURNS_PER_DAY, adOpen, adLeft, adBusy: false,
    push: "off", onPay: () => {}, onAd: () => {}, onPush: () => {},
  }));

/** 대화방과 같은 배경·폭(390px 폰)에 올린다. 흰 바탕에 띄우면 카드 테두리가 안 보인다. */
const 껍데기 = (속: string) => `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=390,initial-scale=1">
<body style="margin:0;background:#b2c7d9;font-family:system-ui,sans-serif;padding:16px 0">
<div style="display:flex;flex-direction:column;align-items:center">${style}${속}</div></body>`;

const 프로필 = `${process.env.TEMP}/rk-hl-adshot-${process.pid}`;   // rk-hl- 로 시작 = 내 것
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: 프로필, args: ["--no-first-run", "--lang=ko-KR"],
});
const 적은것: string[] = [];
try {
  for (const [이름, adOpen, adLeft] of [["광고꺼짐", false, 0], ["광고켜짐", true, AD_REFILLS_PER_DAY]] as const) {
    const html = 카드(adOpen, adLeft);
    const 있나 = html.includes("kk-limit-ad");
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 560, deviceScaleFactor: 2 });
    await page.setContent(껍데기(html), { waitUntil: "domcontentloaded" });
    const 잰것 = await page.evaluate(() => {
      const b = document.querySelector(".kk-limit-ad") as HTMLElement | null;
      const 구독 = document.querySelector(".kk-limit-btn") as HTMLElement | null;
      const r = b?.getBoundingClientRect(), s = 구독?.getBoundingClientRect();
      return {
        넘침: document.documentElement.scrollWidth > window.innerWidth,
        광고: r ? { w: Math.round(r.width), h: Math.round(r.height), text: (b!.textContent ?? "").trim() } : null,
        /* 광고가 구독 **아래**인가 — 순서가 뒤집히면 공짜가 위라 아무도 구독을 안 본다. */
        아래: !!r && !!s && r.top > s.top,
      };
    });
    await page.screenshot({ path: `${OUT}/${이름}.png` });
    await page.close();
    const 맞나 = adOpen
      /* 44px — 회사 기준(dot_ui_audit ⑤). 처음에 36 으로 뒀는데 그건 자를 제품보다
         느슨하게 둔 것이다: 37px 단추가 이 자는 통과하고 화면 점검에는 걸린다. */
      ? 있나 && !!잰것.광고 && 잰것.광고.h >= 44 && 잰것.아래 && !잰것.넘침
      : !있나 && !잰것.넘침;
    적은것.push(`${맞나 ? "✅" : "❌"} ${이름}: 광고 단추 ${있나 ? "있음" : "없음"}` +
      (잰것.광고 ? ` ${잰것.광고.w}×${잰것.광고.h}px · 구독 아래 ${잰것.아래} · "${잰것.광고.text}"` : "") +
      (잰것.넘침 ? " ⚠ 가로 넘침" : ""));
  }
} finally {
  await browser.close();
  rmSync(프로필, { recursive: true, force: true });
}
for (const s of 적은것) console.log("  " + s);
console.log(`사진: ${OUT}`);
process.exit(적은것.every((s) => s.startsWith("✅")) ? 0 : 1);
