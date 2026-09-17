/**
 * 두근도트용 로그인·가입 화면 (38회차, 09-11).
 *
 * `/login` `/signup` 은 로키 것(영어, 회색 카드)이었다. 두근도트 앱 안에서 그 화면이 뜨면 그 순간
 * "딴 회사 페이지" 가 된다. `PRODUCT=dot` 인 서비스에서는 이 화면을 대신 그린다 — 같은 도트 껍데기,
 * 같은 글꼴, 한국어. 서버 액션(로그인·가입)은 그대로 쓰고, 어디로 보낼지만 제품에 따라 갈린다.
 */
import { PIXEL_CSS } from "@/app/dot/pixel-skin";

export default function DotAuth({
  mode, error, message, action, google, origin,
}: {
  mode: "login" | "signup";
  error?: string;
  message?: string;
  action: (formData: FormData) => Promise<void>;
  /** 구글로 들어가기. 없으면 단추를 안 그린다. */
  google?: (formData: FormData) => Promise<void>;
  origin?: string;
}) {
  const isLogin = mode === "login";
  return (
    <div className="da-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <link rel="stylesheet" href="/fonts/galmuri.css" />
      <style>{CSS}</style>
      <style>{PIXEL_CSS}</style>
      <div className="da-phone">
        <div className="da-logo">
          <img src="/dot-icon-192.png" alt="두근도트" />
          <div className="da-name">두근도트</div>
          <div className="da-sub">{isLogin ? "다시 왔네요" : "처음이죠? 30초면 돼요"}</div>
        </div>
        {message && <div className="da-msg">{message}</div>}
        {error && <div className="da-err">{koError(error)}</div>}
        {google && (
          <form action={google} className="da-google">
            <input type="hidden" name="origin" value={origin ?? ""} />
            <button type="submit"><span className="da-g">G</span> 구글로 {isLogin ? "들어가기" : "시작하기"}</button>
            <div className="da-or">또는 이메일로</div>
          </form>
        )}
        <form action={action} className="da-form">
          <label>이메일<input name="email" type="email" required autoComplete="email" inputMode="email" /></label>
          <label>비밀번호<input name="password" type="password" required autoComplete={isLogin ? "current-password" : "new-password"} minLength={6} /></label>
          <button type="submit">{isLogin ? "들어가기" : "시작하기"}</button>
        </form>
        <div className="da-foot">
          {isLogin ? <>처음이에요? <a href="/signup">가입하기</a></> : <>이미 있어요? <a href="/login">로그인</a></>}
          <span className="da-dot">·</span>
          <a href="/dot/privacy">개인정보</a>
        </div>
      </div>
    </div>
  );
}

/** Supabase 의 영어 오류를 한국어로. 모르는 건 그대로 — 지어내면 원인을 못 찾는다. */
function koError(e: string): string {
  const m = e.toLowerCase();
  if (m.includes("invalid login")) return "이메일이나 비밀번호가 틀렸어요.";
  if (m.includes("already registered") || m.includes("already exists")) return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (m.includes("password") && m.includes("6")) return "비밀번호는 6자 이상이어야 해요.";
  if (m.includes("rate limit")) return "너무 여러 번 시도했어요. 잠시 뒤에 다시요.";
  if (m.includes("required")) return "이메일과 비밀번호를 적어 주세요.";
  return e;
}

const CSS = `
* { box-sizing:border-box; }
.da-root { min-height:100dvh; background:#0b0f14; display:flex; align-items:center; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.da-phone { width:100%; max-width:430px; min-height:100dvh; background:#fff; padding:64px 28px 28px; display:flex; flex-direction:column; align-items:center; }
.da-logo { text-align:center; margin-bottom:28px; }
.da-logo img { width:88px; height:88px; image-rendering:pixelated; border-radius:26px; background:#eef2f6; }
.da-name { font-size:24px; font-weight:700; color:#111; margin-top:14px; letter-spacing:-.4px; }
.da-sub { font-size:14px; color:#7b8590; margin-top:6px; }
.da-msg, .da-err { width:100%; font-size:13px; padding:10px 14px; border-radius:12px; margin-bottom:12px; }
.da-msg { background:#eef6ff; color:#1d4f8a; }
.da-err { background:#fff1f3; color:#b4233d; }
.da-google { width:100%; display:flex; flex-direction:column; align-items:center; gap:10px; margin-bottom:10px; }
.da-google button { width:100%; padding:13px; background:#fff; color:#141414; border:1px solid rgba(0,0,0,.14); border-radius:14px; font:inherit; font-size:15px; font-weight:500; cursor:pointer;
  display:flex; align-items:center; justify-content:center; gap:10px; }
.da-g { display:inline-block; width:22px; height:22px; line-height:22px; text-align:center; border-radius:50%; background:#4285f4; color:#fff; font-weight:700; font-size:13px; }
.da-or { font-size:12px; color:#a3aab3; }
.da-form { width:100%; display:flex; flex-direction:column; gap:12px; }
.da-form label { display:flex; flex-direction:column; gap:6px; font-size:12px; color:#5c6570; font-weight:500; }
.da-form input { padding:13px 14px; border:1px solid rgba(0,0,0,.12); border-radius:14px; background:#fafbfc; font:inherit; font-size:15px; color:#141414; outline:none; }
.da-form input:focus { border-color:#ff5c7a; background:#fff; }
.da-form button { margin-top:6px; padding:14px; background:#fee500; color:#1f1a00; border:none; border-radius:14px; font:inherit; font-size:15px; font-weight:600; cursor:pointer; }
.da-foot { margin-top:22px; font-size:13px; color:#7b8590; }
.da-foot a { color:#111; font-weight:500; }
.da-dot { margin:0 8px; }
`;
