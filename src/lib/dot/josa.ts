/**
 * **이름 뒤 조사** — 받침이 있으면 "이/은", 없으면 "가/는".
 *
 * 11-06 화면 점검에서 나왔다: 한도 카드가 *"내일 도윤가 먼저 말 걸게 하기"* 라고 적고 있었다.
 * `{name}가` 로 박아 둔 자리가 여섯 곳이었고, 받침 있는 이름(도윤·린)에서 전부 틀렸다.
 * 한 곳은 이미 `은(는)` 으로 피해 가고 있었다 — 피하는 글씨도 어색하다.
 *
 * 한글 음절은 `0xAC00 + (초성×21 + 중성)×28 + 종성` 이라 **28 로 나눈 나머지가 종성**이다.
 * 한글이 아닌 이름(영어·숫자)은 알 수 없으니 받침 없는 쪽으로 둔다 — 틀리면 "가" 가 덜 어색하다.
 */

function 받침있나(말: string): boolean {
  const 끝 = (말 ?? "").trim().slice(-1);
  if (!끝) return false;
  const c = 끝.charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

/** "도윤" → "이", "유나" → "가". */
export function iGa(말: string): string {
  return 받침있나(말) ? "이" : "가";
}

/** "도윤" → "은", "유나" → "는". */
export function eunNeun(말: string): string {
  return 받침있나(말) ? "은" : "는";
}
