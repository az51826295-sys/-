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
};

export default async function PixelPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { paid } = await searchParams;
  const en = (await langFromCookie()) === "en";
  return <PixelClient en={en} paid={paid ?? null} />;
}
