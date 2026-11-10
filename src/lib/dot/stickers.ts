/**
 * 사람이 보내는 스티커 (90회차 09-12) — 카톡 이모티콘 단추의 그 자리.
 * 그림값 0: 12×12 격자 SVG(crispEdges). 여섯 개면 충분하다 — 카톡도 처음엔 기본 이모티콘 몇 개였다.
 * 모델에겐 글로 건넨다("(하트 스티커를 보냈다)"). 표엔 sticker = "user:<key>", content = 그 글.
 */
export type UserSticker = { ko: string; tell: string; path: string; color: string };

export const USER_STICKERS: Record<string, UserSticker> = {
  heart: { ko: "하트", tell: "하트 스티커를 보냈다 — 좋아한다는 뜻", color: "#ff5c7a",
    path: "M2 3h2v1h1v1h2v-1h1v-1h2v2h1v2h-1v1h-1v1h-1v1h-1v1h-2v-1h-1v-1h-1v-1h-1v-1h-1v-2h1z" },
  smile: { ko: "웃음", tell: "웃는 스티커를 보냈다 — 즐겁다는 뜻", color: "#ffd84d",
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

/**
 * ── 캐릭터 이모티콘 (11-10 사장님: *"호감도 … 5면 그 에 맞는 이모티콘"*) ─────────────
 *
 * **새로 그리지 않는다.** 그 사람의 얼굴 스프라이트 여섯 칸이 이미 있고, 그것이 곧
 * "그에 맞는 이모티콘" 이다 — 돈이 0 이고, 기준을 이미 통과한 그림이라 결이 갈릴 자리가 없다
 * ([[dot-character-standard]] 의 얼굴 칸을 그대로 쓴다).
 *
 * 키는 `face:<감정>` 이고 표에는 사람 스티커와 같은 모양(`user:face:<감정>`)으로 남는다.
 * 문은 서버가 지킨다 — 화면만 막으면 호출로 넘어온다.
 *
 * ## 11-10 사장님 *"이모티콘을 해금 방식으로 바꾸라니까"* · *"기본은 별로다"*
 *
 * 전에는 ① 아무나 쓰는 **기본 여섯 개**(12×12 SVG)와 ② 5단계에 한꺼번에 열리는 얼굴 여섯 개였다.
 * 둘 다 틀렸다 — 기본은 조잡했고(자는 칸 수만 셌지 **생김새는 안 봤다**), 5단계는
 * 네 단계 내내 서랍이 비어 있다는 뜻이다.
 *
 * 이제 **표정마다 제 단계가 있다.** 가까워질수록 한 칸씩 열린다:
 *
 * | 단계 | 열리는 표정 |
 * |---|---|
 * | 1 | 무표정 · 웃음 |
 * | 2 | 부끄 |
 * | 3 | 시무룩 |
 * | 4 | 삐짐 |
 * | 5 | 놀람 |
 *
 * 순서는 **사이가 깊어지는 순서**다: 처음엔 웃는 낯만 보이고, 토라지거나 놀란 얼굴은
 * 친한 사이에서만 나온다. 1단계에 둘을 여는 것은 빈 서랍으로 시작하지 않기 위해서다.
 */
export const FACE_PREFIX = "face:";
const FACE_KO: Record<string, string> = {
  neutral: "무표정", happy: "웃음", shy: "부끄", sad: "시무룩", angry: "삐짐", surprised: "놀람",
};
/** 표정마다 열리는 단계. 바꾸면 **서버 문과 화면이 같이** 바뀐다(한 곳에만 적는다). */
const FACE_STAGE: Record<string, number> = {
  neutral: 1, happy: 1, shy: 2, sad: 3, angry: 4, surprised: 5,
};
export const faceStage = (e: string): number => FACE_STAGE[e] ?? 99;
export const FACE_KEYS = Object.keys(FACE_KO);
/** 그 단계에서 쓸 수 있는 표정 수 — 서랍 머리의 "n/6 열림". */
export const facesOpen = (stage: number): number => FACE_KEYS.filter((e) => faceStage(e) <= stage).length;
export const isFaceSticker = (k: unknown): k is string =>
  typeof k === "string" && k.startsWith(FACE_PREFIX) && k.slice(FACE_PREFIX.length) in FACE_KO;
export const faceEmotion = (k: string): string => k.slice(FACE_PREFIX.length);
export const faceKo = (e: string): string => FACE_KO[e] ?? e;
/** 모델에게 건네는 말 — 사람 스티커와 같은 자리를 쓴다. */
export const faceTell = (이름: string, e: string): string =>
  `${이름}의 ${FACE_KO[e] ?? e} 이모티콘을 보냈다 — 그 표정으로 답하는 기분`;
