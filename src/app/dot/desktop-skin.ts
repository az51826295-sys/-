/**
 * **PC 화면** (11-22 사장님 "컴퓨터 화면인데 왜 세로야?" — 두근도트 웹화).
 *
 * 폰 화면은 한 줄도 안 바꾼다. 넓은 화면(1000px 이상)에서만 이 겹이 얹힌다 — pixel-skin 처럼 레이아웃 맨 뒤에 실려 이긴다.
 * 기준은 사장님이 정한 두 벤치마크 그대로:
 *   - 피드·검색·채팅목록·내 창 = **인스타 웹**(09-29 "인스타 모방"): 왼쪽 세로 메뉴 · 가운데 470px 피드 · 오른쪽 캐릭터 줄
 *   - 대화방 = **카톡 PC**(09-11 "카톡 벤치마킹"): 폰 폭에 갇히지 않고 넓은 창
 * 아래 탭(DotTabs)이 PC 에선 왼쪽 메뉴가 된다 — 같은 링크를 두 벌 만들지 않는다.
 */
export const DESKTOP_CSS = `
.dt-logo, .fd-side { display:none; }
@media (min-width: 1000px) {
  body { background:#fafafa !important; }
  .fd-root, .kl-root, .sc-root, .me-root { background:#fafafa !important; padding-left:244px; align-items:flex-start !important; justify-content:center; }

  /* 왼쪽 세로 메뉴(인스타 웹) */
  .dt-tabs { position:fixed; left:0; top:0; bottom:0; width:244px; flex-direction:column; align-items:stretch; gap:4px;
    padding:28px 12px; border-top:none !important; border-right:1px solid #e3e6ea; background:#fff; z-index:50; }
  .dt-logo { display:block; font-family:Galmuri14, sans-serif; font-size:28px; line-height:1.2; color:#111; padding:6px 12px 28px; text-decoration:none; }
  .dt-tab { flex:0 0 auto !important; flex-direction:row !important; justify-content:flex-start; gap:16px !important; padding:12px !important; font-size:14px !important; }
  .dt-tab:hover { background:#f2f3f5; }
  .dt-tab.on { color:#111; }

  /* 피드: 가운데 470px + 오른쪽 320px */
  .fd-phone { width:auto !important; max-width:none !important; height:auto !important; max-height:none !important; overflow:visible !important;
    display:grid !important; grid-template-columns:470px 320px; column-gap:56px; align-items:start; padding:24px 0 60px; background:transparent !important; }
  .fd-bar { grid-column:1; grid-row:1; background:#fff; }
  .fd-title { display:none; }
  .fd-hint { grid-column:1; }
  .fd-list { grid-column:1; overflow:visible !important; background:#fff; border:1px solid #e3e6ea; }
  .fd-list .fd-intro { display:none; }
  .fd-side { display:block; grid-column:2; grid-row:1 / span 3; position:sticky; top:24px; }
  .fd-side .fd-intro { display:block; margin:0 0 20px; }
  .fd-side-title { font-size:14px; color:#6b7280; margin:0 0 10px; }
  .fd-side-one { display:flex; align-items:center; gap:12px; padding:8px 4px; text-decoration:none; color:#111; }
  .fd-side-one:hover { background:#f2f3f5; }
  .fd-side-one img, .fd-side-none { width:44px; height:44px; border-radius:50%; object-fit:cover; object-position:center top; image-rendering:pixelated; background:#eef1f5; flex:0 0 auto; }
  .fd-side-name { font-size:14px; font-weight:600; }
  .fd-side-tag { font-size:11px; color:#8a8f98; display:block; margin-top:2px; }
  .fd-side-go { margin-left:auto; font-size:11px; color:#6b5bd2; font-weight:700; white-space:nowrap; }

  /* 채팅 목록 · 검색 · 내 창: 폰 폭 대신 640px 흰 판 */
  .kl-title { display:none; } /* 이름은 왼쪽 메뉴 맨 위에 이미 있다 */
  .kl-phone, .sc-phone, .me-phone { max-width:640px !important; height:auto !important; min-height:100dvh; max-height:none !important;
    border-left:1px solid #e3e6ea; border-right:1px solid #e3e6ea; }

  /* 대화방(카톡 PC): 폰 폭에 갇히지 않게 */
  .kk-root { background:#fafafa !important; }
  .kk-phone { max-width:760px !important; max-height:none !important; border-left:1px solid #e3e6ea; border-right:1px solid #e3e6ea; }
}
`;
