import { PIXEL_CSS } from "./pixel-skin";
import LangSync from "./LangSync";
import CheckInGate from "./CheckInGate";

/** /dot 아래 모든 화면에 도트 껍데기 한 겹(84회차). 화면 CSS 뒤에 실려 이긴다. */
export default function DotLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/fonts/galmuri.css" />
      <LangSync />
      {children}
      {/* 11-06: 하루 첫 입장이면 출석 판. **레이아웃에 둔다** — 어느 화면으로 들어와도 떠야 한다. */}
      <CheckInGate />
      <style>{PIXEL_CSS}</style>
    </>
  );
}
