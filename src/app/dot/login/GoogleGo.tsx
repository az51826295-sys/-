"use client";

import { useEffect, useRef, useState } from "react";

/* 11-24 "로그인 안됨.. 폰이야": 스레드·인스타·카톡 링크는 그 앱 **안 브라우저**로 열린다. 구글은 거기서 로그인을
 * 막는다(403 disallowed_useragent). 그래서 그 자리에선 구글로 보내지 않고 **진짜 브라우저로 이 화면을 다시 연다.** */
function 앱안브라우저(): "android" | "kakao" | "ios" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return "kakao";
  const 앱안 = /Barcelona|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps|everytimeApp|; wv\)/i.test(ua);
  if (!앱안) return null;
  return /iPhone|iPad|iPod/i.test(ua) ? "ios" : "android";
}

/**
 * 구글 단추. 이 구글 계정이 이미 다른 두근도트 계정에 붙어 있어서 돌아온 경우(`already`)에는
 * **누르지 않아도 그 계정으로 로그인을 이어 간다** — 같은 단추를 두 번 누르게 하지 않는다.
 * 오류는 삼키지 않는다(삼키면 눌러도 말없이 아무 일도 안 일어난다).
 */
export default function GoogleGo({ already, en }: { already: boolean; en: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const 한번 = useRef(false);

  async function go(mode?: "signin") {
    const 앱안 = 앱안브라우저();
    if (앱안 === "kakao") { location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href); return; }
    if (앱안 === "android") {
      location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href)};end`;
      return;
    }
    if (앱안 === "ios") { setErr(en ? "Google sign-in doesn't work inside this app. Tap ··· and choose \"Open in browser\"." : "이 앱 안에선 구글이 로그인을 막아요. 오른쪽 위 ··· → \"브라우저로 열기\" 후 다시 눌러 주세요."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/dot/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (j.url) { window.location.href = j.url; return; }
      setErr(j.error ?? (en ? "Couldn't open Google sign-in." : "구글 로그인을 못 열었어요."));
    } catch (e) {
      setErr(e instanceof Error ? e.message : (en ? "Couldn't open Google sign-in." : "구글 로그인을 못 열었어요."));
    }
    setBusy(false);
  }

  useEffect(() => {
    if (already && !한번.current) { 한번.current = true; void go("signin"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [already]);

  return (
    <>
      <button className="lg-google" onClick={() => go()} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        {busy ? (en ? "Opening Google…" : "구글 여는 중…") : (en ? "Continue with Google" : "구글로 계속하기")}
      </button>
      {err && <p className="lg-err" role="alert">{err}</p>}
    </>
  );
}
