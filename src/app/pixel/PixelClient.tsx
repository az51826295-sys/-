"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FROM_COOKIE, cleanFrom } from "@/lib/dot/from";
import GoogleGo from "@/app/dot/login/GoogleGo";
import { PIXEL_COST, PIXEL_PACK } from "@/lib/pixel/credits";

/**
 * 도트 작업실 화면(11-25 사장님: "픽셀랩 따라서 UI 구성해 줘").
 * 짜임만 따른다 — **왼쪽 도구 · 가운데 캔버스 · 오른쪽 옵션 · 아래 기록 줄**(폰에선 도구가 위 가로 줄, 옵션이 캔버스 아래).
 * 이름·로고·문구·색은 우리 것. 서버 라우트는 그대로(/api/pixel/*) — 화면만 바꿨다.
 *
 * "참조 캐릭터" 한 칸을 모든 도구가 같이 쓴다: 글로 만들거나 그림을 올리면 그게 참조가 되고, 4방향·동작·시트 자르기가 그걸 쓴다.
 */
type Tool = "game" | "create" | "rotate" | "animate" | "convert" | "split";
type Game = { name: string; imgs: string[]; palette: string[]; height: number };
type Item = { id: number; kind: Tool; title: string; view: string; info: string; downloads: { href: string; name: string; label: string }[]; refable?: string };
type Preview = { period: number; logical: [number, number]; colors: number; preview: string };

