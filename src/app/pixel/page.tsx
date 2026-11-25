import type { Metadata } from "next";
import { langFromCookie } from "@/lib/dot/langServer";
import PixelClient from "./PixelClient";

/**
 * **진짜 도트 변환** (11-24 사장님: "AI 로 뽑으니까 진짜 도트가 아니더라 · 이 웹사이트에서 진짜 도트로 · 4,900원").
 * 미리보기는 무료(줄무늬), 받기는 한 장씩 — 10장 4,900원. 두근도트 손님 계정을 그대로 쓴다(장수가 이 기기에 남는다).
 * `/dot` 밖에 둔다 — 그 아래는 출석 판이 뜨는 앱 화면이다.
 */
export const metadata: Metadata = {
  title: "도트 작업실 — 글 한 줄로 게임 도트 캐릭터",
  description: "글 한 줄이면 게임용 도트 캐릭터. 앞·옆·뒤 4방향과 움직임까지, 내 게임 그림체에 맞춰서.",
  // 11-25 홍보: 만드는 방식은 쓰지 않는다(사장님) — 무엇을 해 주는지만.
  // 11-24: 링크 카드가 사이트 기본("Dot — Chat with pixel characters")으로 떠서 스레드 글에 엉뚱한 카드가 붙었다 → 이 페이지 것으로 덮는다.
  openGraph: {
    type: "website",
    siteName: "두근도트",
    title: "도트 작업실",
    description: "글 한 줄이면 게임용 도트 캐릭터. 앞·옆·뒤 4방향과 움직임까지.",
    url: "/pixel",
    images: [{ url: "/pixel-og.png", width: 1200, height: 630, alt: "도트 작업실에서 만든 용 4방향과 기사·고양이·슬라임·마법사" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "도트 작업실",
    description: "글 한 줄이면 게임용 도트 캐릭터. 앞·옆·뒤 4방향과 움직임까지.",
    images: ["/pixel-og.png"],
  },
};

export default async function PixelPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { paid } = await searchParams;
  const en = (await langFromCookie()) === "en";
  return <PixelClient en={en} paid={paid ?? null} />;
}
