/**
 * 아래 탭 — 인스타의 그 줄: 피드 · 검색 · 채팅 (227회차 09-29).
 *
 * 09-11 에는 카톡을 본떠 **친구 · 채팅 · 피드** 였다. 사장님이 09-29 에 방식을 바꾸셨다 —
 * *"트위터나 인스타를 모방해서 검색이랑 피드있고 기본 캐릭터하나 있고 나머지는 검색하거나
 * 피드 보고 마음에들면 추가하는거야."* 그래서 **친구(전체 명단)를 검색으로 갈고**, 인스타처럼
 * **피드를 맨 왼쪽**(첫 화면)에 둔다.
 * 서버 컴포넌트. 어느 탭인지는 부모가 말해 준다(경로로 짐작하지 않는다 — /dot/yuna 같은 방은 탭이 없다).
 * 아이콘은 8×8 격자 SVG(crispEdges) — 이모지는 폰마다 다르게 그려져 도트 화면에서 튄다.
 */
const ICON: Record<string, string> = {
  // 돋보기(인스타 가운데 탭)
  search: "M1 0h4v1h1v4h-1v1h-4v-1h-1v-4h1zM2 1v4h2v-4zM6 6h1v1h1v1h-2z",
  // 말풍선
  chats: "M1 1h6v1h1v3h-1v1h-3l-2 2v-2h-1v-1h-1v-3h1z",
  // 사진(액자 + 산)
  feed: "M0 1h8v6h-8zM1 2v4h6v-4zM2 5l1-2 1 1 1-2 1 3z",
};

import Link from "next/link";

export default function DotTabs({ on }: { on: "search" | "chats" | "feed" }) {
  const tabs = [
    { key: "feed", href: "/dot/feed", label: "피드" },
    { key: "search", href: "/dot/search", label: "검색" },
    { key: "chats", href: "/dot/chats", label: "채팅" },
  ] as const;
  return (
    <nav className="dt-tabs" aria-label="아래 탭">
      <style>{CSS}</style>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`dt-tab${on === t.key ? " on" : ""}`} aria-current={on === t.key ? "page" : undefined}>
          <svg className="dt-icon" width="24" height="24" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden><path d={ICON[t.key]} fill="currentColor" fillRule="evenodd" /></svg>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

const CSS = `
.dt-tabs { display:flex; border-top:1px solid rgba(0,0,0,.06); background:#fff; padding-bottom:env(safe-area-inset-bottom); }
.dt-tab { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; padding:8px 0 6px; font-size:11px; color:#a3aab3; text-decoration:none; }
.dt-tab.on { color:#111; font-weight:600; }
.dt-icon { display:block; }
`;
