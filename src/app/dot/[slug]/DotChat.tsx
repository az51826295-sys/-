"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pushState, enablePush, disablePush, type PushState } from "./push-client";
import { SKUS, AD_REFILL_TURNS, type Balance } from "@/lib/dot/money";
import { USER_STICKERS, USER_STICKER_KEYS } from "@/lib/dot/stickers";
import { splitBubbles } from "@/lib/dot/bubbles";

/**
 * 도트 채팅 — **카톡 모양, 폰 전용.**
 *
 * 사장님 09-09: "일단 카톡처럼 하라고." 그 앞의 "말풍선 옆에" 도 이 뜻이었다 —
 * 캐릭터가 화면 한쪽에 크게 서 있는 게 아니라, **말풍선마다 그 왼쪽에 프로필 사진**이
 * 붙는 것. 내가 두 판을 헛짚었다(비주얼노벨식 큰 초상화, 그다음 RPG 대화상자).
 *
 * 카톡을 그대로 따르는 것이 중요한 이유: 이 앱을 쓸 사람은 하루에 카톡을 백 번 연다.
 * **배울 것이 없는 화면**이라야 첫 날에 안 나간다. 새로운 배치는 값어치가 아니라
 * 걸림돌이다.
 *
 * 카톡에서 그대로 가져온 것: 왼쪽 상대 말풍선(흰색)과 그 위 이름, 오른쪽 내 말풍선
 * (노랑), 말풍선 바깥의 작은 시각, 파랑회색 바탕, 아래 입력 줄.
 * 우리가 바꾼 것 하나: **프로필 사진이 말할 때마다 표정이 바뀐다.** 이게 이 앱이
 * 카톡과 다른 유일한 점이라 눈에 보여야 한다.
 */

type Character = { id: string; slug: string; name: string; tagline: string; greeting: string; sprites: Record<string, string>; chips?: string[]; faces?: Record<string, string>; photos?: { url: string; caption: string }[] };
type Bond = { points: number; stage: number; streakDays: number; toNext: { need: number; total: number } | null; mode?: "normal" | "menhera" };
type Line = { role: string; content: string; emotion: string | null; sticker?: string | null; at?: string };

