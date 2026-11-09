"use client";

import { useState } from "react";
import { CARD_EN, CARD_PIXELS, DECK, type Card } from "@/lib/dot/tarotCards";

/**
 * # 카드 세 장 — 방 안에서도, 점집 화면에서도 같은 것
 *
 * 11-09 사장님: *"이어서 예쁘게 해."*
 *
 * 그림은 **8×8 도트**다(11-06 에 없앤 타로 화면에서 되살렸다). 그림 파일이 아니라 켜진 칸
 * 목록이라 용량이 0이고 어떤 크기로 키워도 안 흐려진다 — 도트 앱에 사진을 넣으면 그 칸만
 * 결이 달라진다.
 *
 * **덮인 채로 나온다.** 눌러야 한 장씩 뒤집힌다 — 세 장이 한꺼번에 펼쳐지면 읽기 전에
 * 눈이 먼저 다 보고, 카드를 받는 맛이 사라진다. 역방향은 카드를 **180도 돌려** 그린다
 * (글로만 "(역방향)" 이라고 적으면 안 보인다).
 */
export type SpreadCard = { 자리: string; 카드: Card; 역방향: boolean; 한줄: string };

export function TarotSpread({ 카드들, 관계, 작게 }: { 카드들: SpreadCard[]; 관계?: string; 작게?: boolean }) {
  const [연것, set연것] = useState<number[]>([]);
  const 다열림 = 연것.length >= 카드들.length;
  return (
    <div className={`tz${작게 ? " sm" : ""}`}>
      <style>{CSS}</style>
      <div className="tz-row">
        {카드들.map((c, i) => {
          const 열림 = 연것.includes(i);
          return (
            <button
              key={i}
              type="button"
              className={`tz-card${열림 ? " on" : ""}`}
              onClick={() => set연것((p) => (p.includes(i) ? p : [...p, i]))}
              aria-label={열림 ? `${c.자리} ${c.카드}` : `${c.자리} 카드 뒤집기`}
            >
              <span className="tz-spot">{c.자리}</span>
              <span className="tz-face tz-back"><Pixels rows={BACK} /></span>
              <span className={`tz-face tz-front${c.역방향 ? " rev" : ""}`}>
                <Front 카드={c.카드} />
              </span>
              {c.역방향 && 열림 && <span className="tz-rev">역방향</span>}
            </button>
          );
        })}
      </div>
      <div className="tz-says">
        {카드들.map((c, i) => (
          연것.includes(i) ? <p className="tz-say" key={i}><b>{c.자리}</b> {c.한줄}</p> : null
        ))}
      </div>
      {다열림 && 관계 ? <p className="tz-sum">{관계}</p> : null}
      {!다열림 && <p className="tz-tap">카드를 눌러 보세요</p>}
    </div>
  );
}

/**
 * 카드 앞면 — **그린 그림**(public/dot-tarot)이 먼저고, 없거나 못 받으면 **8×8 도트**로 물러난다.
 *
 * 11-09 에 22장을 그렸다. 그래도 도트 판을 안 지운 까닭: 한 장이 안 받아져도 그 자리가
 * 비면 안 되고, 그림 파일은 배포에 묶여 있어 **지금 당장 틀릴 수 있는 것**이기 때문이다
 * ([[art-urls-must-be-knocked]]).
 */
function Front({ 카드 }: { 카드: Card }) {
  const [깨짐, set깨짐] = useState(false);
  const i = DECK.indexOf(카드);
  return (
    <>
      {깨짐 || i < 0
        ? <Pixels rows={CARD_PIXELS[카드] ?? BACK} />
        : <img className="tz-art" src={`/dot-tarot/${i}.png`} alt="" onError={() => set깨짐(true)} />}
      <b className="tz-name">{카드}</b>
      <i className="tz-en">{CARD_EN[카드] ?? ""}</i>
    </>
  );
}

/** 8×8 도트를 네모로. `#` 이 켜진 칸. */
function Pixels({ rows }: { rows: string[] }) {
  return (
    <span className="tz-px" aria-hidden>
      {rows.map((r, y) => (
        <span className="tz-px-row" key={y}>{[...r].map((ch, x) => <i key={x} className={ch === "#" ? "on" : ""} />)}</span>
      ))}
    </span>
  );
}

