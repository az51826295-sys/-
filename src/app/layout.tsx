import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { realAdsenseClient } from "@/lib/dot/money";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * **어느 제품인가.** `login/page.tsx` 와 같은 자를 쓴다 — `PRODUCT === "dot"` 일 때만 두근도트다.
 *
 * 처음엔 `!== "rookery"` 로 적었는데, 그러면 PRODUCT 를 안 준 **내 컴퓨터에서 로키가 두근도트 행세**를 한다
 * (`/ask` 를 열었는데 홈 화면 앱 이름이 "두근도트" 로 나왔다). 기본값은 **로키**여야 한다 —
 * 두근도트 서버는 PRODUCT=dot 을 실제로 주고 있다.
 */
const 두근도트 = process.env.PRODUCT === "dot";

/** 소유 확인 태그에 적을 번호 — **진짜 번호만**(시험용 자리맡이는 빈 값, `money.ts`). */
const ADSENSE_CLIENT = realAdsenseClient();

/**
 * **아이폰에서 앱처럼 열리게** (228회차 10-03, 사장님 "애플에서 쓰는 거에도 올리자").
 *
 * 아이폰은 안드로이드와 다르다 — **매니페스트의 `display: standalone` 을 안 본다.**
 * 그래서 홈 화면에 담아도 주소창이 그대로 남고, 사람은 "앱이 아니네" 하고 지운다.
 * 아이폰에서 앱처럼 열리게 하는 것은 아래 셋이고, **셋 다 빠져 있었다**:
 *
 *  1. `viewport-fit: cover` — 이게 없으면 `env(safe-area-inset-*)` 가 **전부 0** 이다.
 *     `DotTabs.tsx` 와 `DotChat.tsx` 에 아래 여백을 넣어 뒀는데, 아이폰에서는 **한 번도 먹은 적이 없다** —
 *     홈 인디케이터(아래 막대)에 입력칸이 깔려 있었다는 뜻이다.
 *  2. `appleWebApp.capable` — 주소창을 없앤다(안드로이드의 standalone 자리).
 *  3. `apple-touch-icon` 180x180 — 없으면 아이폰이 **화면을 찍어서 아이콘으로 쓴다.**
 *
 * 세 줄이라 스토어와 상관없이 **오늘 바로** 폰에 담아 쓸 수 있다. 스토어는 그다음 문제다.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 노치·홈 인디케이터 밑까지 화면을 쓰고, 여백은 safe-area 로 받는다.
  viewportFit: "cover",
  themeColor: 두근도트 ? "#ffffff" : "#0a0a0a",
};

export const metadata: Metadata = 두근도트
  ? {
      title: "두근도트",
      description: "도트 캐릭터와 이야기하는 앱. 친해질수록 말투와 표정이 바뀝니다.",
      appleWebApp: {
        capable: true,
        title: "두근도트",
        // 흰 바탕 앱이라 글자가 검게 나오는 쪽.
        statusBarStyle: "default",
      },
      icons: { apple: [{ url: "/dot-apple-touch-icon.png", sizes: "180x180" }] },
      /**
       * **AdSense 가 "이 사이트가 당신 것인가" 를 확인하는 자리** (11-10).
       *
       * 심사는 세 길 중 하나로 소유를 확인한다 — 광고 코드 조각 · `ads.txt` · **이 메타 태그**.
       * 우리 광고 스크립트는 **사람이 하트 판을 열 때** 붙으므로(`adbreak.ts`), 첫 화면만 긁는
       * 심사 크롤러는 그것을 못 본다. `ads.txt` 는 준비해 뒀지만 길이 하나뿐이면 막혔을 때
       * 왜 막혔는지 모른다. 태그는 한 줄이고 **번호가 없으면 안 그려진다.**
       */
      ...(ADSENSE_CLIENT ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {}),
    }
  : {
      title: "Rookery",
      // Paddle 심사(09-14, 5번째 거절 "not a digital product or service"): "Hire AI employees" 가 사람 고용 서비스로 읽힐 수 있다 → 소프트웨어라고 말한다.
      description: "AI software (SaaS) that turns requests into finished digital work — research, documents, small web apps and short explainer videos.",
      appleWebApp: {
        capable: true,
        title: "Rookery",
        // 까만 바탕이라 상태줄도 까맣게 이어 붙인다.
        statusBarStyle: "black-translucent",
      },
      icons: { apple: [{ url: "/rookery-apple-touch-icon.png", sizes: "180x180" }] },
    };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
