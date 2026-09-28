"use client";
import { useRef, useState } from "react";

/**
 * **올리기** — 인스타의 + 단추 (227회차 09-29).
 *
 * 인스타는 사진을 고르면 **바로 미리 보여 준다.** 올린 뒤에야 결과를 보는 것과는 느낌이 아주 다르다 —
 * 고른 것이 맞는지 먼저 확인하고 글을 쓴다. 그래서 여기도 고르는 즉시 그려 준다
 * (`URL.createObjectURL` — 서버에 올리기 전이라 왕복이 0 이다).
 */
export default function Uploader() {
  const 파일칸 = useRef<HTMLInputElement>(null);
  const [미리, set미리] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [올리는중, set올리는중] = useState(false);
  const [말, set말] = useState<string | null>(null);

  function 골랐다(f: File | null) {
    if (미리) URL.revokeObjectURL(미리);
    set미리(f ? URL.createObjectURL(f) : null);
    set말(null);
  }

  async function 올리기() {
    const f = 파일칸.current?.files?.[0];
    if (!f) { set말("사진을 골라 주세요."); return; }
    set올리는중(true); set말(null);
    try {
      const fd = new FormData();
      fd.append("image", f);
      fd.append("caption", caption);
      const res = await fetch("/api/dot/my-posts", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      // 오류 글을 그대로 보여 준다 — "실패했어요" 하나로 뭉치면 무엇이 문제인지 아무도 모른다.
      if (!res.ok) { set말(j.error ?? "못 올렸어요."); set올리는중(false); return; }
      window.location.reload();
    } catch {
      set말("못 올렸어요. 잠시 뒤에 다시 해 주세요.");
      set올리는중(false);
    }
  }

  return (
    <div className="up">
      <style>{CSS}</style>
      <input ref={파일칸} type="file" accept="image/png,image/jpeg,image/webp" className="up-file"
        onChange={(e) => 골랐다(e.target.files?.[0] ?? null)} aria-label="사진 고르기" />
      {미리 ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={미리} alt="고른 사진" className="up-prev" />
          <textarea className="up-cap" value={caption} onChange={(e) => setCaption(e.target.value)}
            placeholder="무슨 사진인가요?" rows={2} maxLength={600} />
          <div className="up-go">
            <button onClick={() => { 골랐다(null); if (파일칸.current) 파일칸.current.value = ""; }} className="up-cancel" disabled={올리는중}>취소</button>
            <button onClick={올리기} className="up-post" disabled={올리는중}>{올리는중 ? "올리는 중…" : "올리기"}</button>
          </div>
        </>
      ) : (
        <button className="up-pick" onClick={() => 파일칸.current?.click()}>
          <span className="up-plus">+</span> 사진 올리기
        </button>
      )}
      {말 && <div className="up-err">{말}</div>}
    </div>
  );
}

const CSS = `
.up { padding:0 16px 14px; }
.up-file { display:none; }
.up-pick { width:100%; padding:13px; border:1px dashed #d4dae1; background:#fafbfc; border-radius:14px; font:inherit; font-size:14px; color:#5c6570; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; }
.up-plus { font-size:18px; line-height:1; color:#ff5c7a; font-weight:700; }
.up-prev { display:block; width:100%; aspect-ratio:1; object-fit:cover; border-radius:14px; background:#eef2f6; }
.up-cap { width:100%; margin-top:10px; padding:11px 12px; border:1px solid rgba(0,0,0,.12); border-radius:12px; font:inherit; font-size:14px; resize:none; outline:none; background:#fafbfc; }
.up-cap:focus { border-color:#ff5c7a; background:#fff; }
.up-go { display:flex; gap:8px; margin-top:10px; }
.up-cancel { flex:0 0 auto; padding:11px 16px; border:none; background:#eef1f5; color:#5c6570; border-radius:12px; font:inherit; font-size:14px; font-weight:600; cursor:pointer; }
.up-post { flex:1; padding:11px; border:none; background:#fee500; color:#1f1a00; border-radius:12px; font:inherit; font-size:14px; font-weight:700; cursor:pointer; }
.up-post:disabled, .up-cancel:disabled { opacity:.6; }
.up-err { margin-top:10px; padding:10px 12px; background:#fff1f3; color:#b4233d; border-radius:12px; font-size:13px; }
`;
