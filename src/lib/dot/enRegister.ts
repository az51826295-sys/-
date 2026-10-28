/**
 * 영어 말이 **격식인가 편한 말인가** — 세면 나오는 자 (10-28).
 *
 * `politeness.ts` 의 영어 짝이다. 거기 적은 까닭이 그대로 적용된다: 이 앱이 파는 것은
 * "친해질수록 말투가 바뀐다" 이고, 영어 판에서도 그게 지켜졌는지 **누군가 세야 한다.**
 * 모델한테 "이거 편한 말이니?" 라고 물으면 회차마다 답이 흔들린다.
 *
 * ## 한국어와 다른 점
 *
 * 한국어는 **종결어미**로 갈려서 문장 끝만 보면 된다. 영어에는 그 칸이 없다. 대신
 * **줄임말**(I am → I'm)과 몇몇 낱말이 거의 그대로 거리를 나타낸다. 완벽한 분석기가
 * 아니라 **한 방향으로만 쓰는 자**다 — 1단계와 5단계를 같은 자로 재서 내려가는지 본다.
 *
 * ## 세지 않는 것
 *
 * 줄임말이 아닌 축약(it's = it is 가 아니라 소유격)은 가르지 않는다. 그 오차는 단계마다
 * 똑같이 들어가므로 **차이**를 보는 데는 영향이 없다 — 절대값으로 쓰면 안 되는 이유다.
 */

/** 격식 쪽: 줄임말을 **안 쓴** 자리와 또박또박한 인사말. */
const FORMAL = [
  /\bI am\b/g, /\bI will\b/g, /\bI have\b/g, /\bI would\b/g, /\bit is\b/g, /\bthat is\b/g,
  /\byou are\b/g, /\bdo not\b/g, /\bdoes not\b/g, /\bdid not\b/g, /\bis not\b/g, /\bare not\b/g,
  /\bcannot\b/g, /\bwill not\b/g, /\bhave not\b/g, /\bthank you\b/gi, /\bhello\b/gi,
  /\bmay I\b/gi, /\bwould you\b/gi, /\bI apologize\b/gi, /\bplease\b/gi,
];

/** 편한 쪽: 줄임말과 구어. */
const CASUAL = [
  /\bI'm\b/gi, /\bI'll\b/gi, /\bI've\b/gi, /\bI'd\b/gi, /\bit's\b/gi, /\bthat's\b/gi,
  /\byou're\b/gi, /\bdon't\b/gi, /\bdoesn't\b/gi, /\bdidn't\b/gi, /\bisn't\b/gi, /\baren't\b/gi,
  /\bcan't\b/gi, /\bwon't\b/gi, /\bhaven't\b/gi, /\bgonna\b/gi, /\bwanna\b/gi, /\bkinda\b/gi,
  /\byeah\b/gi, /\bnah\b/gi, /\byep\b/gi, /\bhey\b/gi, /\bnope\b/gi, /\bdunno\b/gi, /\bcuz\b/gi,
];

export type Register = { formal: number; casual: number; ratio: number | null };

function 센다(text: string, pats: RegExp[]): number {
  let n = 0;
  for (const p of pats) n += (text.match(p) ?? []).length;
  return n;
}

/** `ratio` = 격식 / (격식 + 편함). 둘 다 0 이면 **null — 못 잼**(0 으로 묻지 않는다). */
export function register(text: string): Register {
  const formal = 센다(text, FORMAL);
  const casual = 센다(text, CASUAL);
  const all = formal + casual;
  return { formal, casual, ratio: all === 0 ? null : formal / all };
}

/**
 * 영어로 썼나 — **한글 글자의 비율**로 본다.
 *
 * "영어로 답해" 가 안 먹히면 한글이 그대로 나온다. 글자 종류는 코드가 세는 것이고
 * 흔들리지 않는다. 이름 하나쯤 한글이 섞일 수 있어 0 을 요구하지 않는다.
 */
export function hangulShare(text: string): number {
  const 글자 = text.replace(/\s/g, "");
  if (!글자.length) return 0;
  const 한글 = (글자.match(/[가-힣ㄱ-ㆎ]/g) ?? []).length;
  return 한글 / 글자.length;
}
