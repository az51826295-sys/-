"use client";

import type { AdConf } from "./money";

/**
 * **광고를 실제로 띄우는 자리** (11-07 사장님 "광고 그 플레이 스토어에 올려줘").
 *
 * 어제까지 `watchAd()` 안에는 주석만 있었다 — *"여기에 광고 SDK 가 들어온다"*. 그래서
 * 단추를 누르면 **광고 없이 하트가 찼다.** 스위치(`AD_REWARD_OPEN`)를 꺼 둔 유일한 까닭이 그것이었다.
 *
 * ## 왜 AdSense H5(Ad Placement API) 인가 — 길이 셋뿐이고 둘은 막혀 있다
 *
 * 플레이 스토어의 두근도트는 **TWA**(앱이 웹을 그대로 띄운다, `dot-android/app/build.gradle`).
 * 그래서 안드로이드 SDK 를 넣을 자리가 없다:
 *
 * | 길 | 되나 |
 * |---|---|
 * | AdMob 안드로이드 SDK | ❌ TWA 는 크롬이 그린다. 네이티브 코드가 웹 위에 광고를 못 올린다 |
 * | WebView 앱으로 다시 만들기 + AdMob | ⚠ 되지만 앱을 새로 쓰고 TWA 를 버려야 한다 |
 * | **AdSense H5 Games Ads(웹)** | ✅ 구글이 **TWA 를 허용 자리로 문서에 적어 뒀다** |
 *
 * 세 번째가 유일하게 앱을 안 건드리는 길이다. 구글 문서가 안드로이드의 허용 자리로
 * *"Chrome Custom Tabs and Trusted Web Activities"* 를 명시한다
 * (support.google.com/admanager/answer/6310245). 그래서 **올릴 APK 가 없다** —
 * 웹에 붙으면 앱 안에서도 그대로 뜬다.
 *
 * ## 한 가지는 끝내 못 믿는다
 *
 * 보상을 주는 쪽은 **브라우저**다(`adViewed`). AdMob 보상형의 SSV(구글이 우리 서버를 직접
 * 두드리는 콜백)가 H5 에는 없다. 그래서 난간은 **하루 상한 5번**뿐이다 — 거짓으로 끝까지
 * 새도 하루 5하트(2.3원)다. 상한이 이미 돈을 막고 있으므로 이 길로 간다.
 * 다만 **끝까지 안 본 광고로는 안 준다** — 그건 코드로 가른다(`dismissed` / `nofill`).
 */

/** 광고 한 번의 결과. `viewed` 만 하트를 준다. */
export type AdResult = "viewed" | "dismissed" | "nofill";

type AdBreakOpts = {
  type: "reward" | "browse" | "start" | "pause" | "next";
  name: string;
  beforeReward?: (showAdFn: () => void) => void;
  adViewed?: () => void;
  adDismissed?: () => void;
  afterAd?: () => void;
  adBreakDone?: (info: { breakStatus?: string }) => void;
};

type Pushable = AdBreakOpts | Record<string, unknown>;

declare global {
  interface Window {
    adsbygoogle?: Pushable[];
    adBreak?: (o: AdBreakOpts) => void;
    adConfig?: (o: Record<string, unknown>) => void;
    /** 시험용 틈 — 자가 가짜 광고망을 끼워 넣는 자리(`dot_ad_show_test.mts`). 제품 코드는 안 쓴다. */
    __dotAdFake?: (o: AdBreakOpts) => void;
  }
}

const SRC = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
let 부르는중: Promise<boolean> | null = null;

/**
 * 구글 스크립트를 **한 번만** 불러온다. 구글이 적어 둔 순서를 지킨다:
 * `adBreak`/`adConfig` 를 **먼저** 큐로 만들어 두고 스크립트를 붙인다 — 그래야 로드 전에
 * 누른 것이 사라지지 않는다. 로드가 끝나면 라이브러리가 이 둘을 자기 것으로 갈아 끼운다.
 */
