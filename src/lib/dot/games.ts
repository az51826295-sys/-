/**
 * # 캐릭터와 같이 하는 놀이 — **규칙은 코드가 센다**
 *
 * 11-09 사장님: *"따로 게임 창을"* → 캐릭터와 방 안에서 같이 하는 놀이. 넷 다 만든다:
 * 끝말잇기 · 스무고개 · 두 진실 한 거짓 · 초성 퀴즈.
 *
 * ## 왜 코드가 세나
 *
 * 모델에게 판정을 맡기면 **지는 법이 없다.** "사과"→"자두" 를 받아 주고, 스무고개는 답을
 * 중간에 바꾸고, 두 진실 한 거짓은 사람이 고른 쪽을 거짓이라고 한다. 그래서 이 파일은
 * 모델을 **안 부른다** — 첫 글자·중복·횟수·정답 맞춤은 전부 여기서 센다.
 * 모델이 하는 일은 **말투**뿐이다([[거짓말의 온도]] 와 같은 자리: 수치는 코드가 센다).
 *
 * ## 표 없이 이어 간다
 *
 * `dot_games` 표를 만들 DDL 열쇠가 없다. 그래서 두 가지로 푼다:
 *
 * 1. **숨길 것은 씨앗에서 다시 뽑는다** — 스무고개의 답, 초성 퀴즈의 낱말, 두 진실 한 거짓의
 *    거짓 자리는 `사람|캐릭터|날짜|놀이|회차` 해시로 정해진다. 서버는 언제든 다시 셀 수 있고
 *    화면에는 안 보낸다. 저장이 필요 없다.
 * 2. **보여도 되는 것은 대화에 남는다** — 끝말잇기의 지난 낱말들은 말풍선 그 자체다.
 *
 * 이름은 전부 ASCII 로 둔다 — 한글 export 는 tsx 가 조용히 흘린다([[ascii-export-names]]).
 */

export const GAMES = ["끝말잇기", "스무고개", "두진실한거짓", "초성퀴즈"] as const;
export type GameKey = (typeof GAMES)[number];

export const GAME_LABEL: Record<GameKey, string> = {
  끝말잇기: "끝말잇기",
  스무고개: "스무고개",
  두진실한거짓: "두 진실 한 거짓",
  초성퀴즈: "초성 퀴즈",
};

export const GAME_HOW: Record<GameKey, string> = {
  끝말잇기: "앞말의 끝 글자로 시작하는 낱말. 쓴 낱말은 또 못 쓴다",
  스무고개: "캐릭터가 하나를 숨긴다. 스무 번 안에 맞히기",
  두진실한거짓: "자기 얘기 셋 중 하나가 거짓. 어느 것인지 고르기",
  초성퀴즈: "ㅎㄱ 처럼 초성만 보고 낱말 맞히기",
};

/** 말머리 — 대화에 이 줄이 있으면 그 아래부터 그 놀이다. */
export const GAME_MARK = "🎮 ";
export const gameHead = (g: GameKey, 회차: number) => `${GAME_MARK}${GAME_LABEL[g]} ${회차}판`;

export function parseGameHead(content: string): { game: GameKey; 회차: number } | null {
  if (!content.startsWith(GAME_MARK)) return null;
  const m = content.slice(GAME_MARK.length).match(/^(.+?) (\d+)판/);
  if (!m) return null;
  const g = GAMES.find((k) => GAME_LABEL[k] === m[1]);
  return g ? { game: g, 회차: Number(m[2]) } : null;
}

/* ───────────────────────── 한글 다루기 ───────────────────────── */

const 첫소리 = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const 가 = 0xac00, 힣 = 0xd7a3;

export const isHangul = (s: string) => [...s].every((c) => c.charCodeAt(0) >= 가 && c.charCodeAt(0) <= 힣);

/** 한 글자의 초성·중성. */
function 쪼개기(ch: string): { 초: number; 중: number } | null {
  const code = ch.charCodeAt(0) - 가;
  if (code < 0 || ch.charCodeAt(0) > 힣) return null;
  return { 초: Math.floor(code / 588), 중: Math.floor((code % 588) / 28) };
}

/** 초성만 뽑는다 — "학교" → "ㅎㄱ". */
export function toChoseong(word: string): string {
  return [...word].map((c) => { const j = 쪼개기(c); return j ? 첫소리[j.초] : c; }).join("");
}

/**
 * **두음법칙** — 끝말잇기에서 "량" 다음에 "양" 을 받아 준다.
 *
 * 한국에서 치는 끝말잇기는 이걸 받아 준다. 안 받으면 사람이 "왜 안 돼?" 하고 떠난다.
 * ㄹ 로 시작하면 ㄴ(또는 ㅣ·ㅑ 계열 모음 앞에서는 ㅇ)으로도 셀 수 있게 **둘 다** 돌려준다.
 */