const BACK = ["########", "#......#", "#.#..#.#", "#..##..#", "#..##..#", "#.#..#.#", "#......#", "########"];

/* 색은 앱의 도트 규칙을 따른다 — 먹 #1c1c1c, 종이 #fff, 분홍 #ff5c7a. 타로 자리만 **밤빛**을
   한 겹 쓴다(#1b1630): 카드가 대화 흐름에서 한 번 멈추는 자리라 바탕이 달라야 눈이 쉰다. */
const CSS = `
/* 위 18px 는 자리 이름(여기까지·지금·다음) 자리다 — 안 비워 두면 방 안에서 **"린의 카드"
   줄과 겹쳐 찍힌다**(11-09 첫 사진에서 겹쳤다). 카드 밖에 쓰는 글은 다 자리를 미리 받아 둔다. */
.tz{--ink:#1c1c1c;--night:#1b1630;--glow:#ffd369;--pink:#ff5c7a;width:100%;max-width:340px;padding-top:18px}
.tz-row{display:flex;gap:8px;justify-content:center}
.tz-card{position:relative;flex:1 1 0;max-width:104px;aspect-ratio:5/7;background:none;border:0;padding:0;
  cursor:pointer;-webkit-tap-highlight-color:transparent}
.tz-spot{position:absolute;top:-16px;left:0;right:0;font-size:11px;color:#8a8aa0;letter-spacing:0}
.tz-face{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  background:var(--night);color:var(--glow);box-shadow:inset 0 0 0 2px var(--ink);
  filter:drop-shadow(2px 2px 0 rgba(28,28,28,.55));
  backface-visibility:hidden;transition:transform .45s cubic-bezier(.2,.8,.3,1)}
.tz-back{transform:rotateY(0deg)}
.tz-front{transform:rotateY(180deg)}
.tz-card.on .tz-back{transform:rotateY(-180deg)}
.tz-card.on .tz-front{transform:rotateY(0deg)}
.tz-front.rev .tz-px{transform:rotate(180deg)}
.tz-card.on .tz-front{color:var(--glow)}
.tz-card.on .tz-front.rev{color:var(--pink)}
/* 그린 카드는 면을 꽉 채우고, 이름은 그 위에 깔린다. 도트로 물러났을 때와 자리가 같아야
   뒤집힐 때 안 튄다. image-rendering:pixelated — 100×140 짜리를 키워 쓰므로 안 흐려진다. */
.tz-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;image-rendering:pixelated}
.tz-front.rev .tz-art{transform:rotate(180deg)}
.tz-name{position:relative;font-size:11px;line-height:1.1;color:#fff;
  background:rgba(27,22,48,.85);padding:1px 4px;box-shadow:0 0 0 1px rgba(255,211,105,.35)}
.tz-en{position:relative}
.tz-en{font-size:9px;font-style:normal;color:#cfc4ff;background:rgba(27,22,48,.8);padding:0 3px}
.tz-rev{position:absolute;bottom:-15px;left:0;right:0;font-size:10px;color:var(--pink)}
.tz-px{display:flex;flex-direction:column;gap:1px}
.tz-px-row{display:flex;gap:1px}
.tz-px i{width:6px;height:6px;background:transparent}
.tz-px i.on{background:currentColor}
.tz-says{margin-top:22px;display:flex;flex-direction:column;gap:6px}
.tz-say{margin:0;font-size:13px;line-height:1.6;color:#2a2a33}
.tz-say b{color:#6b5bd2}
.tz-sum{margin:10px 0 0;padding:10px;background:var(--night);color:#efe9ff;font-size:13px;line-height:1.7;
  box-shadow:inset 0 0 0 2px var(--ink);filter:drop-shadow(2px 2px 0 rgba(28,28,28,.55))}
.tz-tap{margin:18px 0 0;font-size:11px;color:#8a8aa0;text-align:center}
.tz.sm{max-width:260px}
.tz.sm .tz-px i{width:4px;height:4px}
.tz.sm .tz-card{max-width:80px}
@media (max-width:360px){.tz-px i{width:5px;height:5px}}
`;

export default TarotSpread;
