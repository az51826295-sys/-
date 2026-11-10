"use client";

import { GAMES, GAME_HOW, GAME_LABEL, GUESS_LIMIT, startsAllowed, toChoseong, wordsSoFar, type GameKey, type LiveGame } from "@/lib/dot/games";

/**
 * # 놀이 — 고르는 판과 **도는 동안 보이는 띠**
 *
 * 11-09 사장님: *"좀 꾸며 예쁘게."* 글자만 있던 자리에 둘을 넣는다.
 *
 * 1. **8×8 도트 아이콘** — 타로 카드와 같은 방식(그림 파일이 아니라 켜진 칸 목록이라 용량 0,
 *    어떤 크기로 키워도 안 흐려진다). 도트 앱에 사진을 끼우면 그 칸만 결이 달라진다.
 * 2. **지금 판이 어떤 상태인지** — 끝말잇기는 *다음에 올 첫 글자*, 스무고개는 *몇/스무*,
 *    초성 퀴즈는 *초성 자체*를 크게. 글로 "하는 중" 이라고만 적으면 사람은 규칙을 외워야 한다.
 *
 * 두 진실 한 거짓은 **1·2·3 단추**를 준다 — 고르는 놀이인데 타자를 치게 하면 그 자리에서 샌다.
 */

/** 8×8 — 사슬 / 물음표 / 가면 / ㅊㅅ */
const ICON: Record<GameKey, string[]> = {
  끝말잇기: ["..##....", ".#..#...", ".#..#.##", "..##.#..", "...#.#..", "..#..#..", "..#..#..", "...##..."],
  스무고개: ["..####..", ".#....#.", "......#.", "....##..", "...#....", "...#....", "........", "...#...."],
  두진실한거짓: ["########", "#.#..#.#", "#.#..#.#", "########", "#......#", "#.####.#", "#......#", "########"],
  초성퀴즈: ["#####...", "..#.....", "..#..###", "..#..#..", "..#..###", ".....#..", ".#####..", "........"],
};

function Px({ rows }: { rows: string[] }) {
  return (
    <span className="gt-px" aria-hidden>
      {rows.map((r, y) => <span key={y}>{[...r].map((c, x) => <i key={x} className={c === "#" ? "on" : ""} />)}</span>)}
    </span>
  );
}

/** 타로 한 장 — 놀이와 **아이콘 결이 같아야** 한 판으로 보인다(8×8 카드 + 별). */
const 타로아이콘 = ["..####..", "..#..#..", "..#..#..", "..#.##..", "..####..", "..#..#..", "..####..", "........"];

/**
 * 놀이 고르는 판.
 *
 * 11-10 사장님 *"그 게임에 타로도 올려"* — 타로는 끝말잇기 같은 **주고받는 판이 아니라
 * 한 번에 끝나는 한 장**이라 `GAMES` 에 넣지 않고 아래에 따로 둔다(서버의 놀이 머리·회차
 * 규칙에 섞이면 "판 끝"을 못 찾는다). 자리만 같이 둔다 — 사람에게는 같은 서랍이다.
 *
 * 타로는 **하트를 안 쓴다.** 단계가 오를 때 한 번뿐이라 한도가 이미 걸려 있다.
 */
export function GamePicker({ 이름, 고르기, 막힘, 타로 }: {
  이름: string; 고르기: (g: GameKey) => void; 막힘: boolean;
  /** `막힘` 은 **하트가 없을 때도** 켜진다. 타로는 하트를 안 쓰므로 제 조건(`바쁨`)만 본다. */
  타로?: { 쓸수있나: boolean; 안내: string; 바쁨: boolean; 뽑기: () => void } | null;
}) {
  return (
    <div className="gt-pick">
      <style>{CSS}</style>
      <div className="gt-title">{이름}와 같이 놀기 <small>한 마디에 하트 1개</small></div>
      {GAMES.map((g) => (
        <button key={g} onClick={() => 고르기(g)} disabled={막힘}>
          <Px rows={ICON[g]} />
          <span><b>{GAME_LABEL[g]}</b><small>{GAME_HOW[g]}</small></span>
        </button>
      ))}
      {타로 && (
        <button className="gt-tarot" onClick={타로.뽑기} disabled={타로.바쁨 || !타로.쓸수있나} title={타로.안내}>
          <Px rows={타로아이콘} />
          <span><b>타로 보기</b><small>{타로.안내}</small></span>
        </button>
      )}
    </div>
  );
}

