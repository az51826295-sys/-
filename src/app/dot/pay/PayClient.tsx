"use client";
import { useState } from "react";

/**
 * 결제 단추 — **막는 것을 숨기지 않는다.**
 *
 * 사람이 지금 할 수 있는 일(계정 연결)과 우리가 할 일(열쇠·상품 등록)을 가른다.
 * 섞어서 "곧 열려요" 한 마디로 덮으면, 할 수 있는 것도 안 하게 된다.
 */
export default function PayClient(
  { 열림, 막는것, 로그인, 방금결제 }:
  { 열림: boolean; 막는것: string[]; 로그인: boolean; 방금결제: boolean },
) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [계정필요, set계정필요] = useState(!로그인);

  async function 결제하기() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/dot/pay", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string; 계정필요?: boolean };
      if (j.계정필요) { set계정필요(true); setErr(j.error ?? null); return; }
      if (j.url) { window.location.href = j.url; return; }
      setErr(j.error ?? "결제 창을 열지 못했어요.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "결제 창을 열지 못했어요.");
    } finally { setBusy(false); }
  }

  async function 구글로연결() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/dot/google", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (j.url) { window.location.href = j.url; return; }
      setErr(j.error ?? "구글 연결을 못 열었어요.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "구글 연결을 못 열었어요.");
    } finally { setBusy(false); }
  }

  /* 결제하고 돌아왔는데 아직 안 켜졌을 때. 웹훅이 우리에게 닿기까지 몇 초 걸린다 —
     그 사이를 "안 됐다" 로 보여 주면 사람이 한 번 더 산다. */
  if (방금결제) {
    return (
      <div className="py-wait">
        결제를 확인하고 있어요 · 몇 초 걸려요
        <button className="py-go" onClick={() => window.location.reload()}>새로 보기</button>
      </div>
    );
  }

  /* 우리가 고칠 것(열쇠·상품)만 남았을 때는 단추를 눌러도 소용이 없다. 그대로 적는다. */
  const 우리것 = 막는것.filter((m) => !m.includes("계정"));
  if (!열림 && 우리것.length) {
    return (
      <div className="py-blocked">
        <b>아직 결제를 열지 못했어요</b>
        <ul>{우리것.map((m) => <li key={m}>{m}</li>)}</ul>
        {/* 10-28: "준비되는 대로 바로" 라고 적었다가 뺐다. 곧 될 것처럼 적으면 사람이 기다린다 —
            지금은 받아 줄 대행사를 못 구한 상태고 언제 구할지 우리도 모른다. */}
        <small>무료 대화는 매일 자정에 다시 채워져요. 그때까지 그걸로 써 주세요.</small>
      </div>
    );
  }

  return (
    <>
      {계정필요 ? (
        <>
          <button className="py-go" onClick={구글로연결} disabled={busy}>
            {busy ? "여는 중…" : "구글로 계정 만들고 시작하기"}
          </button>
          <p className="py-note">
            계정이 있어야 결제한 게 폰을 바꿔도 따라와요. 지금 대화는 이 기기에만 있어요.
          </p>
        </>
      ) : (
        <button className="py-go" onClick={결제하기} disabled={busy}>
          {busy ? "결제 창을 여는 중…" : "멘헤라 모드 켜기"}
        </button>
      )}
      {err && <p className="py-err" role="alert">{err}</p>}
      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.py-go { width:100%; border:none; border-radius:14px; padding:17px; font-size:16px; font-weight:700; font-family:inherit; color:#fff; background:#e0457b; cursor:pointer; box-shadow:0 6px 20px rgba(224,69,123,.3); }
.py-go:disabled { opacity:.6; cursor:default; }
.py-go:active { transform:translateY(1px); }
.py-note { font-size:12px; color:#b98aa0; line-height:1.6; margin:10px 2px 0; }
.py-err { font-size:13px; color:#ff9db8; margin:10px 2px 0; }
.py-blocked { background:rgba(255,255,255,.05); border-radius:16px; padding:16px; display:flex; flex-direction:column; gap:8px; }
.py-blocked b { font-size:15px; color:#f6dde8; }
.py-blocked ul { margin:0; padding-left:18px; font-size:13px; color:#b98aa0; display:flex; flex-direction:column; gap:4px; }
.py-blocked small { font-size:12px; color:#8c7080; line-height:1.6; }
.py-wait { background:rgba(224,69,123,.12); border-radius:16px; padding:18px; display:flex; flex-direction:column; gap:12px; align-items:center; font-size:15px; color:#f6dde8; }
`;