export function startsAllowed(ch: string): string[] {
  const j = 쪼개기(ch);
  if (!j) return [ch];
  const out = [ch];
  const code = ch.charCodeAt(0) - 가;
  const 나머지 = code % 588;
  const 바꾸기 = (초: number) => String.fromCharCode(가 + 초 * 588 + 나머지);
  /* 중성 ㅑㅕㅛㅠㅣㅒㅖ = 1,3,5,7,20,2,6 (ㅣ 계열) */
  const ㅣ계열 = [1, 2, 3, 5, 6, 7, 20].includes(j.중);
  if (첫소리[j.초] === "ㄹ") { out.push(바꾸기(2)); if (ㅣ계열) out.push(바꾸기(11)); }   // ㄹ→ㄴ, (ㅣ계열) ㄹ→ㅇ
  if (첫소리[j.초] === "ㄴ" && ㅣ계열) out.push(바꾸기(11));                              // ㄴ→ㅇ
  return [...new Set(out)];
}

export type WordCheck = { ok: boolean; why?: string };

/**
 * 끝말잇기 한 수 — **규칙만** 본다. 그런 낱말이 진짜 있는지는 안 본다(사전이 없다).
 * 없는 말을 거르는 일은 모델에게 맡기고, **여기서 거른 것은 뒤집히지 않는다.**
 */
export function checkWordChain(앞말: string | null, 낱말: string, 쓴것: string[]): WordCheck {
  const w = 낱말.trim();
  if (!w) return { ok: false, why: "낱말을 적어 주세요" };
  if (!isHangul(w)) return { ok: false, why: "한글 낱말만 돼요" };
  if ([...w].length < 2) return { ok: false, why: "두 글자 이상이어야 해요" };
  if (쓴것.some((x) => x === w)) return { ok: false, why: `"${w}" 는 이미 나왔어요` };
  if (앞말) {
    const 끝 = [...앞말][[...앞말].length - 1];
    const 될것 = startsAllowed(끝);
    if (!될것.includes([...w][0])) return { ok: false, why: `"${될것.join("" + "·")}" 로 시작해야 해요` };
  }
  return { ok: true };
}

/* ───────────────────────── 씨앗에서 뽑기 ───────────────────────── */

/** 사람·캐릭터·날짜·놀이·회차로 정해지는 수. 서버는 언제든 다시 센다 — 그래서 저장이 필요 없다. */
export function gameSeed(userId: string, characterId: string, day: string, game: GameKey, 회차: number): number {
  let h = 2166136261;
  for (const c of `${userId}|${characterId}|${day}|${game}|${회차}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/**
 * 초성 퀴즈 낱말 — 흔한 것만. 어려운 낱말은 못 맞히고 끝나서 다시 안 한다.
 * (여기 있는 낱말은 **답**이지 캐릭터 설정이 아니다 — 누구에게나 같다.)
 */
export const QUIZ_WORDS = [
  "학교", "라면", "지하철", "고양이", "편의점", "떡볶이", "운동화", "노래방", "생일", "우산",
  "자전거", "도서관", "아이스크림", "놀이공원", "시험기간", "첫눈", "벚꽃", "바다", "여름방학", "김밥",
  "주말", "버스정류장", "강아지", "과자", "영화관", "축구", "수학", "친구", "선생님", "휴대폰",
  "커피", "치킨", "숙제", "교복", "방학숙제", "만화책", "게임기", "달리기", "소풍", "목도리",
];

/** 스무고개 답 — 스무 번이면 좁혀지는 것들. 너무 좁으면(사람 이름) 재미가 없다. */
export const GUESS_ANSWERS = [
  "고양이", "우산", "라면", "자전거", "달", "신발", "거울", "냉장고", "눈사람", "휴대폰",
  "피아노", "풍선", "지하철", "수박", "연필", "비행기", "베개", "시계", "우유", "고래",
];

export const pickQuizWord = (seed: number) => QUIZ_WORDS[seed % QUIZ_WORDS.length];
export const pickGuessAnswer = (seed: number) => GUESS_ANSWERS[seed % GUESS_ANSWERS.length];
/** 두 진실 한 거짓 — **거짓이 몇 번째인지**를 씨앗이 정한다. 모델에게 자리를 지정해 주고,
 *  나중에 채점할 때 서버가 같은 씨앗으로 다시 센다. 그래서 모델이 말을 바꿔도 못 바꾼다. */
export const pickLieIndex = (seed: number) => seed % 3;

/** 맞혔나 — 띄어쓰기·문장부호를 지우고 견준다. "고양이!" 도 맞다. */
export function answerMatches(답: string, 사람말: string): boolean {
  const 눌러 = (s: string) => s.replace(/[\s.,!?~…·'"]/g, "");
  return 눌러(사람말).includes(눌러(답));
}

export const GUESS_LIMIT = 20;

/** 스무고개 끝났나 — 맞혔거나, 스무 번을 다 썼거나. */
export function guessState(답: string, 사람말들: string[]): { 맞힘: boolean; 쓴횟수: number; 끝났나: boolean } {
  const 맞힘 = 사람말들.some((s) => answerMatches(답, s));
  const 쓴횟수 = 사람말들.length;
  return { 맞힘, 쓴횟수, 끝났나: 맞힘 || 쓴횟수 >= GUESS_LIMIT };
}
