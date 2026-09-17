/**
 * 말풍선 쪼개기 (96회차 09-13, 사장님 "현실성 추가").
 * 사람은 한 덩어리로 안 보낸다 — "ㅇㅇ" / "근데 이 시간에 뭐해" 처럼 두세 개로 온다.
 * 모델은 `reply` 안에 **줄바꿈 하나 = 말풍선 하나** 로 낸다. 저장은 한 줄(줄바꿈 포함), 화면이 나눈다.
 * 서버·클라이언트 둘 다 쓰므로 여기엔 아무것도 import 하지 않는다.
 */
export const MAX_BUBBLES = 3;

/** 줄바꿈으로 나누고, 빈 줄은 버리고, 넷째부터는 셋째에 붙인다(카톡 연타도 셋이면 충분하다). */
export function splitBubbles(text: string): string[] {
  const parts = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= MAX_BUBBLES) return parts.length ? parts : [text.trim()];
  return [...parts.slice(0, MAX_BUBBLES - 1), parts.slice(MAX_BUBBLES - 1).join(" ")];
}

/** 말풍선마다 끝의 마침표 하나를 뗀다("어, 멍쿠." → "어, 멍쿠"). 말줄임(…, ...)과 ?! 는 둔다. 모델 자 2/19 가 여기서 났다. */
export function tidyReply(text: string): string {
  return splitBubbles(text).map((b) => b.replace(/(?<![.])[.。]$/u, "")).join("\n");
}

/** 프롬프트 한 토막 — 카톡 글 모양. 마침표·덩어리·줄바꿈. */
export function shapeRule(): string {
  return [
    "- **카톡 글 모양.** 문장 끝에 마침표를 찍지 않는다 — \"뭐 해.\" 는 화난 사람이다, \"뭐해\" 가 보통이다. 물음엔 ? 만, 감탄이나 웃음은 인물 말투대로(ㅋㅋ, ㅠ, 헤헤, 풉).",
    "- **한 말풍선은 한 호흡(20자 안팎).** 할 말이 두 호흡이면 **줄바꿈으로 나눈다** — 줄바꿈 하나가 말풍선 하나, 최대 셋. 다섯 번에 두 번쯤은 두 개로 나눠 보내라. \"ㅇㅇ\", \"아\" 같은 한마디 말풍선도 좋다.",
  ].join("\n");
}
