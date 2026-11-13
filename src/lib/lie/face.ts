/**
 * **얼굴이 어느 단계인가** (11-13 사장님 "미감이 중요해" → "도트").
 *
 * 전에는 사진 한 장에 CSS 로 붉은 기를 얹었다 — 색이 바뀔 뿐 **얼굴이 바뀌지 않았다.**
 * 이제 사람마다 여섯 장이 있고(`engine/tools/lie_faces.mts`), 어느 장을 보일지를 여기서 정한다.
 *
 * ## 문턱은 새로 짓지 않았다
 *
 * 화면이 이미 수치를 말로 풀어 주고 있다(`압박말`·`분노말`·`당황말`). 얼굴이 그 말과 **다른 자리에서**
 * 바뀌면 화면이 두 말을 하게 된다 — "기분이 상했다" 라고 적혀 있는데 얼굴은 웃고 있는 식이다.
 * 그래서 같은 숫자를 쓴다: 압박 25·50 / 분노 40 / 당황 25.
 *
 * ## 차례가 뜻이다
 *
 * 무너짐 > 분노 > 당황 > 압박. 분노가 당황을 이기는 까닭은 **분노 70 이면 입을 닫기** 때문이다 —
 * 그 전에 얼굴이 먼저 알려 줘야 형사가 물러설 수 있다. 당황이 압박을 이기는 까닭은 당황이
 * "방금 한 방 맞았다" 는 신호라서다(빨리 오르고 빨리 식는다).
 *
 * **얼굴은 진짜 수치를 따른다**(세계관 ②). 기계 눈금(`보임`)이 아니라 사람의 값을 넣어야 한다 —
 * 눈금과 얼굴이 어긋나는 순간이 이 게임의 한가운데다.
 *
 * 이름이 ASCII 인 까닭: `.mts` 자가 이 모듈을 부른다(tsx 가 한글 export 를 흘린다).
 */
export const FACE_STAGES = ["calm", "tense", "rattled", "angry", "cornered", "broken"] as const;
export type FaceStage = (typeof FACE_STAGES)[number];

export function faceStage(
  수치: { 압박: number; 당황: number; 분노: number },
  무너짐: boolean,
): FaceStage {
  if (무너짐) return "broken";
  if (수치.분노 >= 40) return "angry";
  if (수치.당황 >= 25) return "rattled";
  if (수치.압박 >= 50) return "cornered";
  if (수치.압박 >= 25) return "tense";
  return "calm";
}

/** 그림 주소. `얼굴` 은 사람 폴더(`/lie/han`)다. */
export const faceUrl = (얼굴: string, stage: FaceStage): string => `${얼굴}/${stage}.png`;
