import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SettingsActions from "./SettingsActions";

/**
 * 설정 (95회차 09-13) — 사장님 "여기(방 메뉴)에 몰아놓지 말고 분산시켜".
 * 카톡처럼: 방 메뉴엔 **이 방** 것만(알림·멘헤라·배경·대화 지우기·신고·도움말), 계정·약관·삭제는
 * 친구 탭 오른쪽 위 톱니바퀴 → 여기. 채팅 목록·피드는 아래 탭과 뒤로 가기가 있으니 메뉴에서 뺐다.
 */
export const metadata = { title: "두근도트 — 설정" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#a5bccd" };

export default async function DotSettings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  return (
    <div className="pk-root st-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="pk-phone">
        <header className="pk-head st-head">
          <Link href="/dot/pick" className="st-back" aria-label="친구로">‹</Link>
          <div className="pk-title">설정</div>
        </header>
        <div className="st-list">
          <div className="st-group">계정</div>
          <div className="st-row"><span>{email ?? "로그인 안 됨"}</span><small>로그인한 계정 · 폰을 바꿔도 이 계정으로 이어져요</small></div>
          <SettingsActions />

          <div className="st-group">안내</div>
          <Link className="st-row" href="/dot/privacy">개인정보 처리방침</Link>
          <Link className="st-row" href="/dot/child-safety">아동 안전 기준</Link>
          <a className="st-row" href={`mailto:az51826295@gmail.com?subject=${encodeURIComponent("두근도트 문의")}`}>문의·신고<small>az51826295@gmail.com · 아동 안전 관련은 24시간 안에 확인해요</small></a>
          <div className="st-row st-dim"><span>두근도트 1.0.7</span><small>알림·배경·멘헤라 모드는 각 대화방의 ≡ 메뉴에 있어요</small></div>
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
