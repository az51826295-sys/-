import type { Metadata } from "next";
import { langFromCookie } from "@/lib/dot/langServer";
import PixelClient from "./PixelClient";

/**
 * **진짜 도트 변환** (11-24 사장님: "AI 로 뽑으니까 진짜 도트가 아니더라 · 이 웹사이트에서 진짜 도트로 · 4,900원").
 * 미리보기는 무료(줄무늬), 받기는 한 장씩 — 10장 4,900원. 두근도트 손님 계정을 그대로 쓴다(장수가 이 기기에 남는다).
 * `/dot` 밖에 둔다 — 그 아래는 출석 판이 뜨는 앱 화면이다.
 */
export const metadata: Metadata = {
  title: "진짜 도트 변환 · Real Pixel",
  description: "AI가 뽑은 '도트 같은 그림'을 한 칸 = 한 색인 진짜 도트로. 미리보기 무료.",
  // 11-24: 링크 카드가 사이트 기본("Dot — Chat with pixel characters")으로 떠서 스레드 글에 엉뚱한 카드가 붙었다 → 이 페이지 것으로 덮는다.
  openGraph: {
    type: "website",
    siteName: "두근도트",
    title: "진짜 도트 변환",
    description: "AI가 뽑은 도트 그림을 한 칸 = 한 색인 진짜 도트로. 미리보기 무료.",
    url: "/pixel",
    images: [{ url: "/pixel-og.png", width: 1200, height: 630, alt: "AI 원본과 진짜 도트를 확대해 나란히 비교" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "진짜 도트 변환",
    description: "AI가 뽑은 도트 그림을 한 칸 = 한 색인 진짜 도트로. 미리보기 무료.",
    images: ["/pixel-og.png"],
  },
};

export default async function PixelPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { paid } = await searchParams;
  const en = (await langFromCookie()) === "en";
  return <PixelClient en={en} paid={paid ?? null} />;
}
