import Link from "next/link";
import { t } from "@/lib/dot/lang";
import { langFromCookie } from "@/lib/dot/langServer";
import { createClient } from "@/lib/supabase/server";
import SettingsActions from "./SettingsActions";
import Preferences from "./Preferences";

/**
 * 설정 (95회차 09-13) — 사장님 "여기(방 메뉴)에 몰아놓지 말고 분산시켜".
 * 카톡처럼: 방 메뉴엔 **이 방** 것만(알림·멘헤라·배경·대화 지우기·신고·도움말), 계정·약관·삭제는
 * 친구 탭 오른쪽 위 톱니바퀴 → 여기. 채팅 목록·피드는 아래 탭과 뒤로 가기가 있으니 메뉴에서 뺐다.
 */
export const metadata = { title: "두근도트 — 설정" };
export const viewport = { width: "device-width", viewportFit: "cover" as const, initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#a5bccd" };

export default async function DotSettings() {
  const lang = await langFromCookie();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  return (
    <div className="pk-root st-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="pk-phone">
        <header className="pk-head st-head">
          <Link href="/dot/pick" className="st-back" aria-label={t("back", lang)}>‹</Link>
          <div className="pk-title">{t("settings_aria", lang)}</div>
        </header>
        <div className="st-list">
          <div className="st-group">{t("st_account", lang)}</div>
          {/* 10-28: 로그인 화면을 없앴으니 "로그인 안 됨" 은 **고칠 수 없는 상태**다.
              고칠 수 없는 것을 문제처럼 적지 않는다 — 지금 참인 것만 적는다. */}
          <div className="st-row"><span>{email ?? t("st_device", lang)}</span><small>{email ? t("st_account_sub", lang) : t("st_device_sub", lang)}</small></div>
          <SettingsActions signedIn={Boolean(email)} lang={lang} />

          {/* 10-28: 언어·손맛. 로그인 없이 쓰는 앱이라 이 기기에 남는다. */}
          <div className="st-group">{t("st_app", lang)}</div>
          <Preferences />

          <div className="st-group">{t("st_info", lang)}</div>
          <Link className="st-row" href="/dot/privacy">{t("st_privacy", lang)}</Link>
          <Link className="st-row" href="/dot/child-safety">{t("st_child", lang)}</Link>
          <a className="st-row" href={`mailto:az51826295@gmail.com?subject=${encodeURIComponent("두근도트 문의")}`}>{t("st_contact", lang)}<small>az51826295@gmail.com{lang === "en" ? " · child-safety reports answered within 24 hours" : " · 아동 안전 관련은 24시간 안에 확인해요"}</small></a>
          <div className="st-row st-dim"><span>{t("app_name", lang)} 1.0.7</span><small>{t("st_menu_note", lang)}</small></div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
* { box-sizing:border-box; }
.pk-root { min-height:100dvh; background:#0b0f14; display:flex; align-items:center; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.pk-phone { width:100%; max-width:430px; min-height:100dvh; max-height:940px; background:#f5f7fa; display:flex; flex-direction:column; overflow:hidden; }
.pk-head { padding:28px 22px 12px; }
.st-head { display:flex; align-items:center; gap:10px; }
.st-back { font-size:26px; line-height:1; color:#111; text-decoration:none; width:32px; }
.pk-title { font-size:24px; font-weight:700; letter-spacing:-.4px; color:#111; }
.st-list { flex:1; min-height:0; overflow-y:auto; padding:4px 16px 32px; display:flex; flex-direction:column; gap:8px; }
.st-group { font-size:12px; color:#8a8f98; padding:14px 6px 2px; }
.st-row { display:flex; flex-direction:column; gap:3px; background:#fff; border-radius:14px; padding:13px 14px; font-size:15px; color:#111; text-decoration:none; border:none; text-align:left; width:100%; font-family:inherit; cursor:pointer; }
.st-row:active { background:#eef1f5; }
.st-row small { font-size:12px; color:#8a8f98; }
.st-row.danger { color:#d33d5a; }
.st-row.st-dim { color:#5c6570; }
`;
