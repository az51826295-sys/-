/**
 * 도트 껍데기 — 두근도트 화면 전부에 얹는 한 겹 (84회차 09-12, 사장님 "일단 전부 도트로").
 *
 * 화면마다 따로 고치지 않고 **한 파일**에서 덮는다. 규칙(검색 + 내 생각):
 *   - 화소 단위 2px. 둥근 모서리 없음 — 계단 모서리(clip-path 4px 2단)와 2px 테두리, 2px 오프셋 그림자.
 *   - 글꼴은 비트맵(갈무리). 비트맵은 **정수 배**에서만 선명하다: 11px·14px·28px 만 쓴다. 안티에일리어싱 끔.
 *   - 색은 적게: 먹 #1c1c1c, 종이 #fff, 노랑 #fee500, 분홍 #ff5c7a, 회색 #eef1f5. 그림(배경·스프라이트)은 그대로.
 *   - 누르면 2px 내려앉는다(그림자가 사라짐) — 도트 게임 단추의 그 느낌.
 * 화면 CSS 는 그대로 두고 이 겹이 **뒤에** 실려 이긴다(같은 선택자 + 나중 순서).
 */
export const STEP = "polygon(4px 0, calc(100% - 4px) 0, calc(100% - 4px) 2px, calc(100% - 2px) 2px, calc(100% - 2px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 2px) calc(100% - 4px), calc(100% - 2px) calc(100% - 2px), calc(100% - 4px) calc(100% - 2px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 2px), 2px calc(100% - 2px), 2px calc(100% - 4px), 0 calc(100% - 4px), 0 4px, 2px 4px, 2px 2px, 4px 2px)";

export const PIXEL_FONT_LINK = `<link rel="stylesheet" href="/fonts/galmuri.css" />`;