/** 도는 동안 입력줄 위에 붙는 띠 — 지금 뭘 해야 하는지 한 줄로. */
export function GameBand({ live, 보내기, 막힘 }: { live: LiveGame; 보내기: (s: string) => void; 막힘: boolean }) {
  const 사람수 = live.줄들.filter((l) => l.role === "user").length;
  let 가운데: React.ReactNode = GAME_HOW[live.game];
  if (live.game === "끝말잇기") {
    const 쓴것 = wordsSoFar(live);
    const 앞말 = 쓴것[쓴것.length - 1];
    const 끝 = 앞말 ? [...앞말][[...앞말].length - 1] : null;
    가운데 = 끝
      ? <>다음은 <b className="gt-syl">{startsAllowed(끝).join(" · ")}</b> 로 시작하는 낱말 <small>({쓴것.length}개째)</small></>
      : <>아무 낱말이나 먼저 내 보세요</>;
  } else if (live.game === "스무고개") {
    가운데 = <>예/아니오로 좁혀 가세요 <b className="gt-syl">{사람수} / {GUESS_LIMIT}</b></>;
  } else if (live.game === "초성퀴즈") {
    /* 초성은 캐릭터가 낸 첫 줄에 있다 — 서버가 거기 적는다. */
    const 첫줄 = live.줄들.find((l) => l.role === "character" && !l.content.startsWith("🎮"))?.content.split("\n")[0] ?? "";
    const 초성 = 첫줄.match(/[ㄱ-ㅎ]{2,}/)?.[0] ?? toChoseong(첫줄);
    가운데 = <>이 초성은? <b className="gt-syl gt-big">{초성}</b></>;
  }
  return (
    <div className="gt-band">
      <style>{CSS}</style>
      <Px rows={ICON[live.game]} />
      <div className="gt-band-mid"><b>{GAME_LABEL[live.game]}</b><span>{가운데}</span></div>
      {live.game === "두진실한거짓" && (
        <div className="gt-pickn">
          {[1, 2, 3].map((n) => (
            <button key={n} disabled={막힘} onClick={() => 보내기(`${n}번이 거짓`)}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const CSS = `
.gt-px { display:flex; flex-direction:column; gap:1px; flex:0 0 auto; }
.gt-px > span { display:flex; gap:1px; }
.gt-px i { width:4px; height:4px; background:transparent; }
.gt-px i.on { background:currentColor; }

.gt-pick { position:relative; z-index:2; display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; padding:8px;
  background:var(--bar, #fff); border-top:1px solid rgba(0,0,0,.06); }
.gt-title { grid-column:1 / -1; font-size:12px; color:var(--ink, #8a8f98); padding:2px 2px 0; }
.gt-title small { opacity:.7; }
.gt-pick button { display:flex; gap:8px; align-items:flex-start; text-align:left; min-height:52px; padding:9px 10px;
  border:0; background:#1b1630; color:#ffd369; font:inherit; cursor:pointer; box-shadow:inset 0 0 0 2px #1c1c1c; }
.gt-pick button > span { display:flex; flex-direction:column; gap:2px; }
.gt-pick button b { font-size:13px; font-weight:400; color:#fff; }
.gt-pick button small { font-size:11px; color:#b9b0e0; line-height:1.4; }
.gt-pick button:active { transform:translate(2px,2px); }
.gt-pick button:disabled { opacity:.5; cursor:default; }
/* 타로는 **한 장짜리**라 줄 전체를 쓴다 — 네 놀이 밑에 깔리면 "다른 것" 이라는 게 자리로 읽힌다. */
.gt-pick button.gt-tarot { grid-column:1 / -1; color:#c9a7ff; background:#241c3d; }

.gt-band { position:relative; z-index:2; display:flex; align-items:center; gap:8px; padding:8px 12px;
  background:#1b1630; color:#ffd369; }
.gt-band-mid { display:flex; flex-direction:column; gap:1px; min-width:0; flex:1 1 auto; }
.gt-band-mid > b { font-size:12px; font-weight:400; color:#fff; }
.gt-band-mid > span { font-size:11px; color:#b9b0e0; }
.gt-syl { color:#ffd369; font-weight:400; }
.gt-big { font-size:15px; letter-spacing:1px; }
.gt-pickn { display:flex; gap:4px; flex:0 0 auto; }
.gt-pickn button { width:34px; height:34px; border:0; background:#2a2140; color:#ffd369; font:inherit; font-size:14px;
  cursor:pointer; box-shadow:inset 0 0 0 2px #1c1c1c; }
.gt-pickn button:active { transform:translate(2px,2px); }
.gt-pickn button:disabled { opacity:.5; cursor:default; }
`;
