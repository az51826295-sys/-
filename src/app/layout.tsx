import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/core";

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

/** 10-13 다국어: 홈 화면·검색에 나오는 이름과 설명도 언어를 따른다. 두근도트라는 이름은 그대로 두고 옆에 읽는 법을 단다. */
const DOT_META: Record<Locale, { title: string; description: string }> = {
  ko: { title: "두근도트", description: "도트 캐릭터와 이야기하는 앱. 친해질수록 말투와 표정이 바뀝니다." }, // i18n-skip (한국어 칸)
  en: { title: "Dugeun Dot", description: "Chat with pixel characters. The closer you get, the more their tone and faces change." },
  ja: { title: "ドゥグンドット", description: "ドットキャラとおしゃべりするアプリ。仲良くなるほど話し方や表情が変わります。" },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (두근도트) {
    const m = DOT_META[locale];
    return {
      title: m.title,
      description: m.description,
      appleWebApp: {
        capable: true,
        title: m.title,
        // 흰 바탕 앱이라 글자가 검게 나오는 쪽.
        statusBarStyle: "default",
      },
      icons: { apple: [{ url: "/dot-apple-touch-icon.png", sizes: "180x180" }] },
    };
  }
  return {
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
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><LocaleProvider locale={locale}>{children}</LocaleProvider></body>
    </html>
  );
}
