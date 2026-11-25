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

const ICON: Record<Tool, string[]> = {
  game: ["........", ".######.", "#.#....#", "###.#.##", "#.#..#.#", "#......#", ".##..##.", "........"],
  create: ["......##", ".....###", "....###.", "...###..", "..###...", ".###....", ".##.....", "#......."],
  rotate: ["..####..", ".#....#.", "#......#", "#....###", "#.....#.", "#.......", ".#....#.", "..####.."],
  animate: [".#......", ".##.....", ".###....", ".####...", ".####...", ".###....", ".##.....", ".#......"],
  convert: ["##..##..", "##..##..", "..##..##", "..##..##", "##..##..", "##..##..", "..##..##", "..##..##"],
  split: ["#.....#.", ".#...#..", "..#.#...", "...#....", "..#.#...", "##...##.", "##...##.", "........"],
};
/** 8x8 도트 아이콘(화면 장식) */
function Ico({ k }: { k: Tool }) {
  return (
    <svg className="ico" viewBox="0 0 8 8" width="16" height="16" shapeRendering="crispEdges" aria-hidden>
      {ICON[k].flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
    </svg>
  );
}
/** 기다림: 걸린 초를 센다(11-25 - 그리기는 20~70초라 멈춘 것처럼 보였다). 바깥에 둬야 부모가 다시 그려도 초가 0으로 안 돌아간다. */
function Busy({ kind, en, small }: { kind: string | null; en: boolean; small?: boolean }) {
  const t = (ko: string, e: string) => (en ? e : ko);
  const [sec, setSec] = useState(0);
  useEffect(() => { const id = setInterval(() => setSec((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  const long = kind === "create" || kind === "rotate" || kind === "animate";
  return (
    <div className={`wait${small ? " sm" : ""}`} role="status">
      <div className="blocks">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
      <span>{long ? t(`그리는 중 · ${sec}초`, `Drawing · ${sec}s`) : t("작업 중…", "Working…")}</span>
      {long && !small && <small>{t("보통 20~70초 걸려요. 창을 닫지 마세요.", "Usually 20-70s. Keep this tab open.")}</small>}
    </div>
  );
}

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
  const can = (n: number) => shots !== null && shots >= n;
  // 11-25 사장님 "계정 연동해야지 · 도트 그림 만들기는 선결제로": 손님은 결제·AI 그림 대신 구글 연결 단추를 본다(무료 장수 없음)
  const connect = (
    <div className="connect">
      <p>{t("구글 계정을 연결하면 토큰을 사서 쓸 수 있어요. 산 토큰은 계정에 남아요.", "Connect a Google account to buy and use tokens. Tokens stay with your account.")}</p>
      <GoogleGo already={false} en={en} next="/pixel" />
    </div>
  );
  // 11-25 사장님 하나카드: PC 에서 카드사 "보안프로그램 설치" 창에서 멈춤(Polar 는 해외 결제 - 한국 카드는 카드사 해외 인증을 거친다)
  const payHelp = en ? null : (
    <details className="payhelp">
      <summary>한국 카드로 결제가 안 넘어가면</summary>
      <ul>
        <li>해외 결제 대행(Polar)이라 <b>카드 앱에서 해외결제를 켜 주세요</b>.</li>
        <li>PC에서 카드사 <b>‘보안프로그램 설치’</b> 창이 뜨고 멈추면, <b>폰에서</b> 결제하고 카드 앱으로 인증해 보세요.</li>
        <li>그래도 멈추면 다른 카드(Visa·Master)로 해 주세요. 결제가 안 끝나면 돈은 나가지 않아요.</li>
      </ul>
    </details>
  );
  const buyBtn = !linked ? connect : (
    <div className="buy">
      <button type="button" className="go" disabled={!!busy || !payOpen} onClick={buy}>{busy === "pay" ? t("결제창 여는 중…", "Opening checkout…") : payOpen ? t(`${PIXEL_PACK.shots}토큰 4,900원`, `${PIXEL_PACK.shots} tokens for ₩4,900`) : t("결제 준비 중", "Payments opening soon")}</button>
      {payOpen && payHelp}
    </div>
  );
  const topBuy = <button type="button" className="go" disabled={!!busy || !payOpen} onClick={buy}>{t("토큰 사기", "Buy tokens")}</button>;
  const paidMsg = (paid === "100" || paid === "10") ? t(`${PIXEL_PACK.shots}토큰이 들어왔어요. 고마워요!`, `${PIXEL_PACK.shots} tokens added. Thank you!`)
    : paid === "wait" ? t("카드사 확인을 기다리는 중이에요. 1~2분 뒤 새로고침하면 토큰이 들어와요.", "Waiting for your bank to confirm. Refresh in a minute or two.")
    : paid === "fail" ? t("결제를 확인하지 못했어요. 돈이 나갔다면 이 화면을 다시 열어 주세요 — 한 번 더 확인해요.", "Couldn't confirm the payment. If you were charged, reopen this page and we'll check again.") : null;

  // 캔버스: 지금 도구의 무료 미리보기가 있으면 그걸, 아니면 고른 기록을
  const canvas: { src: string; cap: string; preview?: boolean } | null =
    tool === "convert" && pv ? { src: pv.preview, cap: t(`${pv.logical[0]}×${pv.logical[1]} · ${pv.colors}색 · 미리보기(받으면 줄무늬 없음)`, `${pv.logical[0]}×${pv.logical[1]} · ${pv.colors} colors · preview (download is clean)`), preview: true }
    : tool === "split" && splitPv ? { src: splitPv.gif, cap: t(`${splitPv.count}프레임 · ${splitPv.cell[0]}×${splitPv.cell[1]} · 미리보기`, `${splitPv.count} frames · preview`), preview: true }
    : shown ? { src: shown.view, cap: shown.info } : null;

  return (
    <div className="px-root">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/fonts/galmuri.css" />
      <style>{CSS}</style>
      <header className="px-top">
        <b className="logo"><Ico k="create" />{t("도트 작업실", "Pixel Studio")}</b>
        <span className="sp" />
        <span className="bal">{shots === null ? "…" : t(`남은 ${shots}토큰`, `${shots} tokens`)}</span>
        {linked && payOpen && topBuy}
      </header>
      {paidMsg && <div className="px-note">{paidMsg}</div>}

      <div className="px-app">
        <nav className="px-tools" aria-label={t("도구", "Tools")}>
          {TOOLS.map((x) => (
            <button key={x.k} type="button" className={tool === x.k ? "on" : ""} onClick={() => goTool(x.k)}>
              <span><Ico k={x.k} />{t(x.ko, x.en)}{x.ai && <i>AI</i>}</span><small>{t(x.sub, x.subEn)}</small>
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
            busy ? <Busy kind={busy} en={en} /> : items.length ? (
              <div className="empty">{t("아래 기록에서 하나를 고르거나 새로 만들어 보세요.", "Pick one from history or make a new one.")}</div>
            ) : (
              <div className="intro">
                <h1>{t("글 한 줄로 게임 도트 캐릭터", "Game pixel characters from one line")}</h1>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pixel-og.png" alt={t("도트 작업실에서 만든 용 4방향과 기사·고양이·슬라임·마법사", "A dragon in 4 directions, a knight, a cat, a slime and a wizard made here")} />
                <ol>
                  <li><b>1</b>{t("캐릭터를 글로 적어요", "Describe a character")}</li>
                  <li><b>2</b>{t("앞·옆·뒤 4방향, 걷기·동작", "Rotate 4 ways, walk, animate")}</li>
                  <li><b>3</b>{t("투명 PNG·GIF로 받아 게임에 넣어요", "Download transparent PNG / GIF")}</li>
                </ol>
                <div className="price">
                  <span>{t(`${PIXEL_PACK.shots}토큰 4,900원`, `${PIXEL_PACK.shots} tokens ₩4,900`)}</span>
                  <small>{t(`만들기 ${PIXEL_COST.create} · 4방향 ${PIXEL_COST.turn} · 동작 ${PIXEL_COST.motion} · 변환·자르기 ${PIXEL_COST.convert} · 실패하면 돌려드려요`, `Create ${PIXEL_COST.create} · Rotate ${PIXEL_COST.turn} · Animate ${PIXEL_COST.motion} · Pixelate/Split ${PIXEL_COST.convert} · refunded on failure`)}</small>
                </div>
              </div>
            )
          )}
          {busy && canvas && <div className="busy"><Busy kind={busy} en={en} small /></div>}
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
            {games[gPick] ? (<>
              <label className="row"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> {t(`게임 색만 쓰기 (${games[gPick].palette.length}색) · 키 ${games[gPick].height}칸으로 맞춤`, `Only the game's ${games[gPick].palette.length} colors · ${games[gPick].height}px tall`)}</label>
              {/* 11-25 실패율 자 6바퀴: "빨간 머리" 가 게임 팔레트에 없어 갈색으로 나왔다 — 설계대로지만 손님이 놀라지 않게 */}
              {snap && <p className="hint">{t("게임에 없는 색(예: 빨간 머리)은 게임 색 중 가장 가까운 색으로 바뀌어요. 원하는 색을 꼭 쓰려면 체크를 끄세요.", "Colors the game doesn't have (e.g. red hair) become the closest game color. Uncheck to keep any color.")}</p>}
            </>) : (<>
              <div className="lab">{t("캔버스 (px)", "Canvas (px)")}</div>
              <div className="seg">{([32, 48, 64, 96] as const).map((z) => <button key={z} type="button" className={cSize === z ? "on" : ""} onClick={() => setCSize(z)}>{z}</button>)}</div>
            </>)}
            <p className="hint">{t("배경 투명 PNG로 받아요. 만든 캐릭터는 바로 참조가 돼서 4방향·동작으로 이어져요. 실패하면 토큰을 돌려드려요.", "Transparent PNG. The result becomes your reference for Rotate and Animate. Refunded if it fails.")}</p>
            {can(PIXEL_COST.create) ? <button type="button" className="go" disabled={!!busy || cDesc.trim().length < 2} onClick={create}>{busy === "create" ? t("그리는 중… (20~60초)", "Drawing… (20-60s)") : t(`만들기 · ${PIXEL_COST.create}토큰`, `Create · ${PIXEL_COST.create} tokens`)}</button> : buyBtn}
          </>)}

          {tool === "rotate" && (<>
            <h2>{t("4방향 만들기", "Rotate (4 directions)")}</h2>
            <p className="hint">{t("참조 캐릭터를 앞 → 오른쪽 → 뒤 → 왼쪽으로 그려요. 게임 캐릭터 기본 세트예요. 같은 캐릭터가 아니게 나오면 한 번 더 그리고, 그래도 안 되면 토큰을 돌려드려요.", "Draws the reference facing front → right → back → left. Retries once if it drifts, then refunds.")}</p>
            {can(PIXEL_COST.turn) ? <button type="button" className="go" disabled={!!busy || !ref} onClick={() => void motion("turn")}>{busy === "rotate" ? t("그리는 중… (30~70초)", "Drawing… (30-70s)") : t(`4방향 · ${PIXEL_COST.turn}토큰`, `Rotate · ${PIXEL_COST.turn} tokens`)}</button> : buyBtn}
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
            {can(PIXEL_COST.motion) ? <button type="button" className="go" disabled={!!busy || !ref || (aMotion === "custom" && aAction.trim().length < 2)} onClick={() => void motion(aMotion)}>{busy === "animate" ? t("그리는 중… (30~70초)", "Drawing… (30-70s)") : t(`동작 · ${PIXEL_COST.motion}토큰`, `Animate · ${PIXEL_COST.motion} tokens`)}</button> : buyBtn}
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

/*
 * 11-25 사장님 "화면 구성 도트로 예쁘게": 두근도트 도트 껍데기(src/app/dot/pixel-skin.ts)와 같은 규칙.
 * 2px 단위 · 둥근 모서리 없음 · 2px 테두리 + 3px 그림자 · 누르면 2px 내려앉음 · 갈무리 비트맵 글꼴은 11/14/28px 정수 배만.
 * 색은 적게: 밤(바탕) · 판(칸) · 선 · 분홍(주 단추) · 노랑(토큰) · 하늘(받기).
 */
const CSS = `
.px-root{--bg:#121022;--pan:#1c1a30;--pan2:#26233f;--line:#3e3a63;--ink:#07060d;--tx:#f3f0ff;--mu:#a6a1c8;--pk:#ff5c8a;--yl:#ffd23f;--bl:#5ec8ff;
  min-height:100vh;display:flex;flex-direction:column;color:var(--tx);
  background:var(--bg) repeating-linear-gradient(0deg,transparent 0 15px,#ffffff06 15px 16px),repeating-linear-gradient(90deg,transparent 0 15px,#ffffff06 15px 16px);
  font-family:Galmuri14,Galmuri11,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:14px;-webkit-font-smoothing:none;word-break:keep-all;overflow-wrap:anywhere}
.px-root *{border-radius:0!important;letter-spacing:0}
.px-root button,.px-root input,.px-root textarea,.px-root summary{font-family:inherit;font-size:14px}
.px-root small,.px-root .hint,.px-root figcaption,.px-root .lab{font-family:Galmuri11,Galmuri14,sans-serif;font-size:11px}
.ico{flex:0 0 auto;image-rendering:pixelated}

/* 머리띠 */
.px-top{display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--pan);border-bottom:2px solid var(--ink);box-shadow:0 2px 0 var(--line)}
.px-top .logo{display:flex;align-items:center;gap:8px;font-weight:400;font-size:14px;white-space:nowrap;color:var(--pk)}
.px-top .logo .ico{width:24px;height:24px}
.px-top .sp{flex:1}
.px-top .bal{display:flex;align-items:center;gap:6px;white-space:nowrap;color:var(--yl);background:var(--ink);padding:5px 10px;box-shadow:inset 0 0 0 2px var(--line)}
.px-top .bal::before{content:"";width:10px;height:10px;background:var(--yl);box-shadow:inset -2px -2px 0 #c99a00,inset 2px 2px 0 #fff3b0}
.px-note{background:#203a2e;color:#c9ffe0;border-bottom:2px solid var(--ink);padding:9px 16px}

/* 세 칸 */
.px-app{flex:1;display:grid;grid-template-columns:176px 1fr 312px;min-height:0}
.px-tools{display:flex;flex-direction:column;gap:6px;padding:12px 10px;background:var(--pan);border-right:2px solid var(--ink)}
.px-tools button{text-align:left;background:transparent;border:0;color:var(--mu);padding:9px 10px;cursor:pointer;box-shadow:inset 0 0 0 2px transparent}
.px-tools button span{display:flex;align-items:center;gap:8px;color:var(--tx)}
.px-tools button i{font-style:normal;font-family:Galmuri11,sans-serif;font-size:11px;background:var(--pk);color:var(--ink);padding:1px 4px;margin-left:auto}
.px-tools button small{display:block;color:var(--mu);margin:3px 0 0 24px}
.px-tools button:hover{background:var(--pan2)}
.px-tools button.on{background:var(--pan2);box-shadow:inset 0 0 0 2px var(--pk),3px 3px 0 var(--ink)}
.px-tools button.on .ico{color:var(--pk)}

.px-canvas{position:relative;display:flex;align-items:center;justify-content:center;padding:20px;min-height:440px}
.px-canvas figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:12px;max-width:100%}
.px-canvas figure img{max-width:100%;max-height:60vh;min-width:min(320px,100%);image-rendering:pixelated;object-fit:contain;
  background:repeating-conic-gradient(#2c2946 0% 25%,#221f38 0% 50%) 50%/16px 16px;box-shadow:0 0 0 2px var(--ink),0 0 0 4px var(--line),6px 6px 0 4px var(--ink)}
.px-canvas figcaption{color:var(--mu);text-align:center}
.px-canvas .dl{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.px-canvas .dl a,.px-canvas .dl button{background:var(--bl);color:var(--ink);border:0;padding:9px 12px;text-decoration:none;cursor:pointer;box-shadow:inset 0 0 0 2px var(--ink),3px 3px 0 var(--ink)}
.px-canvas .dl button{background:var(--pan2);color:var(--tx);box-shadow:inset 0 0 0 2px var(--line),3px 3px 0 var(--ink)}
.px-canvas .dl a:active,.px-canvas .dl button:active{transform:translate(2px,2px);box-shadow:inset 0 0 0 2px var(--ink)}
.px-canvas .empty{color:var(--mu);max-width:340px;text-align:center;line-height:1.7}
.px-canvas .busy{position:absolute;top:14px;right:14px}

/* 처음 화면 */
.intro{max-width:560px;width:100%;display:flex;flex-direction:column;gap:16px;align-items:center;text-align:center}
.intro h1{font-family:Galmuri14,sans-serif;font-weight:400;font-size:28px;line-height:1.3;margin:0;color:var(--tx);text-shadow:2px 2px 0 var(--ink)}
.intro img{width:100%;image-rendering:pixelated;box-shadow:0 0 0 2px var(--ink),0 0 0 4px var(--line),6px 6px 0 4px var(--ink)}
.intro ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%}
.intro li{background:var(--pan);padding:12px 10px;box-shadow:inset 0 0 0 2px var(--line),3px 3px 0 var(--ink);line-height:1.5;display:flex;flex-direction:column;align-items:center;gap:8px}
.intro li b{font-weight:400;background:var(--pk);color:var(--ink);width:24px;height:24px;display:flex;align-items:center;justify-content:center}
.intro .price{display:flex;flex-direction:column;gap:6px;align-items:center}
.intro .price span{color:var(--yl);font-size:14px}
.intro .price small{color:var(--mu);line-height:1.6}

/* 기다림 */
.wait{display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--tx);text-align:center}
.wait .blocks{display:flex;gap:4px}
.wait .blocks i{width:12px;height:12px;background:var(--pk);animation:pxblink 1s steps(2,end) infinite}
.wait small{color:var(--mu)}
.wait.sm{flex-direction:row;background:var(--pan);padding:6px 10px;box-shadow:inset 0 0 0 2px var(--line),3px 3px 0 var(--ink)}
.wait.sm .blocks i{width:6px;height:6px}
@keyframes pxblink{0%{opacity:1}50%{opacity:.15}100%{opacity:1}}

/* 옵션 칸 */
.px-opts{background:var(--pan);border-left:2px solid var(--ink);padding:16px 14px;display:flex;flex-direction:column;gap:10px}
.px-opts h2{font-family:Galmuri14,sans-serif;font-weight:400;font-size:14px;margin:2px 0 4px;color:var(--pk);display:flex;align-items:center;gap:8px}
.px-opts h2::before{content:"";width:8px;height:8px;background:var(--pk)}
.px-opts .lab{color:var(--mu);display:flex;align-items:center;gap:6px}
.px-opts .lab b{color:var(--tx);font-weight:400}
.px-opts .lab em{color:var(--mu);font-style:normal}
.px-opts .hint{margin:0;color:var(--mu);line-height:1.7}
.px-opts textarea,.px-opts .txt{width:100%;box-sizing:border-box;background:var(--ink);color:var(--tx);border:0;padding:10px;resize:vertical;box-shadow:inset 0 0 0 2px var(--line);line-height:1.6;outline:none}
.px-opts textarea:focus,.px-opts .txt:focus{box-shadow:inset 0 0 0 2px var(--pk)}
.px-opts input[type=range]{width:100%;accent-color:var(--pk)}
.px-opts input[type=number]{width:56px;background:var(--ink);color:var(--tx);border:0;padding:5px;box-shadow:inset 0 0 0 2px var(--line)}
.px-opts input[type=checkbox]{accent-color:var(--pk);width:16px;height:16px}
.px-opts .row{display:flex;align-items:center;gap:8px;line-height:1.5}
.px-opts button{background:var(--pan2);color:var(--tx);border:0;padding:9px 12px;cursor:pointer;box-shadow:inset 0 0 0 2px var(--line),3px 3px 0 var(--ink)}
.px-opts button:active:not(:disabled){transform:translate(2px,2px);box-shadow:inset 0 0 0 2px var(--line)}
.px-opts button:disabled{opacity:.45;cursor:default}
.px-opts .mini{padding:3px 8px;font-size:11px;font-family:Galmuri11,sans-serif;margin-left:auto;box-shadow:inset 0 0 0 2px var(--line)}
.px-opts .seg{display:flex;gap:6px}.px-opts .seg.wrap{flex-wrap:wrap}
.px-opts .seg button{flex:1;padding:8px 6px}
.px-opts .seg button.on{background:var(--pk);color:var(--ink);box-shadow:inset 0 0 0 2px var(--ink),3px 3px 0 var(--ink)}
.px-root .go{background:var(--pk);border:0;color:var(--ink);padding:12px 14px;cursor:pointer;width:100%;box-shadow:inset 0 0 0 2px var(--ink),inset -4px -4px 0 #c23a64,inset 4px 4px 0 #ff9cb8,4px 4px 0 var(--ink)}
.px-root .go:active:not(:disabled){transform:translate(2px,2px);box-shadow:inset 0 0 0 2px var(--ink),inset -4px -4px 0 #c23a64,inset 4px 4px 0 #ff9cb8}
.px-root .go:disabled{opacity:.5;cursor:default}
.px-root .px-top .go{width:auto;padding:7px 12px;white-space:nowrap}
.px-opts .ref .slot{display:flex;align-items:center;justify-content:center;height:128px;cursor:pointer;color:var(--mu);text-align:center;line-height:1.6;
  background:repeating-conic-gradient(#2c2946 0% 25%,#221f38 0% 50%) 50%/16px 16px;box-shadow:inset 0 0 0 2px var(--line);outline:2px dashed var(--line);outline-offset:-8px;margin-top:2px}
.px-opts .ref .slot.has{outline:0}
.px-opts .ref .slot img{max-height:116px;max-width:100%;image-rendering:pixelated}
.px-opts .ref .slot:hover{box-shadow:inset 0 0 0 2px var(--pk)}
.px-opts .gslot{display:flex;align-items:center;justify-content:center;min-height:92px;cursor:pointer;color:var(--mu);padding:8px;box-shadow:inset 0 0 0 2px var(--line);outline:2px dashed var(--line);outline-offset:-8px}
.px-opts .gslot:hover{box-shadow:inset 0 0 0 2px var(--pk)}
.px-opts .thumbs{display:flex;gap:4px;flex-wrap:wrap;justify-content:center}
.px-opts .thumbs img{height:64px;max-width:120px;object-fit:contain;image-rendering:pixelated;background:var(--ink)}
.px-opts .grow .thumbs img{height:32px;max-width:48px}
.px-opts .pal{display:flex;flex-wrap:wrap;gap:4px}.px-opts .pal i{width:16px;height:16px;box-shadow:inset 0 0 0 2px #0008}
.px-opts .grow{display:flex;align-items:center;gap:6px}.px-opts .grow b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400}.px-opts .grow small{color:var(--mu)}
.px-root .buy{display:flex;flex-direction:column;gap:8px}
.px-root .payhelp{background:var(--ink);padding:8px 10px;box-shadow:inset 0 0 0 2px var(--line)}
.px-root .payhelp summary{cursor:pointer;color:var(--yl);font-family:Galmuri11,sans-serif;font-size:11px}
.px-root .payhelp ul{margin:8px 0 2px;padding-left:16px;color:var(--mu);font-family:Galmuri11,sans-serif;font-size:11px;line-height:1.8}
.px-root .payhelp b{color:var(--tx);font-weight:400}
.px-root .connect{display:flex;flex-direction:column;gap:8px}.px-root .connect p{margin:0;color:var(--mu);line-height:1.7;font-family:Galmuri11,sans-serif;font-size:11px}
.px-root .lg-google{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px;border:0;background:#fff;color:#222;cursor:pointer;box-shadow:inset 0 0 0 2px var(--ink),4px 4px 0 var(--ink)}
.px-root .lg-google:active{transform:translate(2px,2px);box-shadow:inset 0 0 0 2px var(--ink)}
.px-root .lg-google:disabled{opacity:.6}.px-root .lg-err{color:#ff8fa8;margin:0}
.px-opts .err{color:#ff8fa8;margin:0;line-height:1.6;background:#3a1626;padding:8px 10px;box-shadow:inset 0 0 0 2px #7a2a48}

/* 기록 줄 */
.px-hist{background:var(--pan);border-top:2px solid var(--ink);padding:10px 16px}
.px-hist .lab{color:var(--mu);margin-bottom:8px}
.px-hist .strip{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 6px}
.px-hist .none{color:var(--mu)}
.px-hist button{flex:0 0 auto;width:84px;background:var(--pan2);border:0;padding:4px;cursor:pointer;color:var(--mu);box-shadow:inset 0 0 0 2px var(--line)}
.px-hist button.on{box-shadow:inset 0 0 0 2px var(--pk),3px 3px 0 var(--ink)}
.px-hist img{width:76px;height:76px;object-fit:contain;image-rendering:pixelated;display:block;background:repeating-conic-gradient(#2c2946 0% 25%,#221f38 0% 50%) 50%/12px 12px}
.px-hist small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px}
.px-foot{padding:14px 16px 24px;color:var(--mu);font-family:Galmuri11,sans-serif;font-size:11px;line-height:1.7}.px-foot a{color:var(--tx)}

/* 폰: 도구는 위 가로 줄(아이콘+이름), 옵션은 캔버스 아래 */
@media (max-width:860px){
  .px-app{grid-template-columns:1fr}
  .px-top{padding:8px 12px}
  .px-tools{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:2px solid var(--ink);padding:8px;gap:6px}
  .px-tools button{flex:0 0 auto;padding:8px 10px}
  .px-tools button small{display:none}
  .px-tools button i{margin-left:2px}
  .px-canvas{min-height:240px;padding:16px 12px}
  .px-canvas figure img{min-width:min(260px,100%);max-height:48vh}
  .px-opts{border-left:0;border-top:2px solid var(--ink);padding:14px 12px}
  .intro h1{font-size:14px;line-height:1.6}
  .intro ol{grid-template-columns:1fr}
  .intro li{flex-direction:row;justify-content:flex-start;text-align:left;padding:10px}
  .px-opts .go{position:sticky;bottom:10px;z-index:2}
}
`;
