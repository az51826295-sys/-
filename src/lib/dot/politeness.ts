/**
 * 말이 존댓말인가 반말인가 — **세면 나오는 자.**
 *
 * ## 왜 자가 필요한가
 *
 * 이 앱이 파는 것은 "친해질수록 말투가 바뀐다" 이다. 그런데 그 말투는 시스템 프롬프트에
 * 한국어로 적힌 부탁일 뿐이고, **부탁이 지켜졌는지 아무도 잰 적이 없었다.** 안 지켜지면
 * 친밀도 숫자와 하트는 장식이 되고, 사용자는 왜 계속 말을 걸어야 하는지 모른다.
 *
 * 모델한테 "이거 반말이니?" 라고 묻지 않는다. 그러면 회차마다 답이 흔들리고, 흔들리는
 * 자로 잰 결과는 판정이 아니다. 한국어 종결어미는 **글자로 갈린다** — 세면 된다.
 *
 * ## 무엇을 세는가
 *
 * 문장 끝의 종결어미만 본다. 문장 중간의 "요" (예: "그래요, 그런데…")는 세지 않는다.
 * 물음표·느낌표·말줄임표는 떼고 마지막 글자들을 본다.
 *
 * 완벽한 국어 분석기가 아니다. **한 방향으로만 쓰는 자**다: 1단계와 5단계를 같은 자로
 * 재서 **내려가는지**를 본다. 절대값이 아니라 차이가 판정이다.
 */

/** 존댓말 종결. 긴 것부터 봐야 "습니다" 가 "다" 로 잘못 잡히지 않는다. */
const POLITE = [
  "습니다", "ㅂ니다", "습니까", "ㅂ니까", "세요", "셔요", "십니다", "십시오",
  "어요", "아요", "에요", "예요", "이요", "네요", "지요", "죠", "군요", "는데요",
  "거든요", "잖아요", "까요", "게요", "래요", "대요", "든요", "요",
];

/** 반말 종결. */
const CASUAL = [
  "니다만", // 방어용(거의 안 씀)
  "는데", "잖아", "거든", "구나", "군", "네", "지", "야", "어", "아", "다", "까", "래", "대", "자", "봐", "임", "음",
];

const STRIP = /[\s.!?…~♥♡ㅋㅎ,"'’”)\]}]+$/u;

/** 문장 하나가 존댓말이면 true, 반말이면 false, 못 가리면 null. */
export function politeSentence(raw: string): boolean | null {
  const s = raw.replace(STRIP, "");
  if (!s) return null;
  for (const e of POLITE) if (s.endsWith(e)) return true;
  for (const e of CASUAL) if (s.endsWith(e)) return false;
  return null;
}

export type Politeness = { polite: number; casual: number; unknown: number; ratio: number | null };

/**
 * 글 한 덩어리의 존댓말 비율. 가린 문장이 없으면 `ratio` 는 null —
 * **못 잰 것을 0 으로 적지 않는다.**
 */
export function politeness(text: string): Politeness {
  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  let polite = 0, casual = 0, unknown = 0;
  for (const s of sentences) {
    const v = politeSentence(s);
    if (v === true) polite++;
    else if (v === false) casual++;
    else unknown++;
  }
  const judged = polite + casual;
  return { polite, casual, unknown, ratio: judged ? polite / judged : null };
}
