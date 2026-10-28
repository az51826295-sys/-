"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BUZZ, SFX, burst, buzz, shake } from "@/lib/dot/feel";
import { collectedLine, getLang, t, type Lang } from "@/lib/dot/lang";
import { cardFor, cardName, cardText, collectionFor, dayKey, TAROT, type Deck, type TarotCard } from "@/lib/dot/tarot";

/**
 * **하루 한 장 타로** — 대화 턴을 다 쓴 사람도 매일 올 이유 (10-28).
 *
 * 카드는 (사람, 날짜)의 함수라 **서버를 안 부른다.** 새로고침해도 같은 카드다 —
 * 흔들리면 마음에 드는 게 나올 때까지 돌리게 되고, 그 순간 "하루 한 장" 이 사라진다.
 *
 * 로그인 없이 쓰는 앱이라 사람 이름이 없을 수 있다. 그때는 **이 기기에 붙는 id** 를
 * 하나 만들어 쓴다 — 계정이 생기면 그때부터 계정 id 로 뽑히고, 도감은 날짜로 되짚으니
 * 과거가 사라지지 않는다.
 */

export default function TarotClient({ userId, menhera }: { userId: string | null; menhera: boolean }) {
  const [lang, setLangState] = useState<Lang>("ko");
  const [who, setWho] = useState<string | null>(null);
  const [deck, setDeck] = useState<Deck>("white");
  const [flipped, setFlipped] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLangState(getLang());
    if (userId) { setWho(userId); return; }
    /* 로그인 안 한 사람 — 이 기기에 붙는 id 를 한 번만 만든다 */
    try {
      let id = localStorage.getItem("dot_who");
      if (!id) { id = "dev-" + Math.random().toString(36).slice(2, 12); localStorage.setItem("dot_who", id); }
      setWho(id);
    } catch { setWho("dev-anon"); }
  }, [userId]);

  const day = dayKey();
  const card = useMemo(() => (who ? cardFor(who, day, deck) : null), [who, day, deck]);
  const 모음 = useMemo(() => (who ? collectionFor(who, deck, 90) : []), [who, deck]);
  const 모은수 = 모음.filter((x) => x.seen).length;

  /* 덱을 바꾸면 다시 덮는다 — 안 덮으면 블랙으로 바꿔서 두 장을 보게 된다 */
  useEffect(() => { setFlipped(false); }, [deck]);

  function 뒤집기() {
    if (flipped) return;
    setFlipped(true);
    SFX.flip();
    buzz(BUZZ.heart);
    burst(cardRef.current, { n: 14, color: deck === "black" ? "#e0457b" : "#7b5ea7", size: 5 });
    if (deck === "black") { SFX.menhera(); shake(rootRef.current, 7); }
  }

  if (!who || !card) return <div className="tr-root" />;

  return (
    <div className="tr-root" ref={rootRef} data-deck={deck}>
      <style>{CSS}</style>

      <div className="tr-top">
        <Link href="/dot/feed" className="tr-back" onClick={() => SFX.tap()}>{"<"} {t("back", lang)}</Link>
        <span className="tr-day">{day}</span>
      </div>

      <h1 className="tr-title">{t("tarot_title", lang)}</h1>

      <button
        ref={cardRef}
        type="button"
        className={`tr-card${flipped ? " on" : ""}`}
        onClick={뒤집기}
        aria-label={flipped ? cardName(card, lang) : t("tarot_tap", lang)}
      >
        <span className="tr-face tr-back-face">
          <Pixels rows={BACK_PATTERN} />
        </span>
        <span className="tr-face tr-front-face">
          <Pixels rows={card.pixels} />
          <b className="tr-name">{cardName(card, lang)}</b>
        </span>
      </button>

      <p className="tr-msg">{flipped ? cardText(card, deck, lang) : t("tarot_tap", lang)}</p>
      {flipped && <p className="tr-again">{t("tarot_again", lang)}</p>}

      {/* 블랙 덱 — 구독자만. 잠겨 있어도 **보여 준다**, 그게 사는 이유가 된다 */}
      <div className="tr-decks">
        <button type="button" className={`tr-deck${deck === "white" ? " on" : ""}`}
          onClick={() => { setDeck("white"); SFX.tap(); buzz(BUZZ.tap); }}>
          {lang === "en" ? "Classic" : "기본 덱"}
        </button>
        <button type="button" className={`tr-deck${deck === "black" ? " on" : ""}${menhera ? "" : " lock"}`}
          onClick={() => {
            if (!menhera) { SFX.menhera(); buzz(BUZZ.menhera); shake(rootRef.current, 5); return; }
            setDeck("black"); SFX.tap(); buzz(BUZZ.tap);
          }}>
          {t("tarot_black", lang)}{menhera ? "" : " 🔒"}
        </button>
      </div>
      {!menhera && <p className="tr-lock">{t("tarot_black_locked", lang)}</p>}

      {/* 도감 — 며칠 왔나가 곧 몇 장이냐다 */}
      <button type="button" className="tr-collect-head" onClick={() => { setShowAll(!showAll); SFX.tap(); }}>
        {t("tarot_collection", lang)} · {collectedLine(모은수, TAROT.length, lang)} {showAll ? "▴" : "▾"}
      </button>
      {showAll && (
        <div className="tr-grid">
          {모음.map(({ card: c, seen }) => (
            <div key={c.id} className={`tr-cell${seen ? "" : " off"}`} title={seen ? cardName(c, lang) : t("tarot_locked_card", lang)}>
              <Pixels rows={seen ? c.pixels : LOCK_PATTERN} small />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 8×8 도트를 네모로 그린다. 그림 파일이 없으니 용량도 0이고 어떤 크기에서도 안 흐려진다. */
function Pixels({ rows, small }: { rows: string[]; small?: boolean }) {
  return (
    <span className={`px${small ? " sm" : ""}`} aria-hidden>
      {rows.map((r, y) => (
        <span className="px-row" key={y}>
          {[...r].map((c, x) => <i key={x} className={c === "#" ? "on" : ""} />)}
        </span>
      ))}
    </span>
  );
}

const BACK_PATTERN = ["########", "#......#", "#.#..#.#", "#..##..#", "#..##..#", "#.#..#.#", "#......#", "########"];
const LOCK_PATTERN = ["..####..", ".#....#.", ".#....#.", "########", "##.##.##", "##.##.##", "########", "........"];

const CSS = `
.tr-root{min-height:100dvh;background:#12101a;color:#e8e4f0;font-family:ui-monospace,Menlo,monospace;
  padding:14px 16px 40px;display:flex;flex-direction:column;align-items:center;gap:10px}
.tr-root[data-deck="black"]{background:#160a10;color:#f3d9e4}
.tr-top{width:100%;max-width:420px;display:flex;justify-content:space-between;align-items:center;font-size:12px;opacity:.7}
.tr-back{color:inherit;text-decoration:none}
.tr-title{font-size:16px;margin:6px 0 2px;letter-spacing:.04em}
.tr-card{position:relative;width:200px;height:286px;background:none;border:0;padding:0;cursor:pointer;
  perspective:800px;-webkit-tap-highlight-color:transparent}
.tr-face{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
  border:3px solid currentColor;border-radius:10px;backface-visibility:hidden;transition:transform .5s cubic-bezier(.2,.8,.3,1);
  background:#1c1830}
.tr-root[data-deck="black"] .tr-face{background:#24101b}
.tr-back-face{transform:rotateY(0deg)}
.tr-front-face{transform:rotateY(180deg)}
.tr-card.on .tr-back-face{transform:rotateY(-180deg)}
.tr-card.on .tr-front-face{transform:rotateY(0deg)}
.tr-name{font-size:13px;letter-spacing:.06em}
.px{display:flex;flex-direction:column;gap:2px}
.px-row{display:flex;gap:2px}
.px i{width:12px;height:12px;background:transparent;image-rendering:pixelated}
.px i.on{background:currentColor}
.px.sm i{width:4px;height:4px;gap:1px}
.tr-msg{max-width:300px;text-align:center;font-size:13px;line-height:1.7;margin:10px 0 0;min-height:44px}
.tr-again{font-size:12px;opacity:.6;margin:0}
.tr-decks{display:flex;gap:8px;margin-top:6px}
.tr-deck{background:none;border:2px solid currentColor;color:inherit;border-radius:6px;padding:6px 12px;
  font-size:12px;font-family:inherit;cursor:pointer;opacity:.5}
.tr-deck.on{opacity:1}
.tr-deck.lock{opacity:.35}
.tr-lock{font-size:11px;opacity:.5;margin:2px 0 0}
.tr-collect-head{margin-top:14px;background:none;border:0;color:inherit;font-family:inherit;font-size:12px;
  opacity:.75;cursor:pointer}
.tr-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;max-width:300px;margin-top:8px}
.tr-cell{display:flex;align-items:center;justify-content:center;padding:4px;border:1px solid currentColor;border-radius:4px}
.tr-cell.off{opacity:.22}
@media (max-width:360px){.tr-card{width:170px;height:244px}.px i{width:10px;height:10px}}
`;