export const PIXEL_CSS = `
/* ── 바탕: 검정 틈 대신 흰색(화면 사이) ── */
body { background: #fff !important; }
.kl-root, .pk-root, .fd-root, .pf-root, .kk-root, .da-root, .pv-root { background: #fff !important; }

/* ── 글꼴: 비트맵, 정수 배만 ── */
.kl-root, .pk-root, .fd-root, .pf-root, .kk-root, .da-root, .pv-root, .dt-tabs, .fb {
  font-family: Galmuri14, Galmuri11, "Apple SD Gothic Neo", sans-serif !important; -webkit-font-smoothing: none !important; font-smooth: never; letter-spacing: 0 !important; }
.kl-root *, .pk-root *, .fd-root *, .pf-root *, .kk-root *, .da-root *, .pv-root * { letter-spacing: 0 !important; }
/* 큰 제목 28px(=14×2), 본문 14px, 작은 글 11px */
.kl-title, .pk-title, .fd-title, .da-name { font-family: Galmuri14, sans-serif !important; font-size: 28px !important; font-weight: 400 !important; line-height: 1.2 !important; }
.pf-name { font-family: Galmuri14, sans-serif !important; font-size: 28px !important; font-weight: 400 !important; }
.kk-title, .kl-name, .pk-name, .fc-name, .fc-cap, .kk-bubble, .kk-input, .pk-say, .pf-tag, .pf-stage, .kk-menu button, .kk-menu a, .kk-limit-title, .kk-limit-body, .kk-peek-name, .kk-sku-name, .da-form input, .da-form button, .da-google button, .pv-phone p, .pv-phone li, .pv-phone h2, .pv-phone h1, .fb, .kk-send, .kk-limit-btn, .pf-go, .pk-go, .fc-reply, .kk-pay-go, .kk-link-go, .kk-peek-go, .kk-peek-close, .fd-hint, .fd-empty, .kl-empty, .kl-warn, .kk-warn, .kk-quote-text, .kk-pay-list, .kk-link-help, .kk-shop-bal, .kk-pay-price, .fd-tabs a {
  font-family: Galmuri14, sans-serif !important; font-size: 14px !important; font-weight: 400 !important; }
.kl-say, .kl-when, .kl-turns, .pk-sub, .pk-line, .fc-when, .kk-time, .kk-name, .kk-day, .kk-foot, .kk-menu small, .kk-limit-note, .kk-pay-note, .kk-mode, .kk-unread, .pf-meta, .pv-date, .da-sub, .da-foot, .da-form label, .dt-tab, .kk-limit-btn small, .kk-sku-name small, .pk-fl, .fb.sm, .kk-peek-stage, .kl-hearts, .kk-hearts, .pf-hearts, .kk-theme-name, .da-or, .da-msg, .da-err, .kk-link-err {
  font-family: Galmuri11, Galmuri14, sans-serif !important; font-size: 11px !important; font-weight: 400 !important; }
.kk-bubble { line-height: 1.5 !important; }

/* ── 모서리: 둥근 것은 전부 계단으로 ── */
.kl-face, .pk-face, .pk-card, .fc-avatar, .pf-photo, .pf-shot img, .pf-bond, .kk-menu, .kk-peek-card, .kk-peek-photo, .kk-peek-photos img, .kk-sku, .kk-limit, .kk-quote, .kk-quote img,
.da-logo img, .da-form input, .da-form button, .da-google button, .da-msg, .da-err, .kk-input, .kk-send, .kk-plus, .fb, .pf-go, .pk-go, .fc-reply, .kk-limit-btn, .kk-pay-go, .kk-link-go, .kk-peek-go, .kk-peek-close, .fd-tabs, .fd-tabs a, .fd-hint, .kk-theme, .kk-bubble-pick, .kk-mode, .kk-pay-badge, .pk-fl, .kk-link input, .kk-day, .kl-item, .kk-back, .kk-more, .pf-back, .kk-face {
  border-radius: 0 !important; clip-path: ${STEP}; }

/* ── 테두리 2px + 그림자 2px: 카드·단추·입력칸 ── */
.pk-card, .pf-bond, .kk-menu, .kk-peek-card, .kk-sku, .kk-limit, .da-form input, .da-form button, .da-google button, .kk-input, .kk-send, .fb, .pf-go, .pk-go, .fc-reply, .kk-limit-btn, .kk-pay-go, .kk-link-go, .kk-peek-go, .kk-peek-close, .fd-tabs, .kk-link input, .kl-face, .pk-face, .fc-avatar {
  box-shadow: inset 0 0 0 2px #1c1c1c !important; }
.pk-card, .kk-sku, .da-form button, .da-google button, .kk-send.ready, .fb, .pf-go, .pk-go, .fc-reply, .kk-limit-btn, .kk-pay-go, .kk-link-go, .kk-peek-go, .kk-peek-close, .kl-face, .pk-face, .fc-avatar {
  filter: drop-shadow(2px 2px 0 rgba(28,28,28,.55)); }
.pk-card:active, .kk-sku:active, .da-form button:active, .fb:active, .pf-go:active, .pk-go:active, .fc-reply:active, .kk-limit-btn:active, .kk-pay-go:active, .kk-link-go:active, .kk-peek-go:active, .kk-peek-close:active, .kk-send.ready:active {
  transform: translate(2px, 2px) !important; filter: none !important; }
.kk-peek-card { filter: none; border-radius: 0 !important; clip-path: none; box-shadow: 0 -2px 0 #1c1c1c !important; }
.kk-menu { background: #fff !important; }

/* ── 띠: 머리띠·아래 탭·입력줄 ── */
.kl-bar, .pk-head, .fd-bar, .kk-bar { border-bottom: 2px solid #1c1c1c !important; box-shadow: none !important; backdrop-filter: none !important; }
.dt-tabs { border-top: 2px solid #1c1c1c !important; }
.dt-tab.on { color: #1c1c1c !important; }
.dt-tab.on span:last-child { box-shadow: 0 2px 0 #fee500; }
.dt-icon { filter: grayscale(1) contrast(1.4) !important; }
.kk-input-row { border-top: 2px solid #1c1c1c !important; backdrop-filter: none !important; }
.kk-chips, .kk-foot { border: none !important; }
.has-wall .kk-bar, .has-wall .kk-input-row { border-color: rgba(0,0,0,.6) !important; }

/* ── 단추 색 ── */
.fb.on { background: #eef1f5 !important; color: #1c1c1c !important; }
.fd-tabs { background: #fff !important; padding: 0 !important; gap: 0 !important; }
.fd-tabs a { clip-path: none; box-shadow: none !important; padding: 0 12px !important; min-height: 40px; display: inline-flex; align-items: center; }
.fd-tabs a.on { background: #fee500 !important; color: #1c1c1c !important; box-shadow: none !important; }
.kk-mode, .kk-pay-badge { padding: 2px 6px !important; }
.pk-fl { padding: 1px 6px !important; }
.kk-day { background: #1c1c1c !important; color: #fff !important; }
.kk-unread { color: #d99a00 !important; }

/* ── 사진·그림은 그대로 픽셀 ── */
img { image-rendering: pixelated; }

/* ── 진행 막대·하트 ── */
.pf-bar { border-radius: 0 !important; box-shadow: inset 0 0 0 2px #1c1c1c; height: 12px !important; background: #fff !important; padding: 2px; }
.pf-bar > div { border-radius: 0 !important; background: #ff5c7a !important; }

/* ── 단추 배치 규칙 (85회차, 사장님 "버튼 배치") ──
   1) 누르는 것은 전부 높이 40px 이상, 아래 탭은 48px.   2) 주 행동은 오른쪽, 보조는 왼쪽(카톡: 왼쪽 좋아요·오른쪽 채팅/답장).
   3) 한 줄에 단추는 셋까지, 사이 8px.                   4) 글자 단추는 14px, 배지는 11px. */
.fb, .fc-like, .fc-chat, .fc-reply, .pk-go, .pf-go, .kk-limit-btn, .kk-pay-go, .kk-link-go, .kk-peek-go, .kk-peek-close, .da-form button, .da-google button, .kk-send, .kk-plus, .kk-back, .kk-more, .pf-back {
  min-height: 40px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; box-sizing: border-box; }
.fb.sm { min-height: 40px !important; padding: 0 12px !important; }
.fb.md { padding: 0 18px !important; }
.fc-chat, .fc-reply, .pk-go { padding: 0 14px !important; font-family: Galmuri14, sans-serif !important; font-size: 14px !important; text-decoration: none !important; }
.fc-chat { background: #fff !important; color: #1c1c1c !important; }
.fc-reply, .pk-go { background: #fee500 !important; color: #1c1c1c !important; }
.fc-chat, .fc-reply, .fc-like { border-radius: 0 !important; clip-path: ${STEP}; box-shadow: inset 0 0 0 2px #1c1c1c !important; }
.fc-like { background: #fff !important; padding: 0 12px !important; gap: 6px !important; }
.fc-like .heart { font-size: 14px !important; }
.fc-actions { display: flex !important; align-items: center !important; gap: 8px !important; padding: 10px 12px 0 !important; }
.fc-reply { margin-left: auto !important; }
.dt-tab { min-height: 48px !important; justify-content: center !important; }
.dt-icon { font-size: 18px !important; }
.pf-list, .kk-title, .fc-name { padding: 10px 0 !important; display: inline-block; min-height: 40px; box-sizing: border-box; }
.kk-back, .pf-back { font-family: Galmuri14, sans-serif !important; font-size: 28px !important; }
.kk-more { font-family: Galmuri14, sans-serif !important; font-size: 28px !important; }

/* ── 친구 탭: 카톡 친구 목록처럼 한 줄(사진 56 · 이름/상태말 · 오른쪽 채팅) ── */
.pk-cards { gap: 0 !important; padding: 0 !important; }
.pk-card { display: flex !important; align-items: center !important; gap: 12px !important;
  padding: 10px 16px !important; border-radius: 0 !important; clip-path: none !important; box-shadow: none !important; filter: none !important; border-bottom: 2px solid #eef1f5 !important; background: #fff !important; }
.pk-card:active { transform: none !important; background: #f5f7fa !important; }
.pk-face { width: 56px !important; height: 56px !important; flex: 0 0 56px; }
.pk-say { display: none !important; }
.pk-line { margin-top: 2px !important; }
.pk-go { margin-left: auto !important; margin-top: 0 !important; flex: 0 0 auto; }
.pk-head { padding: 18px 20px 10px !important; }
`;