export default function PixelClient({ en, paid }: { en: boolean; paid: string | null }) {
  const t = (ko: string, e: string) => (en ? e : ko);
  const [tool, setTool] = useState<Tool>("create");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shots, setShots] = useState<number | null>(null);
  const [linked, setLinked] = useState(false); // 11-25: AI 그림·결제는 구글 등으로 연결한 계정만(선결제)
  const [payOpen, setPayOpen] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [cur, setCur] = useState<number | null>(null);
  const [ref, setRef] = useState<{ file: File; url: string } | null>(null);
  const nextId = useRef(1);
  const [games, setGames] = useState<Game[]>([]); // 내 게임(아래 "게임 추가" 참고) — 처음 불러오기 때문에 위에 둔다

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 어디서 왔나(11-24): /dot 의 FromTag 와 같은 쿠키, 앞에 "px". 이미 꼬리표가 있으면 덮지 않는다.
        try {
          if (!document.cookie.split("; ").some((c) => c.startsWith(`${FROM_COOKIE}=`))) {
            const v = cleanFrom(new URLSearchParams(window.location.search).get("from"));
            document.cookie = `${FROM_COOKIE}=${cleanFrom(v ? `px-${v}` : "px")}; max-age=${60 * 60 * 24 * 30}; path=/; samesite=lax`;
          }
        } catch { /* 쿠키를 막은 브라우저 — 세지 못할 뿐 */ }
        await fetch("/api/dot/guest", { method: "POST" });
        const j = await (await fetch("/api/pixel/me", { cache: "no-store" })).json();
        if (alive) { setShots(Number(j.shots ?? 0)); setPayOpen(!!j.payOpen); setLinked(!!j.linked); }
        // 저장해 둔 내 게임(브라우저에만)
        try { const xs = JSON.parse(localStorage.getItem("px-games") ?? "[]"); if (alive && Array.isArray(xs) && xs.length) setGames(xs); } catch { /* 없음 */ }
      } catch { if (alive) setShots(0); }
    })();
    return () => { alive = false; };
  }, []);

  const add = (it: Omit<Item, "id">) => { const id = nextId.current++; setItems((xs) => [{ ...it, id }, ...xs].slice(0, 30)); setCur(id); return id; };
  const shown = items.find((x) => x.id === cur) ?? null;
  const net = () => setErr(t("인터넷을 확인해 주세요.", "Check your connection."));

  // ── 도트 변환 상태(참조를 바꾸면 비운다)
  const [pv, setPv] = useState<Preview | null>(null);
  const [period, setPeriod] = useState<number | null>(null);
  const [colors, setColors] = useState(32);
  const [splitPv, setSplitPv] = useState<{ gif: string; count: number; cell: [number, number] } | null>(null);

  const setRefFile = (f: File) => {
    if (f.size > 10 * 1024 * 1024) { setErr(t("10MB 아래 그림만 받아요.", "Max 10MB.")); return; }
    setRef({ file: f, url: URL.createObjectURL(f) }); setPv(null); setPeriod(null); setSplitPv(null);
    if (tool === "convert") void convert(f, null, colors); // 변환 도구에서 그림을 바꾸면 바로 미리보기(convert 는 아래에 있지만 누를 때는 이미 있다)
  };
  const refFromUrl = async (u: string) => { const b = await (await fetch(u)).blob(); setRefFile(new File([b], "character.png", { type: "image/png" })); };

  const buy = async () => {
    setBusy("pay"); setErr(null);
    try {
      const r = await fetch("/api/pixel/pay", { method: "POST" });
      const j = await r.json();
      if (j.url) { window.location.href = j.url; return; }
      setErr(j.error ?? t("결제창을 못 열었어요.", "Couldn't open checkout."));
    } catch { net(); }
    setBusy(null);
  };
  const post = async (url: string, fd: FormData, label: string) => {
    setBusy(label); setErr(null);
    try {
      const r = await fetch(url, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { if (j.needLogin) setLinked(false); setErr(j.error ?? t("실패했어요.", "Failed.")); return null; }
      if (typeof j.left === "number") setShots(j.left);
      return j;
    } catch { net(); return null; } finally { setBusy(null); }
  };

  // ── 만들기
  const [cDesc, setCDesc] = useState("");
  const [cSize, setCSize] = useState<32 | 48 | 64 | 96>(48);
  // ── 내 게임(11-25 "게임 추가"): 게임 그림을 올려 두면 만들기가 그 그림체·키·팔레트로 맞춘다. 브라우저에만 저장(서버 저장 없음)
  const [gPick, setGPick] = useState<number>(-1); // 만들기에서 고른 게임(-1 = 기본)
  const [snap, setSnap] = useState(true);
  const [gName, setGName] = useState("");
  const [gImgs, setGImgs] = useState<string[]>([]);
  const [gProf, setGProf] = useState<{ palette: string[]; height: number; figures: number } | null>(null);
  const saveGames = (xs: Game[]) => { setGames(xs); try { localStorage.setItem("px-games", JSON.stringify(xs)); } catch { /* 너무 크면 이 창에서만 */ } };
  const toUrl = (f: File) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f); });
  const blobOf = async (u: string) => (await fetch(u)).blob();
  const gAdd = async (fs: FileList | null) => {
    if (!fs) return;
    const more = await Promise.all([...fs].filter((f) => f.size <= 10 * 1024 * 1024).slice(0, 4).map(toUrl));
    setGImgs((xs) => [...xs, ...more].slice(0, 4)); setGProf(null);
  };
  const gAnalyze = async () => {
    const fd = new FormData(); for (const u of gImgs) fd.append("game", await blobOf(u), "game.png");
    const j = await post("/api/pixel/style", fd, "game");
    if (j) setGProf({ palette: j.palette, height: j.height, figures: j.figures });
  };
  const gSave = () => {
    if (!gProf || !gImgs.length) return;
    const xs = [...games, { name: gName.trim() || t(`게임 ${games.length + 1}`, `Game ${games.length + 1}`), imgs: gImgs, palette: gProf.palette, height: gProf.height }];
    saveGames(xs); setGPick(xs.length - 1); setGName(""); setGImgs([]); setGProf(null); setTool("create");
  };

  const create = async () => {
    const fd = new FormData(); fd.append("desc", cDesc); fd.append("size", String(cSize));
    const g = games[gPick];
    if (g) { for (const u of g.imgs) fd.append("game", await blobOf(u), "game.png"); if (snap) fd.append("snap", "1"); }
    const j = await post("/api/pixel/create", fd, "create");
    if (!j) return;
    add({ kind: "create", title: cDesc.slice(0, 40), view: j.big, info: (j.facts as string[]).join(" · "), refable: j.big,
      downloads: [{ href: j.png, name: `character-${j.size}px.png`, label: t(`게임용 PNG ${j.size}×${j.size}`, `Game PNG ${j.size}×${j.size}`) }, { href: j.big, name: `character-${j.size}px-x8.png`, label: t("8배 PNG", "8× PNG") }] });
    await refFromUrl(j.big);
  };

  // ── 4방향 · 동작(그림 AI)
  const [aMotion, setAMotion] = useState<"idle" | "walk" | "wave" | "custom">("idle");
  const [aAction, setAAction] = useState("");
  const [ms, setMs] = useState(250);
  const motion = async (m: "turn" | "idle" | "walk" | "wave" | "custom") => {
    if (!ref) return;
    const fd = new FormData(); fd.append("image", ref.file); fd.append("motion", m); fd.append("ms", String(m === "turn" ? 600 : ms));
    if (m === "custom") fd.append("action", aAction);
    const j = await post("/api/pixel/motion", fd, m === "turn" ? "rotate" : "animate");
    if (!j) return;
    const name = m === "turn" ? t("4방향", "4 directions") : m === "custom" ? aAction.slice(0, 30) : m;
    add({ kind: m === "turn" ? "rotate" : "animate", title: name, view: m === "turn" ? j.sheet : j.gif, info: t(`${j.count}프레임 · ${j.cell[0]}×${j.cell[1]}`, `${j.count} frames · ${j.cell[0]}×${j.cell[1]}`),
      downloads: [{ href: j.sheet, name: `${m}-frames-1x.png`, label: t("프레임 시트 PNG (1배·투명)", "Frame sheet PNG (1×, transparent)") }, { href: j.gif, name: `${m}.gif`, label: "GIF" }] });
  };

  // ── 이미지 → 진짜 도트(미리보기 무료)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convert = useCallback(async (f: File, p: number | null, c: number) => {
    const fd = new FormData(); fd.append("image", f); if (p) fd.append("period", String(p)); fd.append("colors", String(c));
    setBusy("convert"); setErr(null);
    try {
      const r = await fetch("/api/pixel/convert", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? t("변환을 못 했어요.", "Conversion failed.")); setPv(null); } else setPv(j);
    } catch { setErr(t("인터넷을 확인해 주세요.", "Check your connection.")); }
    setBusy(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [en]);
  const goTool = (k: Tool) => { setTool(k); setErr(null); if (k === "convert" && ref && !pv && !busy) void convert(ref.file, period, colors); };
  const later = (p: number | null, c: number) => { if (!ref) return; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void convert(ref.file, p, c), 400); };
  const convDownload = async () => {
    if (!ref) return;
    const fd = new FormData(); fd.append("image", ref.file); fd.append("period", String(period ?? pv?.period ?? "")); fd.append("colors", String(colors));
    const j = await post("/api/pixel/download", fd, "convert");
    if (!j) return;
    add({ kind: "convert", title: t("진짜 도트", "Real pixel"), view: j.x8, info: `${j.logical[0]}×${j.logical[1]}`, refable: j.x8,
      downloads: [{ href: j.small, name: "real-pixel-1x.png", label: t(`1배 PNG ${j.logical[0]}×${j.logical[1]}`, `1× PNG ${j.logical[0]}×${j.logical[1]}`) }, { href: j.x8, name: "real-pixel-x8.png", label: t("8배 PNG", "8× PNG") }] });
  };

  // ── 시트 자르기(미리보기 무료)
  const [sAuto, setSAuto] = useState(true);
  const [sCols, setSCols] = useState(3);
  const [sRows, setSRows] = useState(2);
  const [sLock, setSLock] = useState(true);
  const splitForm = () => {
    const fd = new FormData(); fd.append("image", ref!.file); fd.append("colors", String(colors));
    if (pv) fd.append("period", String(period ?? pv.period));
    if (!sAuto) { fd.append("cols", String(sCols)); fd.append("rows", String(sRows)); }
    fd.append("ms", String(ms)); if (sLock) fd.append("lock", "1");
    return fd;
  };
  const splitPreview = async () => { if (!ref) return; const j = await post("/api/pixel/frames", splitForm(), "split"); if (j) setSplitPv({ gif: j.gif, count: j.count, cell: j.cell }); };
  const splitDownload = async () => {
    if (!ref) return;
    const j = await post("/api/pixel/frames/download", splitForm(), "split");
    if (!j) return;
    add({ kind: "split", title: t("자른 움직임", "Split motion"), view: j.gif, info: t(`${j.count}프레임 · ${j.cell[0]}×${j.cell[1]}`, `${j.count} frames · ${j.cell[0]}×${j.cell[1]}`),
      downloads: [{ href: j.sheet, name: "frames-1x.png", label: t("프레임 시트 PNG (1배·투명)", "Frame sheet PNG (1×, transparent)") }, { href: j.gif, name: "move.gif", label: "GIF" }] });
  };

  const TOOLS: { k: Tool; ko: string; en: string; sub: string; subEn: string; ai: boolean }[] = [
    { k: "game", ko: "내 게임", en: "My game", sub: "그림체 등록", subEn: "register a style", ai: false },
    { k: "create", ko: "만들기", en: "Create", sub: "글 → 캐릭터", subEn: "text → character", ai: true },
    { k: "rotate", ko: "4방향", en: "Rotate", sub: "앞·옆·뒤", subEn: "front · side · back", ai: true },
    { k: "animate", ko: "동작", en: "Animate", sub: "숨쉬기·걷기·글로", subEn: "idle · walk · text", ai: true },
    { k: "convert", ko: "도트 변환", en: "Pixelate", sub: "그림 → 진짜 도트", subEn: "image → true pixels", ai: false },
    { k: "split", ko: "시트 자르기", en: "Split sheet", sub: "시트 → 움직임", subEn: "sheet → animation", ai: false },
  ];
  const needRef = tool !== "create" && tool !== "game";
  const has = shots !== null && shots > 0; // 11-25 토큰: 버튼마다 값이 달라 "모자람" 은 can(값) 으로 본다
  const can = (n: number) => shots !== null && shots >= n;
  // 11-25 사장님 "계정 연동해야지 · 도트 그림 만들기는 선결제로": 손님은 결제·AI 그림 대신 구글 연결 단추를 본다(무료 장수 없음)
  const connect = (
    <div className="connect">
      <p>{t("구글 계정을 연결하면 토큰을 사서 쓸 수 있어요. 산 토큰은 계정에 남아요.", "Connect a Google account to buy and use tokens. Tokens stay with your account.")}</p>
      <GoogleGo already={false} en={en} next="/pixel" />
    </div>
  );
  const buyBtn = !linked ? connect : <button type="button" className="go" disabled={!!busy || !payOpen} onClick={buy}>{payOpen ? t(`${PIXEL_PACK.shots}토큰 4,900원`, `${PIXEL_PACK.shots} tokens for ₩4,900`) : t("결제 준비 중", "Payments opening soon")}</button>;
  const paidMsg = (paid === "100" || paid === "10") ? t(`${PIXEL_PACK.shots}토큰이 들어왔어요. 고마워요!`, `${PIXEL_PACK.shots} tokens added. Thank you!`)
    : paid === "wait" ? t("결제 확인 중이에요. 잠시 뒤 새로고침해 주세요.", "Payment is still processing. Refresh in a moment.")
    : paid === "fail" ? t("결제를 확인하지 못했어요. 돈이 나갔다면 이 화면을 다시 열어 주세요 — 한 번 더 확인해요.", "Couldn't confirm the payment. If you were charged, reopen this page and we'll check again.") : null;

  // 캔버스: 지금 도구의 무료 미리보기가 있으면 그걸, 아니면 고른 기록을
  const canvas: { src: string; cap: string; preview?: boolean } | null =
    tool === "convert" && pv ? { src: pv.preview, cap: t(`${pv.logical[0]}×${pv.logical[1]} · ${pv.colors}색 · 미리보기(받으면 줄무늬 없음)`, `${pv.logical[0]}×${pv.logical[1]} · ${pv.colors} colors · preview (download is clean)`), preview: true }
    : tool === "split" && splitPv ? { src: splitPv.gif, cap: t(`${splitPv.count}프레임 · ${splitPv.cell[0]}×${splitPv.cell[1]} · 미리보기`, `${splitPv.count} frames · preview`), preview: true }
    : shown ? { src: shown.view, cap: shown.info } : null;

  return (
    <div className="px-root">
      <style>{CSS}</style>
      <header className="px-top">
        <b>{t("도트 작업실", "Pixel Studio")}</b>
        <span className="sp" />
        <span className="bal">{shots === null ? "…" : t(`남은 ${shots}토큰`, `${shots} tokens`)}</span>
        {!has && linked && buyBtn}
      </header>
      {paidMsg && <div className="px-note">{paidMsg}</div>}

      <div className="px-app">
        <nav className="px-tools" aria-label={t("도구", "Tools")}>
          {TOOLS.map((x) => (
            <button key={x.k} type="button" className={tool === x.k ? "on" : ""} onClick={() => goTool(x.k)}>
              <span>{t(x.ko, x.en)}{x.ai && <i>AI</i>}</span><small>{t(x.sub, x.subEn)}</small>
            </button>
          ))}
        </nav>

        <main className="px-canvas">
          {canvas ? (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={canvas.src} alt="" />
              <figcaption>{canvas.cap}</figcaption>
              {!canvas.preview && shown && (
                <div className="dl">
                  {shown.downloads.map((d) => <a key={d.name} href={d.href} download={d.name}>{d.label}</a>)}
                  {shown.refable && <button type="button" onClick={() => void refFromUrl(shown.refable!)}>{t("참조로 쓰기", "Use as reference")}</button>}
                </div>
              )}
            </figure>
          ) : (
            <div className="empty">{busy ? t("작업 중…", "Working…") : t("도구를 고르고 시작해요. 처음이면 ‘만들기’에 캐릭터를 글로 적어 보세요.", "Pick a tool to start. New here? Describe a character in ‘Create’.")}</div>
          )}
          {busy && canvas && <div className="busy">{t("작업 중…", "Working…")}</div>}
        </main>

        <aside className="px-opts">
          {needRef && (
            <div className="ref">
              <div className="lab">{tool === "split" ? t("시트 그림", "Sheet image") : tool === "convert" ? t("바꿀 그림", "Image") : t("참조 캐릭터", "Reference")}</div>
              <label className={`slot${ref ? " has" : ""}`}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setRefFile(f); }}>
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setRefFile(f); }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {ref ? <img src={ref.url} alt="" /> : <span>{t("그림 올리기", "Upload")}<br /><small>PNG·JPG·WEBP · 10MB</small></span>}
              </label>
              <small className="hint">{ref ? t("눌러서 바꾸기 · 기록에서 ‘참조로 쓰기’도 돼요", "Click to replace · or ‘Use as reference’ from history") : t("‘만들기’로 만든 캐릭터는 자동으로 여기 들어와요", "Characters from ‘Create’ land here automatically")}</small>
            </div>
          )}

          {tool === "game" && (<>
            <h2>{t("내 게임 추가", "Add my game")}</h2>
            <p className="hint">{t("내 게임 캐릭터 그림(스프라이트·시트)을 1~4장 올려요. 새 캐릭터를 이 게임 그림체로, 같은 키(칸 수)로, 원하면 이 게임 색만 써서 만들어요. 분석은 무료고, 그림은 이 브라우저에만 저장돼요.",
              "Upload 1-4 sprites or sheets from your game. New characters will match its style, height in pixels and (optionally) its palette. Analysis is free; images stay in this browser.")}</p>
            <input className="txt" type="text" maxLength={30} value={gName} onChange={(e) => setGName(e.target.value)} placeholder={t("게임 이름", "Game name")} />
            <label className="gslot">
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => void gAdd(e.target.files)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {gImgs.length ? <span className="thumbs">{gImgs.map((u, i) => <img key={i} src={u} alt="" />)}</span> : <span>{t("게임 그림 올리기 (최대 4장)", "Upload game art (up to 4)")}</span>}
            </label>
            {gImgs.length > 0 && <button type="button" onClick={() => { setGImgs([]); setGProf(null); }}>{t("다시 고르기", "Clear")}</button>}
            <button type="button" disabled={!!busy || !gImgs.length} onClick={gAnalyze}>{busy === "game" ? t("분석 중…", "Analyzing…") : t("그림체 분석 (무료)", "Analyze (free)")}</button>
            {gProf && (<>
              <div className="lab">{t(`캐릭터 ${gProf.figures}명 찾음 · 키 ${gProf.height}칸 · ${gProf.palette.length}색`, `${gProf.figures} figures · ${gProf.height}px tall · ${gProf.palette.length} colors`)}</div>
              <div className="pal">{gProf.palette.map((c) => <i key={c} style={{ background: c }} title={c} />)}</div>
              <button type="button" className="go" onClick={gSave}>{t("이 게임 저장하고 만들기로", "Save & go to Create")}</button>
            </>)}
            {games.length > 0 && (<>
              <div className="lab">{t("저장한 게임", "Saved games")}</div>
              {games.map((g, i) => (
                <div key={i} className="grow">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <span className="thumbs">{g.imgs.slice(0, 2).map((u, j) => <img key={j} src={u} alt="" />)}</span>
                  <b>{g.name}</b><small>{g.height}{t("칸", "px")}</small>
                  <button type="button" className="mini" onClick={() => { setGPick(i); setTool("create"); }}>{t("쓰기", "Use")}</button>
                  <button type="button" className="mini" onClick={() => { saveGames(games.filter((_, k) => k !== i)); setGPick(-1); }}>{t("지우기", "Delete")}</button>
                </div>
              ))}
            </>)}
          </>)}

          {tool === "create" && (<>
            <h2>{t("글로 캐릭터 만들기", "Create from text")}</h2>
            <div className="lab">{t("그림체", "Style")}</div>
            <div className="seg wrap">
              <button type="button" className={gPick < 0 ? "on" : ""} onClick={() => setGPick(-1)}>{t("기본", "Default")}</button>
              {games.map((g, i) => <button key={i} type="button" className={gPick === i ? "on" : ""} onClick={() => setGPick(i)}>{g.name}</button>)}
              <button type="button" onClick={() => setTool("game")}>{t("+ 내 게임", "+ My game")}</button>
            </div>
            <textarea value={cDesc} maxLength={200} rows={3} onChange={(e) => setCDesc(e.target.value)} placeholder={t("예: 빨간 망토를 두른 꼬마 기사, 은색 투구", "e.g. a small knight in a red cape, silver helmet")} />
            {games[gPick] ? (
              <label className="row"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> {t(`게임 색만 쓰기 (${games[gPick].palette.length}색) · 키 ${games[gPick].height}칸으로 맞춤`, `Only the game's ${games[gPick].palette.length} colors · ${games[gPick].height}px tall`)}</label>
            ) : (<>
              <div className="lab">{t("캔버스 (px)", "Canvas (px)")}</div>
              <div className="seg">{([32, 48, 64, 96] as const).map((z) => <button key={z} type="button" className={cSize === z ? "on" : ""} onClick={() => setCSize(z)}>{z}</button>)}</div>
            </>)}
            <p className="hint">{t("배경 투명 PNG로 받아요. 만든 캐릭터는 바로 참조가 돼서 4방향·동작으로 이어져요. 실패하면 토큰을 돌려드려요.", "Transparent PNG. The result becomes your reference for Rotate and Animate. Refunded if it fails.")}</p>
            {can(PIXEL_COST.create) ? <button type="button" className="go" disabled={!!busy || cDesc.trim().length < 2} onClick={create}>{busy === "create" ? t("그리는 중… (20초쯤)", "Drawing… (~20s)") : t(`만들기 · ${PIXEL_COST.create}토큰`, `Create · ${PIXEL_COST.create} tokens`)}</button> : buyBtn}
          </>)}

          {tool === "rotate" && (<>
            <h2>{t("4방향 만들기", "Rotate (4 directions)")}</h2>
            <p className="hint">{t("참조 캐릭터를 앞 → 오른쪽 → 뒤 → 왼쪽으로 그려요. 게임 캐릭터 기본 세트예요. 같은 캐릭터가 아니게 나오면 한 번 더 그리고, 그래도 안 되면 토큰을 돌려드려요.", "Draws the reference facing front → right → back → left. Retries once if it drifts, then refunds.")}</p>
            {can(PIXEL_COST.turn) ? <button type="button" className="go" disabled={!!busy || !ref} onClick={() => void motion("turn")}>{busy === "rotate" ? t("그리는 중… (30초쯤)", "Drawing… (~30s)") : t(`4방향 · ${PIXEL_COST.turn}토큰`, `Rotate · ${PIXEL_COST.turn} tokens`)}</button> : buyBtn}
          </>)}

          {tool === "animate" && (<>
            <h2>{t("동작 만들기", "Animate")}</h2>
            <div className="seg wrap">
              {(["idle", "walk", "wave", "custom"] as const).map((m) => (
                <button key={m} type="button" className={aMotion === m ? "on" : ""} onClick={() => setAMotion(m)}>
                  {m === "idle" ? t("숨쉬기", "Idle") : m === "walk" ? t("걷기", "Walk") : m === "wave" ? t("손 흔들기", "Wave") : t("글로 적기", "Text")}
                </button>
              ))}
            </div>
            {aMotion === "custom" && <input className="txt" type="text" maxLength={120} value={aAction} onChange={(e) => setAAction(e.target.value)} placeholder={t("예: 칼을 휘두른다, 점프한다", "e.g. swings a sword, jumps")} />}
            <div className="lab">{t("속도", "Speed")} <b>{ms}ms</b></div>
            <input type="range" min={80} max={800} step={10} value={ms} onChange={(e) => setMs(Number(e.target.value))} />
            <p className="hint">{t("4프레임을 그려 진짜 도트로 맞춰 잘라요. 게임용 1배 시트와 GIF를 줘요.", "Draws 4 frames, snaps to true pixels, gives a 1× sheet and a GIF.")}</p>
            {can(PIXEL_COST.motion) ? <button type="button" className="go" disabled={!!busy || !ref || (aMotion === "custom" && aAction.trim().length < 2)} onClick={() => void motion(aMotion)}>{busy === "animate" ? t("그리는 중… (30초쯤)", "Drawing… (~30s)") : t(`동작 · ${PIXEL_COST.motion}토큰`, `Animate · ${PIXEL_COST.motion} tokens`)}</button> : buyBtn}
          </>)}

          {tool === "convert" && (<>
            <h2>{t("진짜 도트로 바꾸기", "Pixelate")}</h2>
            <p className="hint">{t("AI가 뽑은 ‘도트 같은 그림’을 한 칸이 한 색인 진짜 도트로. 미리보기는 무료예요.", "Turns AI ‘pixel-style’ images into true pixels. Preview is free.")}</p>
            {pv && (<>
              <div className="lab">{t("도트 크기", "Dot size")} <b>{(period ?? pv.period).toFixed(1)}px</b>{period === null && <em> · {t("자동", "auto")}</em>}
                <button type="button" className="mini" disabled={period === null || !!busy} onClick={() => { setPeriod(null); if (ref) void convert(ref.file, null, colors); }}>{t("자동", "Auto")}</button></div>
              <input type="range" min={3} max={32} step={0.1} value={period ?? pv.period} onChange={(e) => { const v = Number(e.target.value); setPeriod(v); later(v, colors); }} />
              <div className="lab">{t("색 수", "Colors")} <b>{colors}</b></div>
              <input type="range" min={4} max={64} step={1} value={colors} onChange={(e) => { const v = Number(e.target.value); setColors(v); later(period, v); }} />
            </>)}
            {can(PIXEL_COST.convert) ? <button type="button" className="go" disabled={!!busy || !pv} onClick={convDownload}>{t(`PNG 받기 · ${PIXEL_COST.convert}토큰`, `Download · ${PIXEL_COST.convert} tokens`)}</button> : buyBtn}
          </>)}

          {tool === "split" && (<>
            <h2>{t("시트를 움직임으로", "Split a sheet")}</h2>
            <p className="hint">{t("표정·동작이 여러 개 든 시트를 진짜 도트 격자로 1px도 안 어긋나게 잘라 움직여요. 미리보기는 무료예요.", "Cuts a multi-pose sheet on the true pixel grid with zero drift. Preview is free.")}</p>
            <div className="seg"><button type="button" className={sAuto ? "on" : ""} onClick={() => setSAuto(true)}>{t("자동", "Auto")}</button><button type="button" className={!sAuto ? "on" : ""} onClick={() => setSAuto(false)}>{t("가로×세로", "Grid")}</button></div>
            {!sAuto && <div className="row"><input type="number" min={1} max={16} value={sCols} onChange={(e) => setSCols(Number(e.target.value))} /> × <input type="number" min={1} max={16} value={sRows} onChange={(e) => setSRows(Number(e.target.value))} /></div>}
            <label className="row"><input type="checkbox" checked={sLock} onChange={(e) => setSLock(e.target.checked)} /> {t("몸통 고정 (표정 시트용)", "Lock body (for face sheets)")}</label>
            <div className="lab">{t("속도", "Speed")} <b>{ms}ms</b></div>
            <input type="range" min={80} max={800} step={10} value={ms} onChange={(e) => setMs(Number(e.target.value))} />
            <button type="button" disabled={!!busy || !ref} onClick={splitPreview}>{t("미리보기 (무료)", "Preview (free)")}</button>
            {can(PIXEL_COST.split) ? <button type="button" className="go" disabled={!!busy || !splitPv} onClick={splitDownload}>{t(`받기 · ${PIXEL_COST.split}토큰`, `Download · ${PIXEL_COST.split} tokens`)}</button> : buyBtn}
          </>)}

          {err && <p className="err" role="alert">{err}</p>}
        </aside>
      </div>

      <section className="px-hist" aria-label={t("기록", "History")}>
        <div className="lab">{t("기록 (이 창에서만 · 새로고침하면 사라져요 — 필요한 건 받아 두세요)", "History (this tab only — download what you need)")}</div>
        <div className="strip">
          {items.length === 0 && <span className="none">{t("아직 없어요", "Nothing yet")}</span>}
          {items.map((x) => (
            <button key={x.id} type="button" className={x.id === cur ? "on" : ""} onClick={() => { setCur(x.id); if (tool === "convert" || tool === "split") setTool(x.kind); }} title={x.title}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={x.view} alt="" /><small>{x.title}</small>
            </button>
          ))}
        </div>
      </section>

      <footer className="px-foot">
        {t("올린 그림은 저장하지 않아요. 결제는 Polar(해외 결제 대행)로 처리돼요.", "We don't store your images. Payments are handled by Polar.")}{" "}
        <Link href="/dot/privacy">{t("개인정보 처리방침", "Privacy")}</Link> · <Link href="/dot">{t("두근도트", "Dot")}</Link>
      </footer>
    </div>
  );
}

