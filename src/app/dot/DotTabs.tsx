/**
 * 아래 탭 — 카톡의 그 줄: 친구 · 채팅 · 피드 (78회차 09-11, 86회차 아이콘을 도트로).
 * 서버 컴포넌트. 어느 탭인지는 부모가 말해 준다(경로로 짐작하지 않는다 — /dot/yuna 같은 방은 탭이 없다).
 * 아이콘은 8×8 격자 SVG(crispEdges) — 이모지는 폰마다 다르게 그려져 도트 화면에서 튄다.
 */
const ICON: Record<string, string> = {
  // 사람: 머리(둥근 네모) + 어깨
  friends: "M3 1h2v1h1v2h-1v1h-2v-1h-1v-2h1zM1 6h6v1h1v1h-8v-1h1z",
  // 말풍선
  chats: "M1 1h6v1h1v3h-1v1h-3l-2 2v-2h-1v-1h-1v-3h1z",
  // 사진(액자 + 산)
  feed: "M0 1h8v6h-8zM1 2v4h6v-4zM2 5l1-2 1 1 1-2 1 3z",
};

import Link from "next/link";

export default function DotTabs({ on }: { on: "friends" | "chats" | "feed" }) {
  const tabs = [
    { key: "friends", href: "/dot/pick", label: "친구" },
    { key: "chats", href: "/dot/chats", label: "채팅" },
    { key: "feed", href: "/dot/feed", label: "피드" },
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