export function loadAds(conf: AdConf): Promise<boolean> {
  if (부르는중) return 부르는중;
  부르는중 = new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") { resolve(false); return; }
    const queue: Pushable[] = window.adsbygoogle ?? [];
    window.adsbygoogle = queue;
    const push = (o: Pushable) => { queue.push(o); };
    window.adBreak = push as (o: AdBreakOpts) => void;
    window.adConfig = push as (o: Record<string, unknown>) => void;

    const s = document.createElement("script");
    s.src = `${SRC}?client=${encodeURIComponent(conf.client)}`;
    s.async = true;
    s.crossOrigin = "anonymous";
    /* 전면 광고 사이 최소 간격. 보상형은 사람이 눌러서 뜨므로 이 값에 안 걸린다. */
    s.setAttribute("data-ad-frequency-hint", "30s");
    /* 시험 모드: 구글 서버에 **광고 요청을 안 보내고** 가짜 광고를 띄운다. 계정이 없어도 돌아간다.
       띄워 주는 것과 안 띄워 주는 것을 번갈아 주기 때문에 "광고 없음" 길도 같이 잴 수 있다. */
    if (conf.test) s.setAttribute("data-adbreak-test", "on");
    s.onload = () => {
      try { window.adConfig?.({ preloadAdBreaks: "on", sound: "on" }); } catch { /* 설정은 못 해도 광고는 뜬다 */ }
      resolve(true);
    };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return 부르는중;
}

/**
 * 보상형 광고 한 번. **끝까지 본 것만** `viewed` 다.
 *
 * 세 갈래로만 끝난다 — 중간에 멈춰 있지 않는다(멈추면 단추가 영원히 "불러오는 중"이 된다).
 *  · `viewed`    끝까지 봤다 → 서버에 충전을 부른다
 *  · `dismissed` 중간에 닫았다 → **안 준다**
 *  · `nofill`    보여줄 광고가 없다 / 스크립트가 막혔다(차단기·망) → 안 준다, 말은 다르게 한다
 */
export function showRewardedAd(conf: AdConf, name = "heart-refill"): Promise<AdResult> {
  return new Promise<AdResult>((resolve) => {
    let 끝났다 = false;
    let 시계: ReturnType<typeof setTimeout>;
    const 끝 = (r: AdResult) => {
      if (끝났다) return;        // adBreakDone 은 adViewed 뒤에도 불린다 — 먼저 온 것만 센다
      끝났다 = true;
      clearTimeout(시계);
      resolve(r);
    };
    /* 광고가 뜨기 전 20초 안에 아무 소식이 없으면 없는 것으로 본다. */
    시계 = setTimeout(() => 끝("nofill"), 20_000);

    const 주문: AdBreakOpts = {
      type: "reward",
      name,
      beforeReward: (showAdFn) => {
        /* 여기까지 왔으면 광고는 있다. 사람이 보는 동안은 넉넉히 기다린다. */
        clearTimeout(시계);
        시계 = setTimeout(() => 끝("nofill"), 600_000);
        showAdFn();
      },
      adViewed: () => 끝("viewed"),
      adDismissed: () => 끝("dismissed"),
      adBreakDone: () => 끝("nofill"),
    };

    /* 자가 끼워 둔 가짜 광고망이 있으면 그것을 쓴다 — 구글 스크립트 없이 **판단**을 잴 수 있다.
       `conf.test` 일 때만 본다: 제품(시험 모드 꺼짐)에서는 이 틈이 **죽어 있다.** */
    if (conf.test && typeof window !== "undefined" && typeof window.__dotAdFake === "function") {
      try { window.__dotAdFake(주문); } catch { 끝("nofill"); }
      return;
    }

    loadAds(conf).then((ok) => {
      if (!ok || typeof window.adBreak !== "function") { 끝("nofill"); return; }
      try { window.adBreak(주문); } catch { 끝("nofill"); }
    }).catch(() => 끝("nofill"));
  });
}

/** 광고 결과를 사람 말로. `viewed` 는 서버가 센 잔고로 말하니 여기 없다. */
export const AD_FAIL_COPY: Record<Exclude<AdResult, "viewed">, string> = {
  dismissed: "광고를 끝까지 봐야 하트를 받아요",
  nofill: "지금은 보여줄 광고가 없어요. 조금 뒤에 다시 눌러 주세요",
};
