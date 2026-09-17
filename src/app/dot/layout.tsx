import { PIXEL_CSS } from "./pixel-skin";

/** /dot 아래 모든 화면에 도트 껍데기 한 겹(84회차). 화면 CSS 뒤에 실려 이긴다. */
export default function DotLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/fonts/galmuri.css" />
      {children}
      <style>{PIXEL_CSS}</style>
    </>
  );
}
