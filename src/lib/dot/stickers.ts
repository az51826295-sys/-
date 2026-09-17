/**
 * 사람이 보내는 스티커 (90회차 09-12) — 카톡 이모티콘 단추의 그 자리.
 * 그림값 0: 12×12 격자 SVG(crispEdges). 여섯 개면 충분하다 — 카톡도 처음엔 기본 이모티콘 몇 개였다.
 * 모델에겐 글로 건넨다("(하트 스티커를 보냈다)"). 표엔 sticker = "user:<key>", content = 그 글.
 */
export type UserSticker = { ko: string; tell: string; path: string; color: string };

export const USER_STICKERS: Record<string, UserSticker> = {
  heart: { ko: "하트", tell: "하트 스티커를 보냈다 — 좋아한다는 뜻", color: "#ff5c7a",
    path: "M2 3h2v1h1v1h2v-1h1v-1h2v2h1v2h-1v1h-1v1h-1v1h-1v1h-2v-1h-1v-1h-1v-1h-1v-1h-1v-2h1z" },
  smile: { ko: "웃음", tell: "웃는 스티커를 보냈다 — 즐겁다는 뜻", color: "#fee500",
    path: "M3 1h6v1h1v1h1v6h-1v1h-1v1h-6v-1h-1v-1h-1v-6h1v-1h1zM4 4h1v2h-1zM7 4h1v2h-1zM3 7h1v1h4v-1h1v1h-1v1h-4v-1h-1z" },
  cry: { ko: "엉엉", tell: "우는 스티커를 보냈다 — 슬프거나 힘들다는 뜻", color: "#8ec5ff",
    path: "M3 1h6v1h1v1h1v6h-1v1h-1v1h-6v-1h-1v-1h-1v-6h1v-1h1zM4 4h1v2h-1zM7 4h1v2h-1zM4 7h4v1h-4zM3 6h1v3h-1zM8 6h1v3h-1z" },
  angry: { ko: "화남", tell: "화난 스티커를 보냈다 — 토라졌다는 뜻", color: "#ff7a5c",
    path: "M3 1h6v1h1v1h1v6h-1v1h-1v1h-6v-1h-1v-1h-1v-6h1v-1h1zM3 3h2v1h-2zM7 3h2v1h-2zM4 5h1v1h-1zM7 5h1v1h-1zM4 8h4v1h-4z" },
  sleep: { ko: "잘자", tell: "잘 자라는 스티커를 보냈다 — 이제 잔다는 뜻", color: "#b9a7ff",
    path: "M3 1h6v1h1v1h1v6h-1v1h-1v1h-6v-1h-1v-1h-1v-6h1v-1h1zM3 5h3v1h-3zM6 5h3v1h-3zM5 8h2v1h-2zM8 0h3v1h-2v1h2v1h-3v-1h2v-1h-2z" },
  question: { ko: "물음표", tell: "물음표 스티커를 보냈다 — 궁금하거나 무슨 뜻이냐는 뜻", color: "#2ec4b6",   // 97회차: 검정은 밤하늘 배경에서 안 보였다(검수 화면). 밝은 배경·어두운 배경 둘 다 보이는 색.
    path: "M4 1h4v1h1v3h-1v1h-1v1h-2v-2h1v-1h1v-2h-2v1h-2v-2h1zM5 9h2v2h-2z" },
};

export const USER_STICKER_KEYS = Object.keys(USER_STICKERS);
export const isUserSticker = (k: unknown): k is keyof typeof USER_STICKERS => typeof k === "string" && k in USER_STICKERS;
