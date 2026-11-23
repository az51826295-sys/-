"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Preview = { period: number; logical: [number, number]; colors: number; preview: string };
type Got = { small: string; x8: string; logical: [number, number] };

export default function PixelClient({ en, paid }: { en: boolean; paid: string | null }) {
  const t = (ko: string, e: string) => (en ? e : ko);
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [period, setPeriod] = useState<number | null>(null);    // null = 자동
  const [colors, setColors] = useState(32);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shots, setShots] = useState<number | null>(null);
  const [payOpen, setPayOpen] = useState(true);
  const [got, setGot] = useState<Got | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await fetch("/api/dot/guest", { method: "POST" });   // 손님 자리(이미 있으면 그대로)
        const j = await (await fetch("/api/pixel/me", { cache: "no-store" })).json();
        if (alive) { setShots(Number(j.shots ?? 0)); setPayOpen(!!j.payOpen); }
      } catch { if (alive) setShots(0); }
    })();
    return () => { alive = false; };
  }, []);

  const run = useCallback(async (f: File, p: number | null, c: number) => {
    setBusy(true); setErr(null); setGot(null);
    const fd = new FormData();
    fd.append("image", f);
    if (p) fd.append("period", String(p));
    fd.append("colors", String(c));
    try {
      const r = await fetch("/api/pixel/convert", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? t("변환을 못 했어요.", "Conversion failed.")); setPv(null); }
      else { setPv(j); if (p === null) setPeriod(null); }
    } catch { setErr(t("인터넷을 확인해 주세요.", "Check your connection.")); }
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [en]);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setErr(t("10MB 아래 그림만 받아요.", "Max 10MB.")); return; }
    setFile(f); setSrc(URL.createObjectURL(f)); setPeriod(null); setPv(null);
    void run(f, null, colors);
  };

  // 슬라이더는 손을 뗀 뒤 0.4초에 한 번만 다시 변환한다
  const later = (p: number | null, c: number) => {
    if (!file) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(file, p, c), 400);
  };

  const download = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.append("image", file);
    fd.append("period", String(period ?? pv?.period ?? ""));
    fd.append("colors", String(colors));
    try {
      const r = await fetch("/api/pixel/download", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? t("받기에 실패했어요.", "Download failed."));
      else { setGot({ small: j.small, x8: j.x8, logical: j.logical }); setShots(j.left); }
    } catch { setErr(t("인터넷을 확인해 주세요.", "Check your connection.")); }
    setBusy(false);
  };

  const buy = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/pixel/pay", { method: "POST" });
      const j = await r.json();
      if (j.url) { window.location.href = j.url; return; }
      setErr(j.error ?? t("결제창을 못 열었어요.", "Couldn't open checkout."));
    } catch { setErr(t("인터넷을 확인해 주세요.", "Check your connection.")); }
    setBusy(false);
  };

  const shown = period ?? pv?.period ?? 8;
  const paidMsg =
    paid === "10" ? t("10장이 들어왔어요. 고마워요!", "10 conversions added. Thank you!")
    : paid === "wait" ? t("결제 확인 중이에요. 잠시 뒤 새로고침해 주세요.", "Payment is still processing. Refresh in a moment.")
    : paid === "fail" ? t("결제를 확인하지 못했어요. 돈이 나갔다면 이 화면을 다시 열어 주세요 — 한 번 더 확인해요.", "Couldn't confirm the payment. If you were charged, reopen this page and we'll check again.")
    : null;

  return (
    <div className="rp-root">
      <style>{CSS}</style>
      <main className="rp-wrap">
        <header className="rp-head">
          <h1>{t("진짜 도트 변환", "Real Pixel")}</h1>
          <p>{t("AI가 뽑은 ‘도트 같은 그림’을, 한 칸이 한 색인 진짜 도트로 바꿔요.", "Turn AI ‘pixel-style’ images into true pixel art — one cell, one color.")}</p>
        </header>

        {paidMsg && <div className="rp-note">{paidMsg}</div>}

        <label
          className={`rp-drop${src ? " has" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
        >
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0])} hidden />
          {src ? t("다른 그림 올리기", "Upload another") : t("그림 올리기 (PNG·JPG·WEBP, 10MB 이하)", "Upload an image (PNG/JPG/WEBP, up to 10MB)")}
        </label>

        {src && (
          <section className="rp-pair">
            <figure>
              <figcaption>{t("AI 원본", "AI original")}</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" />
            </figure>
            <figure>
              <figcaption>
                {t("진짜 도트", "Real pixel")}
                {pv && <span> · {pv.logical[0]}×{pv.logical[1]} · {pv.colors}{t("색", " colors")}</span>}
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {pv ? <img className="px" src={pv.preview} alt="" /> : <div className="rp-wait">{busy ? t("바꾸는 중…", "Converting…") : ""}</div>}
              {pv && <small>{t("미리보기라 줄무늬가 덮여 있어요. 받으면 깨끗해요.", "Preview has stripes. Your download is clean.")}</small>}
            </figure>
          </section>
        )}

        {pv && (
          <section className="rp-ctl">
            <div className="row">
              <span>{t("도트 크기", "Dot size")} <b>{shown.toFixed(1)}px</b>{period === null && <em> · {t("자동", "auto")}</em>}</span>
              <button type="button" disabled={period === null || busy} onClick={() => { setPeriod(null); if (file) void run(file, null, colors); }}>{t("자동으로", "Auto")}</button>
            </div>
            <input type="range" min={3} max={32} step={0.1} value={shown}
              onChange={(e) => { const v = Number(e.target.value); setPeriod(v); later(v, colors); }} />
            <p className="hint">{t("칸이 뭉개지면 작게, 잡티가 많으면 크게 옮겨 보세요.", "Smaller if details melt, bigger if it looks noisy.")}</p>
            <div className="row"><span>{t("색 수", "Colors")} <b>{colors}</b></span></div>
            <input type="range" min={4} max={64} step={1} value={colors}
              onChange={(e) => { const v = Number(e.target.value); setColors(v); later(period, v); }} />
          </section>
        )}

        {pv && (
          <section className="rp-buy">
            <div className="left">{shots === null ? "…" : t(`남은 변환 ${shots}장`, `${shots} conversion${shots === 1 ? "" : "s"} left`)}</div>
            {shots !== null && shots > 0 ? (
              <button type="button" className="go" disabled={busy} onClick={download}>{t("PNG 받기 (1장 사용)", "Download PNG (uses 1)")}</button>
            ) : (
              <button type="button" className="go" disabled={busy || !payOpen} onClick={buy}>
                {payOpen ? t("10장 4,900원", "10 for ₩4,900") : t("결제 준비 중", "Payments opening soon")}
              </button>
            )}
          </section>
        )}

        {got && (
          <section className="rp-got">
            <a href={got.x8} download="real-pixel-x8.png">{t("8배 크기 PNG", "8× PNG")}</a>
            <a href={got.small} download="real-pixel-1x.png">{t(`원본 크기 PNG (${got.logical[0]}×${got.logical[1]}, 한 칸 = 1px)`, `1× PNG (${got.logical[0]}×${got.logical[1]}, one cell = 1px)`)}</a>
          </section>
        )}

        {err && <p className="rp-err" role="alert">{err}</p>}

        <footer className="rp-foot">
          {t("올린 그림은 저장하지 않아요. 결제는 Polar(해외 결제 대행)로 처리돼요.", "We don't store your images. Payments are handled by Polar.")}{" "}
          <Link href="/dot/privacy">{t("개인정보 처리방침", "Privacy")}</Link> · <Link href="/dot">{t("두근도트", "Dot")}</Link>
        </footer>
      </main>
    </div>
  );
}

const CSS = `
.rp-root{min-height:100vh;background:#16161c;color:#eee;font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.rp-wrap{max-width:880px;margin:0 auto;padding:28px 16px 48px}
.rp-head h1{font-size:28px;margin:0 0 6px}
.rp-head p{margin:0 0 18px;color:#b9b9c6;line-height:1.5}
.rp-note{background:#24324a;border:1px solid #3b5ea0;padding:10px 12px;border-radius:10px;margin-bottom:14px}
.rp-drop{display:block;border:2px dashed #555a6e;border-radius:14px;padding:28px 12px;text-align:center;cursor:pointer;color:#cfd0dc;background:#1d1d25}
.rp-drop.has{padding:12px}
.rp-drop:hover{border-color:#ff7aa2}
.rp-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
@media (max-width:640px){.rp-pair{grid-template-columns:1fr}}
.rp-pair figure{margin:0;background:#1d1d25;border-radius:12px;padding:10px}
.rp-pair figcaption{font-size:14px;color:#b9b9c6;margin-bottom:8px}
.rp-pair figcaption span{color:#8d8ea0}
.rp-pair img{width:100%;height:auto;display:block;border-radius:6px;background:#2a2a33}
.rp-pair img.px{image-rendering:pixelated}
.rp-pair small{display:block;margin-top:6px;color:#8d8ea0;font-size:12px}
.rp-wait{aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:#8d8ea0}
.rp-ctl{margin-top:14px;background:#1d1d25;border-radius:12px;padding:12px 14px}
.rp-ctl .row{display:flex;justify-content:space-between;align-items:center;margin-top:6px}
.rp-ctl em{color:#8d8ea0;font-style:normal}
.rp-ctl input[type=range]{width:100%;accent-color:#ff7aa2}
.rp-ctl button{background:#2c2c38;color:#eee;border:1px solid #444;border-radius:8px;padding:4px 10px}
.rp-ctl button:disabled{opacity:.4}
.rp-ctl .hint{margin:2px 0 8px;color:#8d8ea0;font-size:12px}
.rp-buy{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px}
.rp-buy .go{background:#ff5d8f;color:#fff;border:0;border-radius:12px;padding:12px 18px;font-size:16px;font-weight:700;cursor:pointer}
.rp-buy .go:disabled{opacity:.5;cursor:default}
.rp-got{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.rp-got a{background:#24324a;color:#cfe0ff;padding:10px 12px;border-radius:10px;text-decoration:none}
.rp-err{color:#ff8fa8;margin-top:12px}
.rp-foot{margin-top:28px;color:#7d7e90;font-size:12px;line-height:1.6}
.rp-foot a{color:#9fa0b6}
`;
