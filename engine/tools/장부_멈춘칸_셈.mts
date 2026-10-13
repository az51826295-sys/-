/**
 * **장부 멈춘 칸 세기 — 셈만** (10-13). DB 도 화면도 없는 순수 함수들.
 *
 * `장부_멈춘칸.mts`(사람이 보는 쪽)와 `아침보고.mts`(한 줄만 쓰는 쪽)가 **둘 다 여기서 가져다 쓴다**
 * — 셈은 한 곳에만 둔다.
 *
 * 처음엔 자 파일 하나에 셈과 화면을 같이 뒀는데, 아침보고가 `멈춘칸찾기` 를 import 하자
 * **아랫글이 전부 돌아 보고에 스무 줄이 쏟아졌다.** argv 로 "직접 돌렸나" 를 가리려 했더니
 * `rookery_env` 가 대상 경로를 argv 에서 **지우고** 넘기는 통에 그것도 틀렸다(직접 판이 조용해졌다).
 * 가리려 하지 말고 **나누는 것이 답이었다.**
 */

/** 중첩 기록을 `a.b.c` → 숫자로 펴 놓는다. 배열은 길이만 센다(줄 내용이 바뀌는 건 여기서 볼 게 아니다). */
export function 펴기(v: unknown, 앞 = "", 통: Record<string, number> = {}, 깊이 = 0): Record<string, number> {
  if (깊이 > 6) return 통;
  if (typeof v === "number" && Number.isFinite(v)) { 통[앞] = v; return 통; }
  if (Array.isArray(v)) { 통[`${앞}[]`] = v.length; return 통; }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      // 회사 id 처럼 판마다 바뀌는 열쇠는 이름을 지워 같은 칸으로 모은다(안 그러면 하루짜리 칸만 쌓인다)
      const 이름 = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(k) ? "<회사>" : k;
      펴기(x, 앞 ? `${앞}.${이름}` : 이름, 통, 깊이 + 1);
    }
  }
  return 통;
}

export type 멈춘칸 = { 길: string; 값: number; 날수: number };

/**
 * **쌓여야 하는 칸** — 사는 날이 갈수록 커지는 것만 골라 적는다. 여기 있는 칸이 멈췄으면
 * 그건 "고정이 당연한 것" 이 아니라 **고장**이다. 이 목록은 내 판단이고, 그래서 글로 남긴다.
 * (10-13 실측: `rules.cases.total 160` 이 그날 찾은 고장과 정확히 겹쳤다)
 */
export const 쌓여야하는 = [
  /rules\.cases\.total$/,            // 자가진화가 보는 사례 수 — 날마다 는다
  /rules\.cases\.holdout(Bad)?$/,    // 검증용 사례 — 같이 는다
  /rules\.cases\.bySource\./,        // 출처별 사례 — 그 출처가 살아 있으면 는다
  /implicit\.(verdicts|withReply)$/, // 말에서 주운 반응 — 대화가 있으면 는다
  /vitals\.bySource\.human$/,        // 사람 판정 — 사장님이 누르면 는다
];
export const 쌓임만 = (xs: 멈춘칸[]) => xs.filter((x) => 쌓여야하는.some((p) => p.test(x.길)));

/** 날마다 하나씩 들어온 기록들에서, **적어도 `최소날` 일 나타났고 값이 한 번도 안 바뀐** 칸만 고른다. */
export function 멈춘칸찾기(판들: Record<string, unknown>[], 최소날 = 5): 멈춘칸[] {
  const 모음 = new Map<string, number[]>();
  for (const 판 of 판들) {
    for (const [길, 값] of Object.entries(펴기(판))) {
      const a = 모음.get(길) ?? []; a.push(값); 모음.set(길, a);
    }
  }
  const 답: 멈춘칸[] = [];
  for (const [길, 값들] of 모음) {
    if (값들.length < 최소날) continue;
    if (new Set(값들).size !== 1) continue;      // 한 번이라도 움직였으면 아니다
    답.push({ 길, 값: 값들[0], 날수: 값들.length });
  }
  return 답.sort((a, b) => b.날수 - a.날수 || a.길.localeCompare(b.길));
}
