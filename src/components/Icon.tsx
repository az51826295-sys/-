import type { ReactNode } from "react";

/**
 * 우리가 만들고 사장님이 고른 아이콘.
 *
 * **인라인으로 넣는다.** 처음에는 CSS 마스크로 파일을 불러 썼는데, 이 아이콘들은
 * `stroke="currentColor"` 로 그려져 있고 **마스크 안에서는 물려받을 색이 없다** —
 * 그래서 전부 빈 칸이 됐다. 문서 안에 직접 그리면 `currentColor` 가 제자리를
 * 찾고, 밝은 화면에서는 검게 어두운 화면에서는 희게, 눌린 버튼 안에서는 그
 * 버튼의 글자색으로 따라간다.
 *
 * 고른 기록: `genesis-project/data/picks/rookery-ui.json` (후보 30개 중 6개)
 */

export type IconName =
  | "attach"
  | "chat"
  | "company"
  | "history"
  | "settings"
  | "signout";

const PATHS: Record<IconName, ReactNode> = {
  attach: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15"/><circle cx="9" cy="10" r="2"/><path d="M2.5 16l5-4 4 3 3.5-3 6.5 5.5"/>
    </>
  ),
  chat: (
    <>
      <path d="M4 6.5c0-1 1-2 2-2h12c1 0 2 1 2 2v7c0 1-1 2-2 2h-8l-4 3.5v-3.5h0c-1 0-2-1-2-2z"/>
    </>
  ),
  company: (
    <>
      <rect x="3.5" y="9.5" width="9" height="11" /><rect x="12.5" y="3.5" width="8" height="17" /><path d="M6.5 12.5h3M6.5 16.5h3M15.5 6.5h3M15.5 10.5h3M15.5 14.5h3"/>
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="13" r="8.5"/><path d="M12 8v5l4 2.5"/><path d="M9 3.5h6"/>
    </>
  ),
  settings: (
    <>
      <path d="M3.0 6.5h18.0M3.0 12.0h18.0M3.0 17.5h18.0"/><circle cx="8.0" cy="6.5" r="1.5"/><circle cx="16.0" cy="12.0" r="1.5"/><circle cx="10.0" cy="17.5" r="1.5"/>
    </>
  ),
  signout: (
    <>
      <path d="M12 3.5h-8.5v17h8.5"/><path d="M8 12h13"/><path d="M18 9l3 3-3 3"/>
    </>
  ),
};

export default function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={"inline-block shrink-0 " + className}
    >
      {PATHS[name]}
    </svg>
  );
}
