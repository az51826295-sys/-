"use client";
import { useState } from "react";
import { t, type Lang } from "@/lib/dot/lang";

/**
 * 내 창의 "계정 만들기" 한 단추 (10-28).
 *
 * 대화창·결제창과 **같은 길**을 쓴다(`/api/dot/google`). 길이 셋이 되면 언젠가 하나만
 * 고쳐지고, 그때 어느 화면에서 들어왔느냐에 따라 되고 안 되는 일이 생긴다.
 *
 * 오류를 삼키지 않는다 — 삼키면 눌러도 **말없이 아무 일도 안 일어난다**.
 */
export default function MeSignIn({ lang = "ko" }: { lang?: Lang }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function 구글로() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/dot/google", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (j.url) { window.location.href = j.url; return; }
      setErr(j.error ?? t("me_google_err", lang));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("me_google_err", lang));
    } finally { setBusy(false); }
  }

  return (
    <>
      <button className="me-signin" onClick={구글로} disabled={busy}>
        {busy ? t("me_opening", lang) : t("me_google", lang)}
      </button>
      {err && <p className="me-signin-err" role="alert">{err}</p>}
      <style>{`
        .me-signin { margin-top:6px; border:none; border-radius:14px; padding:15px; font-size:15px; font-weight:700; font-family:inherit; color:#fff; background:#111; cursor:pointer; }
        .me-signin:disabled { opacity:.6; cursor:default; }
        .me-signin-err { font-size:13px; color:#d33d5a; margin:8px 2px 0; }
      `}</style>
    </>
  );
}
