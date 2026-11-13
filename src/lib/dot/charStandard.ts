import { readdirSync, existsSync } from "node:fs";

/**
 * **캐릭터 그림 기준 — 숫자가 사는 한 곳** (11-13).
 *
 * 사장님: *"업데이트 계획에 대해서 그림체 일관성 제대로 해야 해."* 그래서 한 번 고치는 대신
 * **다음 캐릭터가 저절로 맞게 나오도록** 구조를 고친다. 글(`engine/docs/dot-character-standard.md`)은
 * 그대로 두되, **도구가 읽는 숫자는 여기 하나**다.
 *
 * ## 왜 이 파일이 생겼나 — 같은 숫자가 세 군데 있었다
 *
 * 11-09 에 기준을 **도트 4(격자 128)** 로 올리고 열 명을 그 격자로 다시 뽑았다. 그런데:
 *
 *  · `dot_character_spec` 은 `도트: 4` 로 재고 있었고,
 *  · `dot_new_character`(만드는 길)는 `pixelize` 기본값 **256(도트 2)** 그대로였고,
 *  · `dot_regrid`(고치는 길)는 **64(도트 8)** 로 박혀 있었다.
 *
 * 재는 자만 새 기준을 알고, **만드는 길과 고치는 길은 각자 옛 기준**이었다. 11-13 에 나비를
 * 다시 뽑으니 혼자 도트 2 로 나온 까닭이다. 숫자를 베껴 두면 한 곳만 고치게 된다.
 *
 * ## 테두리 두께가 격자에 묶여 있다
 *
 * 흰 테두리는 **1칸** 두께다. 즉 격자를 바꾸면 테두리 화소 수도 같이 바뀐다 — `도트()` 를
 * 쓰지 않고 `2` 같은 숫자를 박으면, 격자만 올렸을 때 **절반 두께로 둘러진다.**
 */

/** 그림 한 장의 캔버스. 모든 칸이 이 크기로 나온다. */
export const 캔버스 = 512;

/** 격자 — 512 를 몇 칸으로 쪼개나. 도트 크기 = 캔버스 ÷ 격자. */
export const 격자 = 128;

/** 도트 크기(화소). 격자에서 나온다 — 따로 적지 않는다. */
export const 도트 = 캔버스 / 격자;

/** 화풍의 **본**. 새 캐릭터는 이 사람의 시트를 보여 주며 그린다 — 본이 흔들리면 결이 갈린다. */
export const 본 = "haru";

/** 한 사람이 갖춰야 하는 표정. 순서는 시트 자르는 순서와 같다. */
export const 감정 = ["neutral", "happy", "shy", "sad", "angry", "surprised"] as const;

/**
 * 스프라이트 기준. 범위는 **지어낸 것이 아니라** 사장님이 받아들인 사람들의 실측 폭이다
 * ([[ruler-measured-but-never-counted]] — 바깥 기준이 없으면 쓰고 있는 것을 먼저 잰다).
 */
export const 기준 = {
  도트,
  높이칸: [110, 128] as const,
  폭칸: [85, 128] as const,
  색수: [12, 24] as const,
  테두리: 0.9,
  얼굴: [0.55, 0.8] as const,
  아래여백: 0,
} as const;

/** 피드 사진 기준. */
export const 사진기준 = { 가로: 400, 세로: 500, 도트: 2, 색수: [8, 32] as const, 장수: 8 } as const;

/**
 * **지금 있는 사람을 센다 — 이름을 손으로 적지 않는다.**
 *
 * 11-13 까지 `dot_character_spec` 안에 열 명의 이름이 **박혀 있었다.** 열한 번째를 만들면
 * 그 사람은 기준 검사에 **아예 안 나타난다** — 자가 조용히 통과시키는 게 아니라 **보지도 않는다**
 * ([[zero-can-mean-i-cannot-see]]). 폴더에 그림이 있으면 재는 대상이다.
 */
export function 있는사람(뿌리 = "public/dot-sprites"): string[] {
  if (!existsSync(뿌리)) return [];
  return readdirSync(뿌리, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`${뿌리}/${d.name}/neutral.png`))
    .map((d) => d.name)
    .sort();
}