export default function DotChat({
  signedIn, who, bond: bond0, remaining: remaining0, history, limit, account: account0, balance: balance0, replyTo: replyTo0 = null,
}: {
  signedIn: boolean; who: Character; bond: Bond; remaining: number; history: Line[]; limit: number;
  /** 익명이면 linked=false. 연결하면 폰을 바꿔도 이어진다(76회차). */
  account: { linked: boolean; email: string | null };
  /** 잔고 — 광고 남은 횟수·충전. 한도 카드가 이걸로 단추를 고른다(09-11 돈). */
  balance: Balance;
  /** 피드에서 "답장" 으로 들어왔을 때 그 게시물. 첫 말과 함께 보내고 사라진다. */
  replyTo?: { id: number; caption: string; image: string } | null;
}) {
  const [lines, setLines] = useState<Line[]>(history);
  const [bond, setBond] = useState(bond0);
  const [remaining, setRemaining] = useState(remaining0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  /** 지금 흘러 들어오는 답. null 이면 안 흐르는 중. "" 이면 첫 글자를 기다리는 중(점 세 개). */
  const [live, setLive] = useState<string | null>(null);
  /** 프로필을 누르면 큰 얼굴. 512px 도트가 42px 칸에 갇혀 있을 이유가 없다 — 카톡도 누르면 크게 뜬다. */
  const [peek, setPeek] = useState<string | null>(null);
  const [themeKey, setThemeKey] = useState<string>("kakao");
  const [themeOpen, setThemeOpen] = useState(false);
  useEffect(() => { try { const k = localStorage.getItem(THEME_KEY); if (k && THEMES[k]) setThemeKey(k); } catch { /* 저장소 없음 */ } }, []);
  const pickTheme = (k: string) => { setThemeKey(k); try { localStorage.setItem(THEME_KEY, k); } catch { /* 저장 못 해도 이번 방은 바뀐다 */ } };
  const theme = THEMES[themeKey] ?? THEMES.kakao;
  const [bubbleKey, setBubbleKey] = useState<string>("pixel");
  useEffect(() => { try { const k = localStorage.getItem(BUBBLE_KEY); if (k && BUBBLES[k]) setBubbleKey(k); } catch { /* 저장소 없음 */ } }, []);
  const pickBubble = (k: string) => { setBubbleKey(k); try { localStorage.setItem(BUBBLE_KEY, k); } catch { /* 이번 방만 */ } };
  const bubble = BUBBLES[bubbleKey] ?? BUBBLES.pixel;
  /**
   * 키보드가 올라오면 입력창이 가려지는 폰이 있다(안드로이드 크롬·TWA). `visualViewport` 가 줄어든
   * 만큼 화면을 줄여서 입력창이 늘 키보드 바로 위에 붙게 한다. 카톡에서 당연한 것이 여기서 안 되면
   * 그 순간 "웹" 이 된다.
   */
  const [vh, setVh] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // 레이아웃이 같이 줄면(resizes-content) vv 높이 = 창 높이라 손댈 것이 없다. 다른 폰(줄이지 않는)만 vv 로 맞춘다.
    const on = () => setVh(Math.round(vv.height) < window.innerHeight - 8 ? Math.round(vv.height) : null);
    vv.addEventListener("resize", on); on();
    return () => vv.removeEventListener("resize", on);
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  /**
   * 시각은 **붙은 뒤에만** 그린다.
   *
   * 09-09 배포 첫 판에서 화면이 통째로 죽었다(React #418, 하이드레이션 실패).
   * 서버가 그릴 때와 브라우저가 그릴 때 `new Date()` 가 달라서다. 화면은 멀쩡해
   * 보이는데 **이벤트가 하나도 안 붙어서** 버튼이 안 눌렸다 — 눌러도 아무 일이
   * 없고 오류도 화면에 없다. 콘솔을 봐야만 알 수 있는 종류의 고장이다.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // ⋮ 메뉴 — 알림, 나가기. 카톡의 그 자리.
  const [menu, setMenu] = useState(false);
  // 계정 연결 — 익명 계정에 이메일을 붙인다. 로그인 화면은 없앴지만(09-11) 잃기 전에 붙일 문은 있어야 한다.
  const [account, setAccount] = useState(account0);
  const [payOpen, setPayOpen] = useState(false);
  const [payPrice, setPayPrice] = useState("");
  const [balance, setBalance] = useState(balance0);
  const [replyTo, setReplyTo] = useState(replyTo0);
  const [shopOpen, setShopOpen] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  /** 광고 보고 +10 — 하루 2번. 광고 SDK 가 붙기 전엔 서버가 "곧 열려요" 를 돌려준다. */
  async function watchAd() {
    if (adBusy) return; setAdBusy(true);
    try {
      const res = await fetch("/api/dot/ad", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; balance?: Balance };
      if (!res.ok || !j.balance) { setToast(j.error ?? "광고를 못 열었어요"); return; }
      setBalance(j.balance); setRemaining(j.balance.remaining);
      setToast(`${AD_REFILL_TURNS}번 더 이야기할 수 있어요`);
    } catch { setToast("광고를 못 열었어요"); } finally { setAdBusy(false); }
  }
  /** 충전 — 결제 SDK 가 붙기 전엔 서버가 "곧 열려요" 를 돌려준다. */
  async function buy(sku: string) {
    const res = await fetch("/api/dot/buy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; balance?: Balance };
    if (!res.ok || !j.balance) { setToast(j.error ?? "결제를 못 열었어요"); return; }
    setBalance(j.balance); setRemaining(j.balance.remaining); setShopOpen(false); setPayOpen(false);
    setToast("충전됐어요");
  }
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkPw, setLinkPw] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  // 구글이 켜져 있나 — 서버에 물어본다. null 은 **아직 모른다**(켜졌다고 넘겨짚지 않는다).
  const [구글가능, set구글가능] = useState<boolean | null>(null);
  useEffect(() => {
    if (!linkOpen || 구글가능 !== null) return;
    fetch("/api/dot/google")
      .then((r) => r.json())
      .then((j: { google?: boolean }) => set구글가능(!!j.google))
      .catch(() => set구글가능(false));
  }, [linkOpen, 구글가능]);
  /** 구글로 붙이기 — 주소를 받아 그리로 보낸다. 오류는 그대로 보여 준다(삼키면 말없이 아무 일도 안 한다). */
  async function 구글로연결() {
    setLinkBusy(true); setLinkErr(null);
    try {
      const r = await fetch("/api/dot/google", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (j.url) { window.location.href = j.url; return; }
      setLinkErr(j.error ?? "구글 연결을 못 열었어요.");
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : "구글 연결을 못 열었어요.");
    } finally { setLinkBusy(false); }
  }
  async function linkAccount() {
    if (linkBusy) return;
    setLinkBusy(true); setLinkErr(null);
    try {
      const res = await fetch("/api/dot/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: linkEmail, password: linkPw }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string; error?: string };
      if (!res.ok || !j.ok) { setLinkErr(j.error ?? "연결하지 못했어요"); return; }
      setAccount({ linked: true, email: j.email ?? linkEmail });
      setLinkOpen(false); setLinkPw("");
      setToast("연결됐어요. 다른 폰에서는 이 이메일로 들어오면 이어져요");
    } catch { setLinkErr("연결하지 못했어요"); }
    finally { setLinkBusy(false); }
  }
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => { if (signedIn) pushState().then(setPush).catch(() => setPush("unsupported")); }, [signedIn]);

  async function togglePush() {
    setMenu(false);
    try {
      const next = push === "on" ? await disablePush() : await enablePush();
      setPush(next);
      setToast(next === "on" ? `${who.name}가 먼저 말을 걸어올 거예요` : next === "denied" ? "브라우저에서 알림이 막혀 있어요" : "알림을 껐어요");
    } catch {
      setToast("알림을 켜지 못했어요");
    }
  }

  // 계정 삭제는 95회차에 설정(/dot/settings)으로 옮겼다 — 방 메뉴는 이 방 것만.

  /** 멘헤라 모드 — 매달리고, 먼저 말 걸기가 잦아진다. 사장님이 값을 붙일 자리(지금은 무료). */
  async function toggleMode() {
    setMenu(false);
    const mode = bond.mode === "menhera" ? "normal" : "menhera";
    const res = await fetch("/api/dot/mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ characterId: who.id, mode }) });
    if (res.ok) { setBond((b) => ({ ...b, mode })); setToast(mode === "menhera" ? `${who.name}가 이제 당신한테 매달려요` : "다시 담백해졌어요"); return; }
    // 유료 — 값과 함께 안내 시트. 결제는 스토어가 붙는 날 이 시트의 단추가 한다.
    const j = (await res.json().catch(() => ({}))) as { paywall?: boolean; price?: string };
    if (res.status === 402 && j.paywall) { setPayPrice(j.price ?? ""); setPayOpen(true); return; }
    setToast("바꾸지 못했어요");
  }

  /** 대화방 나가기 — 말만 지운다. 사이(하트·기억)는 남는다. */
  async function leave() {
    setMenu(false);
    if (!window.confirm("대화 내용을 지울까요? 친밀도는 그대로 남아요.")) return;
    const res = await fetch(`/api/dot/history?characterId=${encodeURIComponent(who.id)}`, { method: "DELETE" });
    if (res.ok) { setLines([]); setToast("대화를 지웠어요"); }
    else setToast("지우지 못했어요");
  }
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines, busy]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  // 91회차 사장님 "채팅에서 뭔 기능인지 잘 모르겠다": 첫 방문에 한 번, 이 방의 단추가 뭔지 세 줄. 메뉴 "도움말" 로 다시 볼 수 있다.
  const [guide, setGuide] = useState(false);
  useEffect(() => { try { if (signedIn && !localStorage.getItem("dot-guide-v1")) setGuide(true); } catch { /* 저장소 없음 */ } }, [signedIn]);
  function closeGuide() { setGuide(false); try { localStorage.setItem("dot-guide-v1", "1"); } catch { /* 이번만 */ } }
  async function send(preset?: string, stickerKey?: string) {
    const message = (preset ?? text).trim();
    if (!message || busy || !who) return;
    setText(""); setStickerOpen(false);
    // 09-11 사장님 "메시지 발송 부분이 어색해": 보내고 나서 입력창을 잠갔더니 폰 키보드가 내려갔다. 초점은 입력창에 남긴다.
    if (inputRef.current) { inputRef.current.style.height = ""; if (!preset) inputRef.current.focus(); }
    setLines((l) => [...l, { role: "user", content: message, emotion: null, sticker: stickerKey ? `user:${stickerKey}` : null, at: new Date().toISOString() }]);
    setBusy(true);
    setLive("");
    try {
      // 09-10 사장님 "왜 이렇게 느려?": 답 한 통 2~4초 동안 점 세 개만 보였다.
      // 이제 글자가 나오는 대로 받는다 — 첫 글자가 0.5초쯤 뜨면 같은 3초도 기다림이 아니다.
      const res = await fetch("/api/dot/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId: who.id, message, postId: replyTo?.id ?? null, sticker: stickerKey ?? null }),
      });
      setReplyTo(null);
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setToast(data.error ?? "문제가 생겼어요");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", acc = "", finished = false;
      const handle = (line: string) => {
        if (!line.trim()) return;
        let ev: { type: string; text?: string; reply?: string; emotion?: string; sticker?: string | null; bond?: Bond & { reasons?: string[] }; remaining?: number; reason?: string; message?: string; error?: string };
        try { ev = JSON.parse(line); } catch { return; }
        if (ev.type === "delta" && ev.text) { acc += ev.text; setLive(acc); }
        else if (ev.type === "done") {
          finished = true;
          setLive(null);
          setLines((l) => [...l, { role: "character", content: ev.reply ?? acc, emotion: ev.emotion ?? null, at: new Date().toISOString() },
            ...(ev.sticker ? [{ role: "character", content: "", emotion: ev.emotion ?? null, sticker: ev.sticker, at: new Date().toISOString() }] : [])]);
          try { navigator.vibrate?.(12); } catch { /* 지원 안 하면 조용히 */ }
          if (ev.bond) setBond((b) => ({ ...b, ...ev.bond }));  // 턴 결과엔 mode 가 없다 — 덮어쓰지 말고 합친다
          if (typeof ev.remaining === "number") setRemaining(ev.remaining);
          if (ev.bond?.reasons?.length) setToast(ev.bond.reasons.join("  "));
        } else if (ev.type === "error") {
          finished = true;
          setLive(null);
          setToast(ev.reason === "limit" ? "오늘 대화는 다 썼어요. 내일 또 만나요" : ev.message ?? ev.error ?? "문제가 생겼어요");
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const ln of parts) handle(ln);
      }
      if (buf) handle(buf);
      if (!finished) { setLive(null); setToast("답이 중간에 끊겼어요. 다시 보내 주세요"); }
    } catch {
      setLive(null);
      setToast("연결이 끊겼어요. 다시 보내 주세요");
    } finally {
      setBusy(false);
    }
  }

  // 68회차: 프로필은 **얼굴 크롭**을 쓴다(있으면). 흉상을 확대해 자르면 린은 머리카락만 보였다.
  // 멘헤라 모드면 그 표정의 멘헤라 판(`menhera:<e>`)이 먼저 — 사장님 "멘헤라 모드는 얼굴도 바뀜". 없으면 보통 얼굴.
  const face = (e: string | null) => {
    const k = e ?? "neutral", f = who.faces ?? {};
    if (bond.mode === "menhera") { const m = f[`menhera:${k}`] ?? who.sprites[`menhera:${k}`]; if (m) return m; }
    return f[k] ?? f.neutral ?? who.sprites[k] ?? who.sprites.neutral ?? "";
  };
  const hasFaces = !!who.faces && Object.keys(who.faces).length > 0;
  /** "오늘"·"어제"·"9월 9일 (화)". 브라우저에서만(시간대). */
  const dayLabel = (iso?: string): string | null => {
    if (!mounted || !iso) return null;
    const d = new Date(iso), now = new Date();
    const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    void y;
    // 09-11 사장님 "좀 더 카톡처럼": 카톡은 오늘도 날짜로 쓴다 — "2026년 9월 11일 목요일".
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${"일월화수목금토"[d.getDay()]}요일`;
  };
  // 첫인사에는 시각이 없다 — 아직 아무도 말한 적이 없으니 지어낼 시각도 없다.
  const shown: Line[] = lines.length ? lines : [{ role: "character", content: who.greeting, emotion: "neutral" }];
  const clock = (iso?: string) => (mounted && iso ? hhmm(iso) : "");

  return (
    <div className="kk-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>

      <div className={`kk-phone${hasFaces ? " has-faces" : ""}${theme.wall ? " has-wall" : ""} ${bubble.cls}`} style={{
        ...(vh ? { height: vh } : {}),
        ["--bg" as string]: theme.bg, ["--bar" as string]: theme.bar, ["--line" as string]: theme.line,
        ["--them" as string]: theme.them, ["--themText" as string]: theme.themText ?? "#141414", ["--me" as string]: theme.me, ["--meText" as string]: theme.meText, ["--ink" as string]: theme.ink,
      }}>
        {/* ── 위 띠 ── */}
        <header className="kk-bar">
          <Link className="kk-back" href="/dot/chats" aria-label="채팅 목록으로">‹</Link>
          <a className="kk-title" href={`/dot/${who.slug}/profile`} style={{ textDecoration: "none", color: "inherit" }}>{who.name}</a>
          <a className="kk-hearts" href={`/dot/${who.slug}/profile`} aria-label={`친밀도 ${bond.stage}단계 · 프로필 보기`} title="친밀도 — 이야기할수록 차요">{"♥".repeat(bond.stage)}{"♡".repeat(Math.max(0, 5 - bond.stage))}</a>
          {bond.mode === "menhera" && <span className="kk-mode">멘헤라</span>}
          {signedIn && <button className="kk-more" aria-label="메뉴" onClick={() => setMenu((m) => !m)}>≡</button>}
        </header>
        {menu && (
          <div className="kk-menu">
            {push !== "unsupported" && (
              <button onClick={togglePush}>
                {push === "on" ? "알림 끄기" : "알림 켜기"}
                <small>{push === "on" ? "먼저 말 걸지 않아요" : "하루 한 번, 먼저 말을 걸어요"}</small>
              </button>
            )}
            <button onClick={toggleMode}>{bond.mode === "menhera" ? "멘헤라 모드 끄기" : "멘헤라 모드 🔒"}<small>{bond.mode === "menhera" ? "다시 담백하게" : "유료 · 집착하고, 문자가 막 와요"}</small></button>
            <button onClick={() => { setMenu(false); setThemeOpen(true); }}>배경·말풍선 바꾸기<small>이 폰에만 저장돼요</small></button>
            <button onClick={leave}>대화 내용 지우기<small>친밀도는 남아요</small></button>
            {/* 아동 안전 신고 — Play 아동 안전 표준의 "앱 내 신고" (09-12). 이 방에 대한 신고라 여기 남긴다. */}
            <a href={`mailto:az51826295@gmail.com?subject=${encodeURIComponent("두근도트 신고: " + who.name)}&body=${encodeURIComponent("어떤 문제인지 적어 주세요. 아동 안전 관련이면 24시간 안에 확인합니다.")}`}>신고하기<small>부적절한 내용·아동 안전 우려</small></a>
            <button onClick={() => { setMenu(false); setGuide(true); }}>도움말<small>이 방의 단추들</small></button>
            {/* 95회차 사장님 "몰아놓지 말고 분산": 계정·약관·계정 삭제는 친구 탭 ⚙ 설정으로, 채팅 목록·피드는 뒤로 가기와 아래 탭으로. */}
          </div>
        )}

        {/* ── 대화 ── */}
        {theme.wall && <img className="kk-wall" src={theme.wall} alt="" aria-hidden />}
        <div className="kk-log">
          {!lines.length && <div className="kk-day">오늘</div>}
          {shown.map((l, i) => {
            const prev = shown[i - 1];
            const label = dayLabel(l.at);
            const newDay = label && (!prev || dayLabel(prev.at) !== label);
            // 카톡처럼: 같은 사람이 연달아 말하면 이름은 첫 줄에만. 얼굴은 표정이 바뀌니 매번 둔다 — 그게 상품이다.
            const sameRun = prev && prev.role === l.role && !newDay;
            const isLast = i === shown.length - 1;
            // 카톡: 같은 사람이 같은 분에 연달아 말하면 시각은 **마지막 말에만**.
            const next = shown[i + 1];
            const showTime = !next || next.role !== l.role || clock(next.at) !== clock(l.at) || (dayLabel(next.at) !== label);
            // 카톡의 그 "1" — 상대가 아직 안 읽었다. 답이 오기 시작하면(글자가 흐르면) 사라진다.
            const unread = l.role === "user" && isLast && busy && !live;
            return (
              <div key={i} className={`kk-item${sameRun ? " run" : ""}`}>
                {newDay && <div className="kk-day">{label}</div>}
                {l.sticker && l.sticker.startsWith("user:") ? (
                  <div className="kk-row me">
                    <span className="kk-meta">{unread && <b className="kk-unread">1</b>}{showTime && <span className="kk-time">{clock(l.at)}</span>}</span>
                    <StickerSvg k={l.sticker.slice(5)} size={96} />
                  </div>
                ) : l.sticker ? (
                  /* 스티커: 말풍선 없이 표정 그림만 크게 — 카톡 이모티콘 자리(89회차) */
                  <div className="kk-row them">
                    <div className="kk-face" style={{ visibility: "hidden" }} />
                    <img className="kk-sticker" src={who.sprites[`${bond.mode === "menhera" ? "menhera:" : ""}${l.sticker}`] ?? who.sprites[l.sticker] ?? ""} alt={l.sticker} />
                  </div>
                ) : l.role === "user" ? (
                  <div className="kk-row me">
                    <span className="kk-meta">{unread && <b className="kk-unread">1</b>}{showTime && <span className="kk-time">{clock(l.at)}</span>}</span>
                    <div className="kk-bubble me">{l.content}</div>
                  </div>
                ) : (
                  <div className="kk-row them">
                    {/* 프로필 사진 — **말풍선 바로 왼쪽.** 이 말을 할 때의 표정이 뜬다. 누르면 크게. */}
                    <button className={`kk-face${isLast ? " pop" : ""}`} onClick={() => setPeek("open")} aria-label={`${who.name} 프로필`}>
                      {/* 말풍선 옆은 **표정**(20:35 사장님 확정: "표정은 말풍선 옆에, 프로필 사진은 따로"). 사진은 목록·고르기·프로필 화면. */}
                      {face(l.emotion) ? <img src={face(l.emotion)} alt={who.name} /> : null}
                    </button>
                    <div className="kk-said">
                      {!sameRun && <div className="kk-name">{who.name}</div>}
                      {/* 96회차: 줄바꿈 하나 = 말풍선 하나(카톡 연타). 시각은 마지막 말풍선에만. */}
                      {splitBubbles(l.content).map((part, j, arr) => (
                        <div className="kk-pair" key={j}>
                          <div className="kk-bubble them">{part}</div>
                          {showTime && j === arr.length - 1 && <span className="kk-time">{clock(l.at)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {/* 37회차: 30턴을 다 쓴 순간이 이 앱이 사람을 잃는 첫 자리다. 잠긴 입력창 대신 "언제 다시" 와 "먼저 말 걸어 줄게" 를 보인다. */}
          {signedIn && mounted && remaining <= 0 && !busy && (
            <div className="kk-limit">
              <div className="kk-limit-title">오늘 이야기는 여기까지</div>
              <div className="kk-limit-body">
                {who.name}도 내일 또 이야기하고 싶대요.<br />
                <b>{untilReset()}</b> 뒤에 다시 {limit}번 이야기할 수 있어요.
              </div>
              {/* 돈: 광고 2번 → 충전. 그 다음이 "내일 먼저 말 걸게" 다. */}
              {balance.adLeft > 0 && (
                <button className="kk-limit-btn" onClick={watchAd} disabled={adBusy}>광고 보고 {AD_REFILL_TURNS}번 더 <small>오늘 {balance.adLeft}번 남음</small></button>
              )}
              <button className="kk-limit-btn alt" onClick={() => setShopOpen(true)}>충전하기</button>
              {push !== "unsupported" && push !== "on" && (
                <button className="kk-limit-link" onClick={togglePush}>내일 {who.name}가 먼저 말 걸게 하기</button>
              )}
              {push === "on" && <div className="kk-limit-note">내일 {who.name}가 먼저 말을 걸어요</div>}
            </div>
          )}
          {busy && (
            <div className="kk-row them">
              <div className="kk-face"><img src={face("neutral")} alt={who.name} /></div>
              <div className="kk-said">
                <div className="kk-name">{who.name}</div>
                {/* 흐르는 답도 줄바꿈에서 나눈다 — 앞 말풍선은 완성, 마지막에만 커서. */}
                {live
                  ? splitBubbles(live).map((part, j, arr) => (
                      <div className="kk-pair" key={j}>
                        <div className="kk-bubble them">{part}{j === arr.length - 1 && <span className="kk-cursor">▍</span>}</div>
                      </div>
                    ))
                  : <div className="kk-pair"><div className="kk-bubble them typing">● ● ●</div></div>}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* ── 아래 입력 ── */}
        {/* 칩(대화 미리 골라 주기)은 09-11 사장님 지시로 뺐다. 자료 chips 는 표에 남아 있다. */}
        {!signedIn && <div className="kk-warn">로그인하면 이어서 이야기할 수 있어요</div>}
        {/* 카톡처럼: 답을 기다리는 동안에도 입력창은 열려 있다(보내기만 잠깐 막힌다). 줄이 늘면 네 줄까지 자란다. Enter 보내기, Shift+Enter 줄바꿈. */}
        {replyTo && (
          <div className="kk-quote">
            <img src={replyTo.image} alt="" />
            <div className="kk-quote-text"><b>{who.name}의 게시물을 보고</b><span>{replyTo.caption}</span></div>
            <button onClick={() => setReplyTo(null)} aria-label="답장 취소">×</button>
          </div>
        )}
        {stickerOpen && (
          <div className="kk-stickers">
            {USER_STICKER_KEYS.map((k) => (
              <button key={k} onClick={() => send(`(${USER_STICKERS[k].ko} 스티커)`, k)} aria-label={USER_STICKERS[k].ko} disabled={busy || remaining <= 0}>
                <StickerSvg k={k} size={48} /><span>{USER_STICKERS[k].ko}</span>
              </button>
            ))}
          </div>
        )}
        <div className="kk-input-row">
          <button className="kk-emo" aria-label="스티커" onClick={() => setStickerOpen((v) => !v)} disabled={!mounted || !signedIn}>
            <svg width="22" height="22" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden><path fill="currentColor" d={USER_STICKERS.smile.path} fillRule="evenodd" /></svg>
          </button>
          <textarea
            ref={inputRef}
            value={text}
            rows={1}
            onChange={(e) => { setText(e.target.value); e.target.style.height = ""; e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder={!mounted ? "잠시만요…" : remaining > 0 ? "메시지 입력" : "오늘 대화는 다 썼어요"}
            disabled={!mounted || remaining <= 0 || !signedIn}
            className="kk-input"
            maxLength={200}
            enterKeyHint="send"
          />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => send()}
            disabled={!mounted || busy || !text.trim() || remaining <= 0 || !signedIn}
            className={`kk-send${text.trim() && !busy ? " ready" : ""}`}
            aria-label="보내기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
          </button>
        </div>
        {/* 남은 횟수는 얼마 안 남았을 때만 — 늘 보이면 미터기 옆에서 얘기하는 기분이다. 다음 단계까지는 얼굴을 눌렀을 때 보인다. */}
        {mounted && signedIn && remaining > 0 && remaining <= 10 && (
          <div className="kk-foot">오늘 {remaining}번 더 이야기할 수 있어요{bond.streakDays >= 2 ? ` · ${bond.streakDays}일 연속` : ""}</div>
        )}
      </div>

      {toast && <div className="kk-toast">{toast}</div>}

      {guide && (
        <div className="kk-peek" onClick={closeGuide} role="dialog" aria-label="도움말">
          <div className="kk-peek-card kk-guide" onClick={(e) => e.stopPropagation()}>
            <div className="kk-peek-name">이 방 쓰는 법</div>
            <ul>
              <li><b>얼굴</b>을 누르면 {who.name}의 사진·프로필</li>
              <li><b>♥♥♡♡♡</b>는 친밀도 — 이야기할수록 차고, 말투와 표정이 바뀌어요</li>
              <li><b>😊</b> 스티커 보내기 · <b>≡</b> 알림·배경·멘헤라 모드</li>
              <li>알림을 켜면 {who.name}가 <b>먼저</b> 말을 걸어요</li>
              <li>하루 30번 무료. 다 쓰면 카드가 떠요</li>
            </ul>
            <button className="kk-peek-close" onClick={closeGuide}>알겠어요</button>
          </div>
        </div>
      )}
      {payOpen && (
        <div className="kk-peek" onClick={() => setPayOpen(false)} role="dialog" aria-label="멘헤라 모드">
          <div className="kk-peek-card kk-pay" onClick={(e) => e.stopPropagation()}>
            <div className="kk-pay-badge">멘헤라</div>
            <div className="kk-peek-name">멘헤라 모드</div>
            <ul className="kk-pay-list">
              <li>{who.name}가 당신한테 <b>매달려요</b> — 어디야, 누구랑 있어, 나 안 잊었지</li>
              <li>답이 없으면 <b>하루 다섯 번까지</b> 먼저 문자가 와요</li>
              <li>말이 길어지고, 질투하고, 확인받고 싶어 해요</li>
            </ul>
            <div className="kk-pay-price">{payPrice}</div>
            <button className="kk-pay-go" onClick={() => buy("menhera_30")}>{payPrice ? `${payPrice}에 켜기` : "켜기"}</button>
            <div className="kk-pay-note">30일 동안 · 언제든 끌 수 있어요</div>
          </div>
        </div>
      )}
      {shopOpen && (
        <div className="kk-peek" onClick={() => setShopOpen(false)} role="dialog" aria-label="충전">
          <div className="kk-peek-card kk-shop" onClick={(e) => e.stopPropagation()}>
            <div className="kk-peek-name">충전하기</div>
            <div className="kk-shop-bal">지금 남은 대화 {remaining}번{balance.credits > 0 ? ` · 충전 ${balance.credits}` : ""}</div>
            {Object.entries(SKUS).map(([k, s]) => (
              <button key={k} className={`kk-sku${s.menheraDays ? " menhera" : ""}`} onClick={() => buy(k)}>
                <span className="kk-sku-name">{s.name}{s.note && <small>{s.note}</small>}</span>
                <span className="kk-sku-price">{s.price}</span>
              </button>
            ))}
            <div className="kk-pay-note">공짜 {limit}번은 매일 자정에 다시 채워져요</div>
          </div>
        </div>
      )}
      {linkOpen && (
        <div className="kk-peek" onClick={() => setLinkOpen(false)} role="dialog" aria-label="계정 연결">
          <div className="kk-peek-card kk-link" onClick={(e) => e.stopPropagation()}>
            <div className="kk-peek-name">계정 연결하기</div>
            {/* 226회차 09-28 사장님 "구글로그인으로 바꿔 회원가입빼고".
                구글이 켜져 있으면 **구글만** 내민다. 안 켜져 있으면 옛 길(이메일)을 그대로 둔다 —
                09-28 현재 두근도트 Supabase 에 구글이 꺼져 있고, 이미 이메일로 붙은 사람이 13명이라
                화면만 바꾸면 **아무도 연결 못 한다.** 켜지는 순간 저절로 바뀐다. */}
            {구글가능 === null ? (
              <p className="kk-link-help">잠시만요…</p>
            ) : 구글가능 ? (
              <>
                <p className="kk-link-help">지금까지의 대화와 친밀도가 구글 계정에 붙어요. 폰을 바꿔도 그대로예요.</p>
                {linkErr && <div className="kk-link-err">{linkErr}</div>}
                <button className="kk-link-go" onClick={구글로연결} disabled={linkBusy}>{linkBusy ? "여는 중…" : "구글로 계속하기"}</button>
              </>
            ) : (
              <>
                <p className="kk-link-help">지금까지의 대화와 친밀도가 이 이메일에 붙어요. 폰을 바꿔도 로그인하면 그대로예요.</p>
                <input type="email" placeholder="이메일" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} autoComplete="email" inputMode="email" />
                <input type="password" placeholder="비밀번호 (8자 이상)" value={linkPw} onChange={(e) => setLinkPw(e.target.value)} autoComplete="new-password" />
                {linkErr && <div className="kk-link-err">{linkErr}</div>}
                <button className="kk-link-go" onClick={linkAccount} disabled={linkBusy || !linkEmail || linkPw.length < 8}>{linkBusy ? "연결하는 중…" : "연결"}</button>
              </>
            )}
          </div>
        </div>
      )}
      {themeOpen && (
        <div className="kk-peek" onClick={() => setThemeOpen(false)} role="dialog" aria-label="배경·말풍선">
          <div className="kk-peek-card" onClick={(e) => e.stopPropagation()}>
            <div className="kk-peek-name">배경</div>
            <div className="kk-themes">
              {Object.entries(THEMES).map(([k, t]) => (
                <button key={k} className={`kk-theme${k === themeKey ? " on" : ""}`} onClick={() => pickTheme(k)}
                  style={{ background: t.wall ? `url(${t.wall}) center/cover` : t.bg, borderColor: t.line, imageRendering: "pixelated" }} aria-label={t.name}>
                  {!t.wall && <span className="kk-theme-them" style={{ background: t.them }} />}
                  {!t.wall && <span className="kk-theme-me" style={{ background: t.me }} />}
                  <span className="kk-theme-name" style={{ color: t.ink, textShadow: t.wall ? "0 1px 0 #000" : "none" }}>{t.name}</span>
                </button>
              ))}
            </div>
            <div className="kk-peek-name" style={{ marginTop: 14 }}>말풍선</div>
            <div className="kk-bubbles">
              {Object.entries(BUBBLES).map(([k, b]) => (
                <button key={k} className={`kk-bubble-pick${k === bubbleKey ? " on" : ""} ${b.cls}`} onClick={() => pickBubble(k)}>
                  <span className="kk-bubble them">안녕</span>
                  <span className="kk-bubble me">응!</span>
                  <small>{b.name}</small>
                </button>
              ))}
            </div>
            <button className="kk-peek-close" onClick={() => setThemeOpen(false)}>닫기</button>
          </div>
        </div>
      )}

      {/* 얼굴을 누르면 **프로필 사진**(21:06 사장님 "이거 없애고 사진 넣으라고" — 표정 12장 판은 뺐다). */}
      {peek && (
        <div className="kk-peek" onClick={() => setPeek(null)} role="dialog" aria-label={`${who.name}`}>
          <div className="kk-peek-card" onClick={(e) => e.stopPropagation()}>
            {who.photos?.[0] ? <img className="kk-peek-photo" src={who.photos[0].url} alt={who.name} /> : <img src={face("neutral")} alt={who.name} />}
            <div className="kk-peek-name">{who.name}</div>
            <div className="kk-peek-stage">{"♥".repeat(bond.stage)}{"♡".repeat(Math.max(0, 5 - bond.stage))} · {STAGE_WORD[bond.stage] ?? ""}</div>
            {(who.photos?.length ?? 0) > 1 && (
              <div className="kk-peek-photos">
                {who.photos!.map((p, i) => <img key={i} src={p.url} alt="" />)}
              </div>
            )}
            <a className="kk-peek-go" href={`/dot/${who.slug}/profile`}>프로필 보기</a>
            <button className="kk-peek-close" onClick={() => setPeek(null)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

const STAGE_WORD = ["", "처음 보는 사이", "아는 사이", "친한 사이", "가까운 사이", "아주 가까운 사이"];

/**
 * 배경·말풍선 테마 — 09-11 사장님 "배경화면 변경, 말풍선 변경".
 * 카톡의 그 설정이다. **브라우저에만 저장한다**(localStorage): 취향은 서버가 알 필요가 없고,
 * 오늘처럼 DB 가 막힌 날에도 바뀌어야 한다. 색은 전부 도트 세계 안에서 — 그라데이션 없음.
 */
type Theme = { bg: string; bar: string; line: string; them: string; me: string; meText: string; ink: string; name: string;
  /** 상대 말풍선 글자색(어두운 말풍선이면 흰색). 없으면 검정. */
  themText?: string;
  /** 도트 그림 배경(public/wallpapers). 있으면 bg 위에 깔린다. */
  wall?: string };
/**
 * 09-11 사장님: "배경화면 도트로 몇 개 만들고 선택할 수 있게, 말풍선도."
 * 그림 배경은 `engine/tools/dot_wallpapers.mts` 가 만든 160×240 도트(≈10KB). 위에 얹히는 글자·말풍선이 읽히도록
 * 그림은 살짝 어둡게 뽑았고, 이름·시각 글자는 그림 위에서 흰색으로 바뀐다(`.has-wall`).
 */
const THEMES: Record<string, Theme> = {
  kakao:  { name: "기본",   bg: "#b2c7d9", bar: "rgba(178,199,217,.96)", line: "#9db4c9", them: "#ffffff", me: "#fee500", meText: "#141414", ink: "#1c1c1c" },
  night:  { name: "밤",     bg: "#1b2230", bar: "#232c3d", line: "#3a4660", them: "#2c3648", me: "#ffd479", meText: "#241b0a", ink: "#e9edf2" },
  peach:  { name: "복숭아", bg: "#f6d8cf", bar: "#efc4b7", line: "#d9a89a", them: "#fffaf7", me: "#ff9db0", meText: "#3a1520", ink: "#2b1a17" },
  mint:   { name: "민트",   bg: "#cfe9dd", bar: "#b9dccb", line: "#8fbfa6", them: "#ffffff", me: "#b7f0c4", meText: "#12331d", ink: "#12241a" },
  paper:  { name: "종이",   bg: "#efe8d8", bar: "#e3d9c3", line: "#c9b995", them: "#fffdf7", me: "#f2dd8a", meText: "#3a2f10", ink: "#2b2418" },
  pixel:  { name: "도트",   bg: "#120e1c", bar: "#241b38", line: "#5a4a80", them: "#f2e9d8", me: "#ff8fa8", meText: "#2a1020", ink: "#f2e9d8" },
  // ── 도트 그림 ──
  // 09-11 사장님 "배경과 맞춰서 말풍선 구성": 배경마다 상대·내 말풍선 색을 짝지었다. 흰+노랑을 아무 데나 얹으면 스티커처럼 뜬다.
  nightsky: { name: "밤하늘", wall: "/wallpapers/night.png",  bg: "#141a2e", bar: "rgba(20,26,46,.9)", line: "#3b4a70", them: "#243352", themText: "#eef2ff", me: "#ffd166", meText: "#1e1600", ink: "#f2f5ff" },
  sakura: { name: "벚꽃",   wall: "/wallpapers/sakura.png", bg: "#e9c9cf", bar: "rgba(255,245,247,.92)", line: "#b98590", them: "#fffafb", themText: "#2b1a1f", me: "#ff9db0", meText: "#3a1520", ink: "#2b1a1f" },
  rain:   { name: "비",     wall: "/wallpapers/rain.png",   bg: "#2b3542", bar: "rgba(43,53,66,.9)", line: "#56657a", them: "#334253", themText: "#f1f5f9", me: "#f5c04a", meText: "#231a00", ink: "#eef2f7" },
  sunset: { name: "노을",   wall: "/wallpapers/sunset.png", bg: "#5a3a52", bar: "rgba(90,58,82,.9)", line: "#93688a", them: "#4a2f45", themText: "#fff3ea", me: "#ffb36b", meText: "#2a1400", ink: "#fff3ea" },
  room:   { name: "내 방",  wall: "/wallpapers/room.png",   bg: "#2a2230", bar: "rgba(42,34,48,.9)", line: "#5a4a68", them: "#3d3240", themText: "#f4ecdf", me: "#ffcf7a", meText: "#241b0a", ink: "#f4ecdf" },
  store:  { name: "편의점", wall: "/wallpapers/store.png",  bg: "#1b2330", bar: "rgba(27,35,48,.9)", line: "#465569", them: "#28364a", themText: "#eef3fa", me: "#ffe066", meText: "#231d00", ink: "#eef3fa" },
};
/** 말풍선 모양. 전부 CSS 다 — 그림값이 안 든다. */
const BUBBLES: Record<string, { name: string; cls: string }> = {
  kakao: { name: "카톡",     cls: "bub-kakao" },
  pixel: { name: "도트",     cls: "bub-pixel" },
  rpg:   { name: "대화창",   cls: "bub-rpg" },
  round: { name: "둥근",     cls: "bub-round" },
};
const BUBBLE_KEY = "dot-bubble";
const THEME_KEY = "dot-theme";

/** "오후 9:17". 브라우저에서만 부른다(위 `mounted` 설명 참고). */
/** 한국 시간 자정까지 "N시간 M분". 한도는 한국 날짜로 초기화된다(dot_usage.day). */
function untilReset(): string {
  const now = Date.now();
  const kst = new Date(now + 9 * 3_600_000);
  const nextMidnightKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1) - 9 * 3_600_000;
  const min = Math.max(1, Math.round((nextMidnightKst - now) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const ap = h < 12 ? "오전" : "오후";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${hh}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 카톡 배치 + 도트 껍데기.
 *   - 바탕 #b2c7d9, 상대 말풍선 흰색(왼쪽), 내 말풍선 노랑(오른쪽) — 카톡 그대로.
 *   - 모서리 둥글기는 살짝만(2px). 0 으로 두면 카톡처럼 안 보이고, 크게 두면 도트가 깨진다.
 *   - 글꼴 Galmuri, 프로필은 image-rendering:pixelated — 여기가 '도트' 를 지킨다.
 */
const CSS = `
/* 09-11 사장님: "UI 좀… 조잡함. 깔끔하고 모던하게."
 * 캐릭터·배경 그림만 도트로 두고, 껍데기는 요즘 메신저처럼: Pretendard, 18px 말풍선, 얇은 선, 옅은 그림자.
 * 도트 글꼴을 UI 전체에 깔았던 것이 조잡함의 절반이었다. */
* { box-sizing:border-box; }
.kk-root { min-height:100dvh; background:#0b0f14; display:flex; align-items:flex-start; justify-content:center;
  font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif;
  color:#111; -webkit-font-smoothing:antialiased; }
.kk-boot { padding:40px; color:#eee; }

.kk-phone { width:100%; max-width:430px; height:100dvh; max-height:940px; position:relative; overflow:hidden;
  background:var(--bg, #dfe8f1); color:var(--ink, #111); display:flex; flex-direction:column; }

/* 위 띠 */
.kk-bar { display:flex; align-items:center; gap:10px; height:56px; padding:0 8px 0 4px;
  background:var(--bar, rgba(255,255,255,.92)); backdrop-filter:blur(8px); border-bottom:1px solid rgba(0,0,0,.06); }
.kk-back { width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:50%;
  font-size:26px; line-height:1; color:var(--ink, #222); text-decoration:none; }
.kk-back:active { background:rgba(0,0,0,.06); }
.kk-title { flex:1; font-size:17px; font-weight:600; letter-spacing:-.2px; }
.kk-hearts { color:#ff5c7a; font-size:13px; letter-spacing:1px; }
.kk-more { width:40px; height:40px; border-radius:50%; background:none; border:none; font-size:24px; line-height:1; color:var(--ink, #222); cursor:pointer; }
.kk-more:active { background:rgba(0,0,0,.06); }
.kk-mode { font-size:11px; font-weight:600; color:#fff; background:#ff5c7a; border-radius:999px; padding:2px 8px; margin-left:6px; }
.kk-menu { position:absolute; right:10px; top:60px; z-index:5; background:#fff; border-radius:14px; min-width:210px;
  box-shadow:0 10px 30px rgba(0,0,0,.18), 0 1px 0 rgba(0,0,0,.04); overflow:hidden; display:flex; flex-direction:column; padding:6px; }
.kk-menu button, .kk-menu a { text-align:left; background:none; border:none; padding:11px 12px; border-radius:10px;
  font:inherit; font-size:14px; color:#141414; cursor:pointer; text-decoration:none; display:flex; flex-direction:column; gap:2px; }
.kk-menu button:active, .kk-menu a:active { background:#f2f4f7; }
.kk-menu small { font-size:12px; color:#8a8f98; }
.kk-menu button.danger { color:#d33d5a; }
.kk-menu a.muted { color:#5c6570; }
.kk-pay { text-align:center; }
.kk-guide ul { text-align:left; margin:12px 0 0; padding-left:18px; font-size:14px; line-height:1.8; color:#3c434b; }
.kk-guide b { color:#111; }
.kk-pay-badge { display:inline-block; font-size:11px; font-weight:600; color:#fff; background:#ff5c7a; border-radius:999px; padding:3px 10px; margin-bottom:6px; }
.kk-pay-list { text-align:left; margin:12px 0 0; padding-left:18px; font-size:14px; line-height:1.7; color:#3c434b; }
.kk-pay-price { font-size:22px; font-weight:700; margin-top:14px; color:#111; }
.kk-pay-go { margin-top:10px; width:100%; padding:13px; background:#ff5c7a; color:#fff; border:none; border-radius:12px; font:inherit; font-size:15px; font-weight:600; cursor:pointer; }
.kk-pay-note { font-size:12px; color:#8a8f98; margin-top:8px; }
.kk-link { display:flex; flex-direction:column; gap:10px; }
.kk-link-help { margin:0; font-size:13px; color:#5c6570; line-height:1.55; }
.kk-link input { padding:12px 14px; border:1px solid rgba(0,0,0,.12); border-radius:12px; background:#fafbfc; font:inherit; font-size:15px; color:#141414; outline:none; }
.kk-link input:focus { border-color:#ff5c7a; background:#fff; }
.kk-link-err { font-size:13px; color:#b4233d; }
.kk-link-go { padding:13px; background:#fee500; color:#1f1a00; border:none; border-radius:12px; font:inherit; font-size:15px; font-weight:600; cursor:pointer; }
.kk-link-go:disabled { background:#eceff3; color:#a3aab3; }

/* 대화 */
.kk-log { flex:1; min-height:0; overflow-y:auto; padding:12px 10px 16px; display:flex; flex-direction:column; gap:10px; position:relative; z-index:1; }
.kk-wall { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; image-rendering:pixelated; z-index:0; pointer-events:none; }
.kk-bar, .kk-chips, .kk-warn, .kk-input-row, .kk-foot, .kk-limit { position:relative; z-index:1; }
.has-wall .kk-name, .has-wall .kk-time { color:#fff; opacity:.95; text-shadow:0 1px 2px rgba(0,0,0,.6); }
.has-wall .kk-day { background:rgba(0,0,0,.45); color:#fff; }
.kk-day { align-self:center; background:rgba(0,0,0,.16); color:#fff; font-size:11px; padding:4px 12px; border-radius:999px; margin:4px 0 2px; }
.kk-item { display:flex; flex-direction:column; gap:10px; }
.kk-item.run { margin-top:-5px; }
.kk-row { display:flex; align-items:flex-end; gap:8px; }
.kk-row.them { justify-content:flex-start; align-items:flex-start; }
.kk-row.me { justify-content:flex-end; }

/* 프로필 — 부드러운 네모, 도트는 그대로 */
.kk-face { width:40px; height:40px; flex:0 0 40px; background:#fff; padding:0; cursor:pointer; border:none; border-radius:13px; overflow:hidden;
  box-shadow:0 1px 3px rgba(0,0,0,.12); display:flex; align-items:center; justify-content:center; }
.kk-face img { width:100%; height:100%; image-rendering:pixelated; object-fit:contain; object-position:center 18%; transform:scale(1.5); }
.has-faces .kk-face img, .has-faces .kk-peek-faces img { object-position:center; transform:none; }
.kk-face img.photo { object-fit:cover; object-position:center top; transform:none; }
.kk-face.pop img { animation:kk-pop .28s cubic-bezier(.2,1.4,.4,1); }
@keyframes kk-pop { 0% { transform:scale(1) } 60% { transform:scale(1.12) } 100% { transform:scale(1) } }
.kk-said { min-width:0; max-width:74%; }
.kk-name { font-size:12px; color:#3c434b; margin:1px 0 4px 2px; }
.kk-meta { display:flex; flex-direction:column; align-items:flex-end; gap:1px; padding-bottom:2px; }
.kk-unread { font-size:11px; font-weight:600; color:#f7b500; line-height:1; }
.kk-pair { display:flex; align-items:flex-end; gap:6px; }
.kk-pair + .kk-pair { margin-top:4px; }
.kk-bubble { padding:8px 12px; font-size:15px; line-height:1.45; white-space:pre-wrap; word-break:break-word; letter-spacing:-.1px; border-radius:12px; position:relative; }
.kk-bubble.them { background:var(--them, #fff); color:var(--themText, #141414); }
.kk-bubble.me { background:var(--me, #fee500); color:var(--meText, #141414); max-width:74%; }
/* 기본(카톡): 위쪽에 작은 꼬리. 상대는 얼굴 쪽, 나는 오른쪽. 연달아 말하면 첫 말에만. */
.bub-kakao .kk-item:not(.run) .kk-bubble.them::before { content:""; position:absolute; left:-6px; top:8px; width:8px; height:8px; background:var(--them, #fff); clip-path:polygon(100% 0, 0 0, 100% 100%); }
.bub-kakao .kk-item:not(.run) .kk-bubble.me::after { content:""; position:absolute; right:-6px; top:8px; width:8px; height:8px; background:var(--me, #fee500); clip-path:polygon(0 0, 100% 0, 0 100%); }
.bub-round .kk-bubble { border-radius:18px; }
.bub-round .kk-bubble.them { border-top-left-radius:6px; }
.bub-round .kk-bubble.me { border-top-right-radius:6px; }
.kk-bubble.typing { color:#9aa3ad; letter-spacing:2px; }
.kk-cursor { color:#9aa3ad; animation:kk-blink 1s steps(2,end) infinite; margin-left:1px; }
@keyframes kk-blink { 0%,49% { opacity:1 } 50%,100% { opacity:0 } }
/* 97회차 사장님 "잘 안 잘린 거 맞지?": 시트 칸이 허리에서 끝나 스티커 아래가 뚝 잘려 보였다. 라인·카톡 스티커처럼 **흰 테두리(다이컷)** 를 둘러
   잘린 선이 스티커의 테두리로 읽히게 한다. 네 방향 drop-shadow 2px = 픽셀 외곽선. */
.kk-sticker { width:128px; height:128px; image-rendering:pixelated; filter:drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff) drop-shadow(2px 3px 0 rgba(0,0,0,.28)); animation:kk-pop .28s cubic-bezier(.2,1.4,.4,1); }
.kk-time { font-size:11px; color:#5c6570; white-space:nowrap; padding-bottom:2px; }

/* 말풍선 모양 — 다른 셋 */
/* 도트 말풍선(기본): 계단 모서리 + 2px 픽셀 테두리 + 2px 그림자 + 계단 꼬리. 글자는 그대로(Pretendard) — 도트는 그림·풍선까지. */
.bub-pixel .kk-bubble { border-radius:0; box-shadow:none; position:relative; isolation:isolate; background:var(--pxLine, rgba(0,0,0,.55));
  clip-path:polygon(4px 0, calc(100% - 4px) 0, calc(100% - 4px) 2px, calc(100% - 2px) 2px, calc(100% - 2px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 2px) calc(100% - 4px), calc(100% - 2px) calc(100% - 2px), calc(100% - 4px) calc(100% - 2px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 2px), 2px calc(100% - 2px), 2px calc(100% - 4px), 0 calc(100% - 4px), 0 4px, 2px 4px, 2px 2px, 4px 2px); padding:9px 13px; filter:drop-shadow(2px 2px 0 rgba(0,0,0,.22)); }
.bub-pixel .kk-bubble::before { content:""; position:absolute; inset:2px; z-index:-1; background:var(--pxFill); clip-path:polygon(4px 0, calc(100% - 4px) 0, calc(100% - 4px) 2px, calc(100% - 2px) 2px, calc(100% - 2px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 2px) calc(100% - 4px), calc(100% - 2px) calc(100% - 2px), calc(100% - 4px) calc(100% - 2px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 2px), 2px calc(100% - 2px), 2px calc(100% - 4px), 0 calc(100% - 4px), 0 4px, 2px 4px, 2px 2px, 4px 2px); }
.bub-pixel .kk-bubble.them { --pxFill:var(--them, #fff); }
.bub-pixel .kk-bubble.me { --pxFill:var(--me, #fee500); }
.bub-pixel .kk-item:not(.run) .kk-bubble.them::after, .bub-pixel .kk-item:not(.run) .kk-bubble.me::after { content:""; position:absolute; top:10px; width:8px; height:8px; background:var(--pxFill); z-index:1; }
.bub-pixel .kk-item:not(.run) .kk-bubble.them::after { left:-6px; clip-path:polygon(100% 0, 50% 0, 50% 25%, 25% 25%, 25% 50%, 0 50%, 0 75%, 25% 75%, 25% 100%, 100% 100%); }
.bub-pixel .kk-item:not(.run) .kk-bubble.me::after { right:-6px; clip-path:polygon(0 0, 50% 0, 50% 25%, 75% 25%, 75% 50%, 100% 50%, 100% 75%, 75% 75%, 75% 100%, 0 100%); }
.has-wall.bub-pixel .kk-bubble { --pxLine:rgba(0,0,0,.7); }
.bub-pixel .kk-day { border-radius:0; clip-path:polygon(4px 0, calc(100% - 4px) 0, calc(100% - 4px) 2px, calc(100% - 2px) 2px, calc(100% - 2px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 2px) calc(100% - 4px), calc(100% - 2px) calc(100% - 2px), calc(100% - 4px) calc(100% - 2px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 2px), 2px calc(100% - 2px), 2px calc(100% - 4px), 0 calc(100% - 4px), 0 4px, 2px 4px, 2px 2px, 4px 2px); }
.bub-pixel .kk-face { border-radius:0; clip-path:polygon(4px 0, calc(100% - 4px) 0, calc(100% - 4px) 2px, calc(100% - 2px) 2px, calc(100% - 2px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 2px) calc(100% - 4px), calc(100% - 2px) calc(100% - 2px), calc(100% - 4px) calc(100% - 2px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 2px), 2px calc(100% - 2px), 2px calc(100% - 4px), 0 calc(100% - 4px), 0 4px, 2px 4px, 2px 2px, 4px 2px); box-shadow:none; }
.bub-pixel .kk-limit { border-radius:0; clip-path:polygon(4px 0, calc(100% - 4px) 0, calc(100% - 4px) 2px, calc(100% - 2px) 2px, calc(100% - 2px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 2px) calc(100% - 4px), calc(100% - 2px) calc(100% - 2px), calc(100% - 4px) calc(100% - 2px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 2px), 2px calc(100% - 2px), 2px calc(100% - 4px), 0 calc(100% - 4px), 0 4px, 2px 4px, 2px 2px, 4px 2px); box-shadow:none; }
.bub-rpg .kk-bubble { border-radius:4px; border:3px double #2b3a45; box-shadow:2px 2px 0 rgba(0,0,0,.25); }
.bub-rpg .kk-bubble.them { background:#f7f1e3; color:#141414; }

/* 한도 카드 */
.kk-limit { align-self:center; margin:8px 0 4px; max-width:88%; background:#fff; border-radius:16px; padding:16px 18px; text-align:center; color:#141414;
  box-shadow:0 4px 16px rgba(0,0,0,.08); }
.kk-limit-title { font-size:16px; font-weight:600; margin-bottom:6px; }
.kk-limit-body { font-size:14px; line-height:1.6; color:#3c434b; }
.kk-limit-btn { margin-top:12px; background:#fee500; color:#1f1a00; border:none; border-radius:12px; padding:10px 14px; font:inherit; font-size:14px; font-weight:600; cursor:pointer; }
.kk-limit-note { margin-top:8px; font-size:12px; color:#8a8f98; }
.kk-limit-btn { display:block; width:100%; }
.kk-limit-btn small { display:block; font-weight:400; font-size:11px; opacity:.7; margin-top:2px; }
.kk-limit-btn.alt { background:#ff5c7a; color:#fff; margin-top:8px; }
.kk-limit-btn:disabled { opacity:.6; }
.kk-limit-link { margin-top:10px; background:none; border:none; color:#5c6570; font:inherit; font-size:13px; text-decoration:underline; cursor:pointer; }
.kk-shop { display:flex; flex-direction:column; gap:8px; }
.kk-shop-bal { font-size:13px; color:#5c6570; margin-bottom:4px; }
.kk-sku { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; background:#f5f7fa; border:none; border-radius:14px; font:inherit; color:#141414; cursor:pointer; text-align:left; }
.kk-sku:active { background:#eaeef3; }
.kk-sku.menhera { background:#fff0f3; }
.kk-sku-name { display:flex; flex-direction:column; gap:2px; font-size:15px; font-weight:600; }
.kk-sku-name small { font-size:12px; font-weight:400; color:#8a8f98; }
.kk-sku-price { font-size:15px; font-weight:700; color:#111; white-space:nowrap; }

/* 칩 · 경고 · 입력 */
.kk-chips { display:flex; gap:8px; padding:8px 12px; overflow-x:auto; scrollbar-width:none; background:var(--bar, rgba(255,255,255,.92)); }
.kk-chips::-webkit-scrollbar { display:none; }
.kk-chip { flex:0 0 auto; background:#fff; color:#141414; border:1px solid rgba(0,0,0,.08); border-radius:999px; padding:8px 14px; font:inherit; font-size:13px; cursor:pointer;
  box-shadow:0 1px 2px rgba(0,0,0,.05); }
.kk-chip:active { background:#f2f4f7; }
.kk-warn { background:#fff8d6; color:#5a4a00; font-size:13px; padding:8px 14px; }
.kk-emo { flex:0 0 auto; width:40px; height:40px; border:none; background:none; color:var(--ink, #5c6570); opacity:.8; cursor:pointer; display:flex; align-items:center; justify-content:center; }
/* 09-13 사장님 "배경 화면 있으면 이모티콘 안 보임": 배경 그림이 position:absolute z-index:0 이라 자리 안 잡은 이 판을 덮었다. 판을 위로. */
.kk-stickers { position:relative; z-index:2; display:grid; grid-template-columns:repeat(6, 1fr); gap:4px; padding:8px; background:var(--bar, #fff); border-top:1px solid rgba(0,0,0,.06); }
.kk-stickers button { background:none; border:none; display:flex; flex-direction:column; align-items:center; gap:2px; font:inherit; font-size:11px; color:var(--ink, #5c6570); cursor:pointer; padding:4px 0; }
.kk-stickers button:disabled { opacity:.4; }
.kk-input-row { position:relative; z-index:2; display:flex; gap:6px; align-items:flex-end; padding:8px 8px calc(8px + env(safe-area-inset-bottom)); background:var(--bar, rgba(255,255,255,.92)); backdrop-filter:blur(8px); border-top:1px solid rgba(0,0,0,.06); }
.kk-quote { display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--bar, #fff); border-top:1px solid rgba(0,0,0,.06); }
.kk-quote img { width:36px; height:45px; object-fit:cover; image-rendering:pixelated; border-radius:6px; }
.kk-quote-text { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; font-size:12px; color:var(--ink, #141414); }
.kk-quote-text span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.75; }
.kk-quote button { background:none; border:none; font-size:20px; color:var(--ink, #5c6570); opacity:.7; cursor:pointer; }
.kk-plus { flex:0 0 auto; width:40px; height:40px; border:none; background:none; color:var(--ink, #5c6570); opacity:.75; font-size:26px; line-height:1; border-radius:50%; cursor:pointer; }
.kk-plus:active { background:#f2f4f7; }
.kk-input { flex:1; min-width:0; padding:10px 16px; border:none; border-radius:20px; background:#fff; color:#141414; font:inherit; font-size:15px; line-height:1.4; outline:none; resize:none; max-height:96px; overflow-y:auto; }
.kk-input:focus { background:#fff; }
.kk-input::placeholder { color:#9aa3ad; }
/* 어두운 배경(그림)에선 입력칸도 어둡게 — 흰 칸 하나만 튀지 않게 */
.has-wall .kk-input { background:rgba(255,255,255,.14); color:var(--ink, #fff); }
.has-wall .kk-input::placeholder { color:rgba(255,255,255,.55); }
.has-wall .kk-input-row { border-top-color:rgba(255,255,255,.08); }
.has-wall .kk-chip { background:rgba(255,255,255,.14); color:var(--ink, #fff); border-color:rgba(255,255,255,.18); }
.has-wall .kk-send { background:rgba(255,255,255,.14); color:rgba(255,255,255,.55); }
.has-wall .kk-send.ready { background:var(--me, #fee500); color:var(--meText, #1f1a00); }
.kk-send { flex:0 0 auto; width:40px; height:40px; display:flex; align-items:center; justify-content:center; border:none; border-radius:50%; background:#eceff3; color:#a3aab3; cursor:default; transition:background .15s, color .15s, transform .1s; }
.kk-send.ready { background:#fee500; color:#1f1a00; cursor:pointer; }
.kk-send.ready:active { transform:scale(.92); }
.kk-input:disabled { opacity:.6; }
.kk-foot { background:var(--bar, rgba(255,255,255,.92)); color:var(--ink, #8a8f98); opacity:.8; font-size:12px; padding:0 14px 8px; text-align:center; }

.kk-toast { position:fixed; left:50%; bottom:84px; transform:translateX(-50%); background:rgba(20,24,30,.92); color:#fff; padding:10px 16px; font-size:13px; border-radius:999px;
  box-shadow:0 6px 20px rgba(0,0,0,.25); }

/* 시트(큰 얼굴·배경 고르기) */
.kk-peek { position:fixed; inset:0; background:rgba(10,14,20,.5); display:flex; align-items:flex-end; justify-content:center; z-index:20; }
.kk-peek-card { width:100%; max-width:430px; background:#fff; border-radius:22px 22px 0 0; padding:18px 18px 26px; text-align:center; max-height:86dvh; overflow-y:auto;
  box-shadow:0 -10px 40px rgba(0,0,0,.2); }
.kk-peek-card > img { width:200px; height:200px; image-rendering:pixelated; background:#f1f3f6; border-radius:20px; }
.kk-peek-name { font-size:17px; font-weight:600; margin-top:10px; }
.kk-peek-photo { width:200px; height:250px; object-fit:cover; image-rendering:pixelated; border-radius:20px; }
.kk-peek-photos { display:flex; gap:8px; justify-content:center; margin-top:14px; }
.kk-peek-photos img { width:72px; height:90px; object-fit:cover; image-rendering:pixelated; border-radius:12px; }
.kk-peek-go { display:block; margin:14px auto 0; max-width:320px; background:#fee500; color:#1f1a00; text-decoration:none; font-weight:600; font-size:15px; padding:12px; border-radius:12px; }
.kk-peek-stage { font-size:13px; color:#ff5c7a; margin-top:4px; }
.kk-peek-faces { display:flex; gap:8px; justify-content:center; margin-top:14px; flex-wrap:wrap; }
.kk-peek-faces button { width:44px; height:44px; padding:0; background:#f1f3f6; border:2px solid transparent; border-radius:12px; overflow:hidden; cursor:pointer; }
.kk-peek-faces button.on { border-color:#ff5c7a; }
.kk-peek-faces img { width:100%; height:100%; image-rendering:pixelated; object-fit:contain; object-position:center 18%; transform:scale(1.5); }
.kk-themes { display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-top:12px; }
.kk-theme { position:relative; height:72px; border:2px solid transparent; border-radius:14px; cursor:pointer; padding:0; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.1); }
.kk-theme.on { border-color:#ff5c7a; }
.kk-theme-them { position:absolute; left:8px; top:12px; width:30px; height:12px; border-radius:6px; }
.kk-theme-me { position:absolute; right:8px; top:30px; width:26px; height:12px; border-radius:6px; }
.kk-theme-name { position:absolute; left:0; right:0; bottom:6px; font-size:11px; font-weight:500; }
.kk-bubbles { display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; margin-top:12px; }
.kk-bubble-pick { background:#dfe8f1; border:2px solid transparent; border-radius:14px; padding:10px; cursor:pointer; display:flex; flex-direction:column; gap:6px; align-items:flex-start; }
.kk-bubble-pick.on { border-color:#ff5c7a; }
.kk-bubble-pick .kk-bubble { max-width:none; font-size:12px; padding:6px 10px; }
.kk-bubble-pick .kk-bubble.me { align-self:flex-end; }
.kk-bubble-pick small { font-size:12px; color:#5c6570; align-self:center; }
.kk-peek-close { margin-top:14px; background:#f1f3f6; border:none; border-radius:12px; padding:10px 18px; font:inherit; font-size:14px; font-weight:500; cursor:pointer; }
`;

/** 사람 스티커 그림 — 12×12 격자, 그림값 0. */
function StickerSvg({ k, size }: { k: string; size: number }) {
  const st = USER_STICKERS[k]; if (!st) return null;
  return <svg className="kk-usticker" width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-label={st.ko}><path d={st.path} fill={st.color} fillRule="evenodd" /></svg>;
}