const CSS = `
.px-root{min-height:100vh;background:#121217;color:#e9e9f0;font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;display:flex;flex-direction:column}
.px-top{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #26262f;background:#17171e}
.px-top b{font-size:17px;white-space:nowrap}.px-top .sp{flex:1}.px-top .bal{color:#b9b9c6;font-size:14px;white-space:nowrap}
.px-note{background:#24324a;border-bottom:1px solid #3b5ea0;padding:8px 16px;font-size:14px}
.px-app{flex:1;display:grid;grid-template-columns:168px 1fr 300px;min-height:0}
.px-tools{display:flex;flex-direction:column;gap:4px;padding:10px;border-right:1px solid #26262f;background:#15151b}
.px-tools button{text-align:left;background:none;border:1px solid transparent;color:#cfd0dc;border-radius:10px;padding:9px 10px;cursor:pointer}
.px-tools button span{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:600}
.px-tools button i{font-style:normal;font-size:10px;background:#3a2740;color:#ff9fc0;border-radius:5px;padding:1px 5px}
.px-tools button small{display:block;color:#7f8094;font-size:12px;margin-top:2px}
.px-tools button.on{background:#232330;border-color:#3a3a4a;color:#fff}
.px-tools button:hover{background:#1e1e28}
.px-canvas{position:relative;display:flex;align-items:center;justify-content:center;padding:16px;min-height:420px;background:#101015}
.px-canvas figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:10px;max-width:100%}
.px-canvas img{max-width:100%;max-height:62vh;min-width:min(320px,100%);image-rendering:pixelated;object-fit:contain;border-radius:8px;background:repeating-conic-gradient(#2e2e39 0% 25%,#23232c 0% 50%) 50%/20px 20px}
.px-canvas figcaption{color:#8d8ea0;font-size:13px;text-align:center}
.px-canvas .dl{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.px-canvas .dl a,.px-canvas .dl button{background:#24324a;color:#cfe0ff;border:0;padding:8px 12px;border-radius:9px;text-decoration:none;font-size:14px;cursor:pointer}
.px-canvas .empty{color:#7f8094;max-width:340px;text-align:center;line-height:1.6}
.px-canvas .busy{position:absolute;top:12px;right:12px;background:#2a2a36;padding:5px 10px;border-radius:8px;font-size:13px}
.px-opts{border-left:1px solid #26262f;background:#17171e;padding:14px;display:flex;flex-direction:column;gap:9px}
.px-opts h2{font-size:16px;margin:4px 0 0}
.px-opts .lab{font-size:13px;color:#b9b9c6;display:flex;align-items:center;gap:6px}
.px-opts .lab em{color:#7f8094;font-style:normal}
.px-opts .hint{margin:0;color:#8d8ea0;font-size:12.5px;line-height:1.55}
.px-opts textarea,.px-opts .txt{width:100%;box-sizing:border-box;background:#22222c;color:#eee;border:1px solid #3a3a48;border-radius:9px;padding:9px;font:inherit;resize:vertical}
.px-opts input[type=range]{width:100%;accent-color:#ff6f9c}
.px-opts input[type=number]{width:56px;background:#22222c;color:#eee;border:1px solid #3a3a48;border-radius:6px;padding:4px}
.px-opts .row{display:flex;align-items:center;gap:8px;font-size:14px}
.px-opts button{background:#262632;color:#eee;border:1px solid #3a3a48;border-radius:9px;padding:9px 12px;cursor:pointer;font-size:14px}
.px-opts button:disabled{opacity:.45;cursor:default}
.px-opts .mini{padding:2px 8px;font-size:12px;margin-left:auto}
.px-opts .seg{display:flex;gap:4px}.px-opts .seg.wrap{flex-wrap:wrap}
.px-opts .seg button{flex:1;padding:7px 6px}
.px-opts .seg button.on{background:#ff6f9c;border-color:#ff6f9c;color:#fff;font-weight:700}
.px-root .go{background:#ff5d8f;border:0;color:#fff;font-weight:700;border-radius:10px;padding:11px 14px;font-size:15px;cursor:pointer;width:100%}
.px-root .go:disabled{opacity:.5;cursor:default}
.px-root .px-top .go{width:auto;padding:7px 12px;font-size:14px;white-space:nowrap}
.px-opts .ref .slot{display:flex;align-items:center;justify-content:center;height:120px;border:2px dashed #45465a;border-radius:10px;cursor:pointer;color:#b9b9c6;text-align:center;font-size:14px;background:repeating-conic-gradient(#24242d 0% 25%,#1d1d25 0% 50%) 50%/16px 16px;margin-top:4px}
.px-opts .ref .slot.has{border-style:solid;border-color:#3a3a48}
.px-opts .ref .slot img{max-height:110px;max-width:100%;image-rendering:pixelated}
.px-opts .ref .slot:hover{border-color:#ff6f9c}
.px-opts .gslot{display:flex;align-items:center;justify-content:center;min-height:90px;border:2px dashed #45465a;border-radius:10px;cursor:pointer;color:#b9b9c6;font-size:14px;padding:6px}
.px-opts .gslot:hover{border-color:#ff6f9c}
.px-opts .thumbs{display:flex;gap:4px;flex-wrap:wrap;justify-content:center}
.px-opts .thumbs img{height:64px;max-width:120px;object-fit:contain;image-rendering:pixelated;background:#22222c;border-radius:4px}
.px-opts .grow .thumbs img{height:32px;max-width:48px}
.px-opts .pal{display:flex;flex-wrap:wrap;gap:3px}.px-opts .pal i{width:18px;height:18px;border-radius:3px;border:1px solid #0006}
.px-opts .grow{display:flex;align-items:center;gap:6px;font-size:14px}.px-opts .grow b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.px-opts .grow small{color:#7f8094}
.px-root .connect{display:flex;flex-direction:column;gap:8px}.px-root .connect p{margin:0;font-size:13px;color:#b9b9c6;line-height:1.5}
.px-root .lg-google{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px;border-radius:10px;border:0;background:#fff;color:#222;font-weight:700;font-size:15px;cursor:pointer}
.px-root .lg-google:disabled{opacity:.6}.px-root .lg-err{color:#ff8fa8;font-size:13px;margin:0}
.px-opts .err{color:#ff8fa8;font-size:14px;margin:0}
.px-hist{border-top:1px solid #26262f;background:#15151b;padding:8px 16px}
.px-hist .lab{font-size:12px;color:#7f8094;margin-bottom:6px}
.px-hist .strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
.px-hist .none{color:#5f6072;font-size:13px}
.px-hist button{flex:0 0 auto;width:84px;background:#1d1d25;border:1px solid #2c2c38;border-radius:9px;padding:4px;cursor:pointer;color:#b9b9c6}
.px-hist button.on{border-color:#ff6f9c}
.px-hist img{width:74px;height:74px;object-fit:contain;image-rendering:pixelated;display:block;background:repeating-conic-gradient(#2e2e39 0% 25%,#23232c 0% 50%) 50%/12px 12px;border-radius:6px}
.px-hist small{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}
.px-foot{padding:12px 16px 20px;color:#6f7083;font-size:12px}.px-foot a{color:#9fa0b6}
@media (max-width:860px){
  .px-app{grid-template-columns:1fr}
  .px-tools{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid #26262f;padding:8px}
  .px-tools button{flex:0 0 auto;padding:7px 10px}
  .px-tools button small{display:none}
  .px-canvas{min-height:260px;padding:12px}
  .px-opts{border-left:0;border-top:1px solid #26262f}
}
`;
