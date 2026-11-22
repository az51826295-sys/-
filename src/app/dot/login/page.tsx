import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { langFromCookie } from "@/lib/dot/langServer";
import { 구글켜졌나 } from "@/lib/auth/googleEnabled";
import GoogleGo from "./GoogleGo";
import { dotEmailLogin } from "./actions";

/**
 * **두근도트 로그인 화면** (11-22 사장님 "로그인창도 따로").
 *
 * 10-28 에 로그인 화면을 없애고 손님(익명)으로 바로 대화하게 했다 — 그건 그대로 둔다(처음 온 사람을 막지 않는다).
 * 대신 이 화면은 **이미 있는 계정으로 들어오는 문**이자 **지금 대화를 계정에 묶는 문**이다.
 * 하트를 사기 시작했으니 필요해졌다: 손님 계정은 브라우저를 지우면 사라지고, 산 하트도 같이 사라진다.
 *
 * - 구글 하나가 주인공(가입도 로그인도 같은 단추) — `/api/dot/login` 이 손님이면 붙이고, 아니면 로그인한다.
 * - 이메일은 09-28 이전에 이메일로 만든 사람들(13명)의 문이라 접어 둔다. 새로 만드는 길은 없다.
 */
export const metadata = { title: "두근도트 — 로그인" };

export default async function DotLogin({ searchParams }: { searchParams: Promise<{ error?: string; error_code?: string; linked?: string }> }) {
  const { error, error_code, linked } = await searchParams;
  const en = (await langFromCookie()) === "en";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const 계정 = user && !user.is_anonymous ? user : null;
  const 구글 = process.env.GOOGLE_LOGIN === "1" && (await 구글켜졌나()).켜짐;
  /* 이 구글 계정이 이미 다른 두근도트 계정에 붙어 있다 → 그 계정으로 로그인을 이어 간다(단추가 알아서). */
  const 이미있음 = error_code === "identity_already_exists";

  return (
    <div className="lg-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="lg-phone">
        <header className="lg-head">
          <Link href="/dot/feed" className="lg-back" aria-label={en ? "Back" : "뒤로"}>‹</Link>
        </header>

        <div className="lg-logo">{en ? "Dot" : "두근도트"}</div>

        {계정 ? (
          <div className="lg-card">
            {linked && <div className="lg-ok">{en ? "Google is connected. Your chats now follow you to any device." : "구글이 연결됐어요. 이제 어느 기기에서든 대화가 이어져요."}</div>}
            <div className="lg-who">{계정.email ?? (en ? "Signed in" : "로그인됨")}</div>
            <p className="lg-sub">{en ? "You're signed in." : "로그인돼 있어요."}</p>
            <Link href="/dot/feed" className="lg-primary">{en ? "Go chat" : "대화하러 가기"}</Link>
          </div>
        ) : (
          <div className="lg-card">
            <h1 className="lg-title">{en ? "Sign in" : "로그인"}</h1>
            <p className="lg-sub">
              {user
                ? (en ? "Your chats so far are saved on this device only. Continue with Google to keep them — and your hearts — on any device." : "지금까지 대화는 이 기기에만 있어요. 구글로 계속하면 대화와 하트가 어느 기기에서든 이어져요.")
                : (en ? "Already have an account? Continue with Google." : "계정이 있으면 구글로 계속하세요.")}
            </p>

            {이미있음 && <div className="lg-ok">{en ? "This Google account already has a 두근도트 account — signing you in to it…" : "이 구글 계정에는 이미 두근도트 계정이 있어요. 그 계정으로 들어가는 중…"}</div>}
            {error && !이미있음 && <div className="lg-errbox" role="alert">{error}</div>}

            {구글
              ? <GoogleGo already={이미있음} en={en} />
              : <div className="lg-errbox">{en ? "Google sign-in is unavailable right now. Use email below." : "지금은 구글 로그인을 쓸 수 없어요. 아래 이메일로 들어와 주세요."}</div>}

            <details className="lg-email" open={!구글}>
              <summary>{en ? "I signed up with email" : "이메일로 가입했어요"}</summary>
              <form action={dotEmailLogin} className="lg-form">
                <input name="email" type="email" autoComplete="email" placeholder={en ? "Email" : "이메일"} required />
                <input name="password" type="password" autoComplete="current-password" placeholder={en ? "Password" : "비밀번호"} required />
                <button type="submit" className="lg-secondary">{en ? "Sign in with email" : "이메일로 로그인"}</button>
              </form>
            </details>

            <Link href="/dot/feed" className="lg-skip">{en ? "Keep chatting without signing in" : "로그인 없이 계속 대화하기"}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* 누르는 자리는 44px 위(WCAG 2.5.5). */
const CSS = `
.lg-root { min-height:100dvh; background:#f7f8fa; display:flex; justify-content:center;
  font-family:"Pretendard Variable", Pretendard, system-ui, sans-serif; color:#141414; }
.lg-phone { width:100%; max-width:430px; padding:0 16px 40px; }
.lg-head { display:flex; align-items:center; padding:10px 0; }
.lg-back { display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; font-size:26px; color:#141414; text-decoration:none; }
.lg-logo { font-family:Galmuri14, sans-serif; font-size:30px; text-align:center; margin:18px 0 22px; }
.lg-card { background:#fff; border:1px solid #e7eaee; border-radius:18px; padding:22px 18px; }
.lg-title { font-size:20px; font-weight:800; margin:0 0 6px; }
.lg-sub { font-size:14px; color:#5c6570; line-height:1.6; margin:0 0 16px; }
.lg-who { font-size:17px; font-weight:700; margin:4px 0 2px; word-break:break-all; }
.lg-google { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; min-height:50px; border:1px solid #d9dde3; border-radius:14px;
  background:#fff; font:inherit; font-size:15px; font-weight:700; color:#141414; cursor:pointer; }
.lg-google:disabled { opacity:.6; cursor:default; }
.lg-primary { display:flex; align-items:center; justify-content:center; min-height:50px; border-radius:14px; background:#6b5bd2; color:#fff;
  font-weight:700; font-size:15px; text-decoration:none; }
.lg-secondary { min-height:46px; border:none; border-radius:12px; background:#111; color:#fff; font:inherit; font-weight:700; font-size:14px; cursor:pointer; }
.lg-email { margin-top:16px; border-top:1px solid #eef0f3; padding-top:12px; }
.lg-email summary { cursor:pointer; font-size:13px; color:#6b7280; min-height:44px; display:flex; align-items:center; }
.lg-form { display:flex; flex-direction:column; gap:8px; margin-top:6px; }
.lg-form input { min-height:46px; border:1px solid #d9dde3; border-radius:12px; padding:0 12px; font:inherit; font-size:15px; }
.lg-skip { display:flex; align-items:center; justify-content:center; min-height:44px; margin-top:12px; font-size:13px; color:#6b7280; }
.lg-ok { margin:0 0 12px; padding:10px 12px; background:#e9f8ef; color:#17663a; border-radius:10px; font-size:13px; line-height:1.5; }
.lg-errbox { margin:0 0 12px; padding:10px 12px; background:#fdecef; color:#a3243d; border-radius:10px; font-size:13px; line-height:1.5; }
.lg-err { font-size:13px; color:#d33d5a; margin:8px 2px 0; }
`;
