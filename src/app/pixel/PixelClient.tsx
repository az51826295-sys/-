"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FROM_COOKIE, cleanFrom } from "@/lib/dot/from";

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
        // 어디서 왔나(11-24): /dot 의 FromTag 와 같은 쿠키를 쓰되 앞에 "px" 를 붙여 두근도트 손님과 가른다.
        // 꼬리표 없이 온 사람도 "px" 로 남긴다 — 이 페이지에 몇 명이 왔는지부터 센다. 이미 꼬리표가 있으면 덮지 않는다.
        try {
          if (!document.cookie.split("; ").some((c) => c.startsWith(`${FROM_COOKIE}=`))) {
            const v = cleanFrom(new URLSearchParams(window.location.search).get("from"));
            document.cookie = `${FROM_COOKIE}=${cleanFrom(v ? `px-${v}` : "px")}; max-age=${60 * 60 * 24 * 30}; path=/; samesite=lax`;
          }
        } catch { /* 쿠키를 막은 브라우저 — 세지 못할 뿐 변환은 그대로 */ }
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
    setFile(f); setSrc(URL.createObjectURL(f)); setPeriod(null); setPv(null); setMv(null); setMvGot(null); setAiGot(null);
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

  // ── 움직임 만들기(11-24): 시트를 프레임으로 잘라 움직이는 GIF + 게임용 시트
  const [mvAuto, setMvAuto] = useState(true);
  const [mvCols, setMvCols] = useState(3);
  const [mvRows, setMvRows] = useState(2);
  const [mvLock, setMvLock] = useState(true);
  const [mvMs, setMvMs] = useState(250);
  const [mv, setMv] = useState<{ count: number; cell: [number, number]; gif: string } | null>(null);
  const [mvGot, setMvGot] = useState<{ sheet: string; gif: string; count: number; cell: [number, number] } | null>(null);
  const mvForm = () => {
    const fd = new FormData();
    fd.append("image", file!);
    fd.append("period", String(period ?? pv?.period ?? ""));
    fd.append("colors", String(colors));
    if (!mvAuto) { fd.append("cols", String(mvCols)); fd.append("rows", String(mvRows)); }
    fd.append("ms", String(mvMs));
    if (mvLock) fd.append("lock", "1");
    return fd;
  };
  const movePreview = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setMvGot(null);
    try {
      const r = await fetch("/api/pixel/frames", { method: "POST", body: mvForm() });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? t("프레임을 못 나눴어요.", "Couldn't split frames.")); setMv(null); }
      else setMv({ count: j.count, cell: j.cell, gif: j.gif });
    } catch { setErr(t("인터넷을 확인해 주세요.", "Check your connection.")); }
    setBusy(false);
  };
  const moveDownload = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/pixel/frames/download", { method: "POST", body: mvForm() });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? t("받기에 실패했어요.", "Download failed."));
      else { setMvGot({ sheet: j.sheet, gif: j.gif, count: j.count, cell: j.cell }); setShots(j.left); }
    } catch { setErr(t("인터넷을 확인해 주세요.", "Check your connection.")); }
    setBusy(false);
  };

  // ── AI 로 동작 만들기(11-24 "생성자"): 그림 AI 값이 들어 미리보기 없이 장을 쓰고, 실패하면 서버가 돌려준다
  const [aiMotion, setAiMotion] = useState<"idle" | "walk" | "wave">("idle");
  const [aiGot, setAiGot] = useState<{ gif: string; sheet: string; count: number; cell: [number, number] } | null>(null);
  const aiMake = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setAiGot(null);
    const fd = new FormData();
    fd.append("image", file); fd.append("motion", aiMotion); fd.append("colors", String(colors)); fd.append("ms", String(mvMs));
    try {
      const r = await fetch("/api/pixel/motion", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? t("그리기에 실패했어요.", "Generation failed."));
      else { setAiGot({ gif: j.gif, sheet: j.sheet, count: j.count, cell: j.cell }); setShots(j.left); }
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

        {pv && (
          <section className="rp-move">
            <h2>{t("움직임 만들기", "Make it move")}</h2>
            <p className="hint">
              {t("표정·동작이 여러 개 든 시트라면, 진짜 도트로 바뀐 칸 격자 덕분에 프레임을 1px도 안 어긋나게 잘라 움직일 수 있어요. AI 원본은 칸 간격이 7.3px 같은 애매한 값이라 이렇게 안 잘려요.",
                 "If your sheet has several poses or faces, the true pixel grid lets us cut frames with zero drift and animate them. The raw AI image can't be cut this cleanly.")}
            </p>
            <ol className="how">
              <li>{t("나누기: 배경이 한 색이면 ‘자동’, 아니면 가로·세로 개수를 정해요.", "Split: ‘auto’ if the background is one color, otherwise set columns × rows.")}</li>
              <li>{t("몸통 고정: AI는 표정마다 몸을 조금씩 다르게 그려서 그대로 움직이면 몸이 떨려요. 켜면 표정만 바뀌어요(표정 시트 추천, 걷기 같은 동작은 끄기).", "Lock body: AI redraws the body slightly in every frame, so it jitters. Turn on to change only the face (great for expression sheets; off for walk cycles).")}</li>
              <li>{t("미리보기로 확인하고 받아요 — 게임엔 1배 프레임 시트 PNG, SNS엔 GIF.", "Preview, then download — a 1× frame sheet PNG for games and a GIF for posts.")}</li>
            </ol>
            <div className="row">
              <label><input type="radio" checked={mvAuto} onChange={() => setMvAuto(true)} /> {t("자동", "Auto")}</label>
              <label><input type="radio" checked={!mvAuto} onChange={() => setMvAuto(false)} /> {t("가로", "Cols")}</label>
              <input type="number" min={1} max={16} value={mvCols} disabled={mvAuto} onChange={(e) => setMvCols(Number(e.target.value))} />
              <span>×</span>
              <input type="number" min={1} max={16} value={mvRows} disabled={mvAuto} onChange={(e) => setMvRows(Number(e.target.value))} />
              <span>{t("세로", "rows")}</span>
            </div>
            <label className="row"><input type="checkbox" checked={mvLock} onChange={(e) => setMvLock(e.target.checked)} /> {t("몸통 고정 (표정만 바뀌게)", "Lock body (face only changes)")}</label>
            <div className="row"><span>{t("속도", "Speed")} <b>{mvMs}ms</b></span></div>
            <input type="range" min={80} max={800} step={10} value={mvMs} onChange={(e) => setMvMs(Number(e.target.value))} />
            <div className="row">
              <button type="button" disabled={busy} onClick={movePreview}>{t("움직임 미리보기 (무료)", "Preview motion (free)")}</button>
            </div>
            {mv && (
              <figure className="mv">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="px" src={mv.gif} alt="" />
                <figcaption>{t(`${mv.count}프레임 · 한 프레임 ${mv.cell[0]}×${mv.cell[1]}칸 · 미리보기라 줄무늬`, `${mv.count} frames · ${mv.cell[0]}×${mv.cell[1]} each · preview has stripes`)}</figcaption>
                {shots !== null && shots > 0 ? (
                  <button type="button" className="go" disabled={busy} onClick={moveDownload}>{t("움직임 받기 (1장 사용)", "Download motion (uses 1)")}</button>
                ) : (
                  <button type="button" className="go" disabled={busy || !payOpen} onClick={buy}>{payOpen ? t("10장 4,900원", "10 for ₩4,900") : t("결제 준비 중", "Payments opening soon")}</button>
                )}
              </figure>
            )}
            {mvGot && (
              <div className="rp-got">
                <a href={mvGot.gif} download="real-pixel-move.gif">{t("움직이는 GIF", "Animated GIF")}</a>
                <a href={mvGot.sheet} download="real-pixel-frames-1x.png">{t(`게임용 프레임 시트 PNG (${mvGot.count}프레임 · ${mvGot.cell[0]}×${mvGot.cell[1]} · 배경 투명)`, `Game frame sheet PNG (${mvGot.count} × ${mvGot.cell[0]}×${mvGot.cell[1]}, transparent)`)}</a>
              </div>
            )}
          </section>
        )}

        {src && (
          <section className="rp-move">
            <h2>{t("AI로 동작 만들기", "Generate a motion with AI")}</h2>
            <p className="hint">
              {t("캐릭터 그림 한 장이면 돼요. AI가 같은 캐릭터로 4프레임을 그리면, 진짜 도트로 바꿔 잘라서 움직이게 해 줘요. 같은 캐릭터가 아니게 나오면 한 번 더 그리고, 그래도 안 되면 장수를 돌려드려요.",
                 "One character image is enough. AI draws 4 frames of the same character, we convert them to true pixels, cut and animate. If it doesn't look like the same character we retry once, then refund.")}
            </p>
            <div className="row">
              {(["idle", "walk", "wave"] as const).map((m) => (
                <label key={m}><input type="radio" checked={aiMotion === m} onChange={() => setAiMotion(m)} /> {m === "idle" ? t("숨쉬기·깜빡임", "Idle") : m === "walk" ? t("걷기", "Walk") : t("손 흔들기", "Wave")}</label>
              ))}
            </div>
            <div className="row">
              {shots !== null && shots > 0 ? (
                <button type="button" className="go" disabled={busy} onClick={aiMake}>{busy ? t("그리는 중… (30초쯤)", "Drawing… (~30s)") : t("AI로 그리기 (1장 사용)", "Generate (uses 1)")}</button>
              ) : (
                <button type="button" className="go" disabled={busy || !payOpen} onClick={buy}>{payOpen ? t("10장 4,900원", "10 for ₩4,900") : t("결제 준비 중", "Payments opening soon")}</button>
              )}
            </div>
            {aiGot && (
              <figure className="mv">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="px" src={aiGot.gif} alt="" />
                <figcaption>{t(`${aiGot.count}프레임 · 한 프레임 ${aiGot.cell[0]}×${aiGot.cell[1]}칸`, `${aiGot.count} frames · ${aiGot.cell[0]}×${aiGot.cell[1]} each`)}</figcaption>
                <div className="rp-got">
                  <a href={aiGot.gif} download="real-pixel-ai-move.gif">{t("움직이는 GIF", "Animated GIF")}</a>
                  <a href={aiGot.sheet} download="real-pixel-ai-frames-1x.png">{t("게임용 프레임 시트 PNG (배경 투명)", "Game frame sheet PNG (transparent)")}</a>
                </div>
              </figure>
            )}
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
.rp-move{margin-top:18px;background:#1d1d25;border-radius:12px;padding:12px 14px}
.rp-move h2{font-size:18px;margin:0 0 6px}
.rp-move .hint{margin:0 0 8px;color:#b9b9c6;font-size:13px;line-height:1.5}
.rp-move .how{margin:0 0 10px;padding-left:18px;color:#b9b9c6;font-size:13px;line-height:1.6}
.rp-move .row{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.rp-move input[type=number]{width:56px;background:#2c2c38;color:#eee;border:1px solid #444;border-radius:6px;padding:4px}
.rp-move input[type=range]{width:100%;accent-color:#ff7aa2}
.rp-move button{background:#2c2c38;color:#eee;border:1px solid #444;border-radius:8px;padding:8px 12px}
.rp-move .go{background:#ff5d8f;border:0;font-weight:700;margin-top:10px}
.rp-move .mv{margin:12px 0 0}
.rp-move .mv img{max-width:100%;image-rendering:pixelated;border-radius:6px;display:block}
.rp-move .mv figcaption{color:#8d8ea0;font-size:12px;margin-top:6px}
.rp-move button:disabled{opacity:.5}
.rp-foot{margin-top:28px;color:#7d7e90;font-size:12px;line-height:1.6}
.rp-foot a{color:#9fa0b6}
`;
