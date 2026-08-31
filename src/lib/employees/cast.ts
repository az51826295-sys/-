/**
 * 직함에 붙는 얼굴.
 *
 * 화면에 "개발자" 라고 글자로 적는 것과, 노트북을 든 사람이 서 있는 것은 다르다.
 * 앞의 것은 읽어야 알고, 뒤의 것은 **보면 안다** — 대화창을 곁눈으로 보는 사람이
 * 지금 누가 붙어 있는지 아는 데 걸리는 시간이 다르다.
 *
 * 그림은 픽셀랩에서 뽑아 `genesis-project/audition/office/` 에서 가져왔다.
 * 48×48, 배경 투명, 반투명 없음. 발주서와 판정 기록은 그쪽에 남아 있다.
 *
 * **여기 있는 다섯은 회사 등록부(`employeeDefinitions`)에 실제로 있는 직원이다.**
 * 없는 사람을 그려 두면 화면에는 있는데 뽑을 수 없는 직원이 생기고, 그건 채용
 * 화면이 거짓말을 하는 것이 된다.
 */

export type CastMember = {
  /** 등록부의 이름과 같아야 한다. */
  name: string;
  /**
   * 화면에 쓰는 한국어 직함. 등록부의 role 은 영어라 여기서 한 번 옮긴다.
   *
   * **짧아야 한다.** 48px 그림 아래 한 줄로 들어가는데, "아트 디렉터"·"게임
   * 아티스트" 로 뒀더니 옆 사람 이름과 글자가 겹쳤다.
   */
  title: string;
  src: string;
};

export const CAST: CastMember[] = [
  { name: "Alex", title: "리서치", src: "/cast/alex.png" },
  { name: "Emma", title: "세일즈", src: "/cast/emma.png" },
  { name: "Iris", title: "아트", src: "/cast/iris.png" },
  { name: "Nova", title: "아티스트", src: "/cast/nova.png" },
  { name: "Dev", title: "개발자", src: "/cast/dev.png" },
];

/**
 * 한국어 직함으로 얼굴을 찾는다.
 *
 * 못 찾으면 `null` 이다. **빈 자리를 아무 얼굴로 채우지 않는다** — 유니티가
 * 컴파일하는 칸이나 사장님이 켜서 보는 칸에는 직원이 없고, 거기에 아무 직원을
 * 세우면 화면이 없는 사람을 일하게 만든다.
 */
export function faceFor(title: string): CastMember | null {
  return CAST.find((c) => c.title === title) ?? null;
}
