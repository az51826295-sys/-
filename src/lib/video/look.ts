import { z } from "zod";

/**
 * **연출 — 이 판을 어떻게 보이게 할 것인가** (149회차 09-16).
 *
 * 사장님: *"이 템포에 이 글자 크기만 정답인 게 아니야. 재는 자가 아닌 판단자 AI라고."*
 *
 * 지금까지 영상의 모든 값이 **내가 한 번 정해 놓은 상수**였다 — 제목은 높이의 8.5%, 본문은 5.2%,
 * 줄 간격 8.2%, 장면은 목소리 + 0.4초, 무조건 가운데 정렬, 색 고정.
 * 146회차에 내가 한 일은 그 숫자를 **다른 숫자로 바꾼 것**뿐이다(17% → 29%). 정답을 하나 더 박았을 뿐 여전히 자다.
 *
 * 그런데 **차분한 60초 설명 영상과 15초짜리 광고가 같은 크기·같은 템포일 수가 없다.**
 * 그러니 값은 판마다 **정해져야** 한다 — 정해 두는 게 아니라.
 *
 * ## 왜 이것만 AI 에게 맡기는가
 *
 * 여기 있는 값은 **어떤 값이 와도 영상이 나온다.** 판단이 틀려도 화면이 깨지지 않고, 보기 나쁠 뿐이다.
 * 그래서 맡겨도 된다. 반대로 좌표·도형 경로 같은 것은 맡기면 화면 밖으로 나가거나 위아래가 뒤집힌다
 * (09-16 조사에서 확인된 알려진 고장). **무엇으로 보일지는 AI 가 정하고, 어떻게 그릴지는 코드가 한다.**
 *
 * 그리고 이게 있어야 심판자의 말에 **손잡이**가 생긴다 — "글자가 작다"·"템포가 늘어진다" 고 했을 때
 * 지금은 내가 코드를 고쳐야 바뀌지만, 이제는 다음 판의 연출값이 바뀐다.
 */

/** 값마다 **깨지지 않는 범위**. 판단은 맡기되 화면 밖으로는 못 나가게. 좁히려는 게 아니라 무너지지 말라는 것. */
export const LOOK_RANGE = {
  titleScale: [0.055, 0.14],
  bodyScale: [0.030, 0.075],
  lineGap: [1.15, 2.1],
  pad: [0.15, 1.4],
} as const;

export const lookSchema = z.object({
  titleScale: z.number().describe("제목 글자 크기 ÷ 화면 높이. 0.055~0.14. 광고·짧은 판은 크게(0.10~0.13), 차분한 설명은 0.07~0.09."),
  bodyScale: z.number().describe("본문 글자 크기 ÷ 화면 높이. 0.030~0.075. 제목의 절반 언저리가 보통이고, 줄이 많으면 줄인다."),
  lineGap: z.number().describe("줄 간격 ÷ 본문 크기. 1.15~2.1. 한글은 라틴보다 붙여도 읽히니 제목이 크면 1.3 쯤, 본문이 작고 줄이 많으면 1.6~1.8."),
  align: z.enum(["center", "left"]).describe("가운데 정렬인가 왼쪽 정렬인가. 왼쪽은 읽을 거리가 있을 때 눈이 시작점을 찾기 쉽다. 짧은 한 마디는 가운데가 낫다."),
  pad: z.number().describe("**템포.** 목소리가 끝나고 다음 장면까지 쉬는 초. 0.15~1.4. 광고는 짧게(0.2~0.4), 생각할 거리가 있으면 길게."),
  bg: z.string().describe("바탕색 16진(예: 0E1620). 어두운 쪽이 글자가 또렷하지만, 판에 따라 밝게 가도 된다 — 그때는 글자색을 어둡게."),
  ink: z.string().describe("본문 글자색 16진. 바탕과 충분히 갈라져야 한다."),
  accent: z.string().describe("강조색 16진. **한 화면에 한 군데만** 쓴다."),
  accentStyle: z.enum(["rule", "none"]).describe("제목 아래 짧은 강조선을 둘지. 안 어울리면 none — 없는 편이 나은 판도 있다."),
  // ── 153회차 09-16. 사장님: **"? 연출은?"**
  // 149회차에 내가 '연출' 이라 부른 것은 글자 크기·줄 간격·색이었다. 그건 **조판**이지 연출이 아니다.
  // 화면은 `-tune stillimage` 로 구운 정지 그림 넷을 하드컷으로 이어 붙인 것이었다 — 움직임 0, 전환 0, 리듬 0.
  // 아래 셋이 진짜로 연출에 해당하는 칸이고, 판마다 정해진다.
  motion: z.enum(["none", "rise", "drift"]).describe("글자가 어떻게 들어오고 움직이나. rise=아래서 살짝 올라오며 나타남(광고에 맞다) · drift=장면 내내 아주 느리게 흐름(차분한 설명) · none=가만히."),
  reveal: z.enum(["all", "line"]).describe("한 장면의 줄을 한꺼번에 띄울지, 한 줄씩 차례로 띄울지. line 은 말과 함께 글이 따라붙어 리듬이 생긴다. 줄이 한둘이면 all 이 낫다."),
  transition: z.enum(["cut", "fade"]).describe("장면과 장면 사이. cut=탁 끊는다(빠른 광고) · fade=짧게 어두워졌다 밝아진다(호흡이 필요한 판)."),
  why: z.string().describe("왜 이 연출인지 한 줄. 사람이 읽고 틀렸다고 말할 수 있어야 한다."),
});

export type Look = z.infer<typeof lookSchema>;

const clamp = (v: number, [lo, hi]: readonly [number, number]) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const hex = (s: string, fallback: string) => (/^[0-9a-fA-F]{6}$/.test(s.replace(/^#|^0x/, "")) ? s.replace(/^#|^0x/, "") : fallback);

/** 판단은 그대로 두고 **깨질 값만** 잡는다. 문턱이 아니라 난간이다. */
export function safeLook(l: Partial<Look> | null | undefined): Look {
  return {
    titleScale: clamp(l?.titleScale ?? 0.085, LOOK_RANGE.titleScale),
    bodyScale: clamp(l?.bodyScale ?? 0.052, LOOK_RANGE.bodyScale),
    lineGap: clamp(l?.lineGap ?? 1.55, LOOK_RANGE.lineGap),
    align: l?.align === "left" ? "left" : "center",
    pad: clamp(l?.pad ?? 0.4, LOOK_RANGE.pad),
    bg: hex(l?.bg ?? "", "0E1620"),
    ink: hex(l?.ink ?? "", "DCE6EE"),
    accent: hex(l?.accent ?? "", "3FA7FF"),
    accentStyle: l?.accentStyle === "none" ? "none" : "rule",
    motion: l?.motion === "none" || l?.motion === "drift" ? l.motion : "rise",
    reveal: l?.reveal === "all" ? "all" : "line",
    transition: l?.transition === "fade" ? "fade" : "cut",
    why: l?.why ?? "(연출을 안 정해서 기본값으로 갔다)",
  };
}

/** 사람이 읽는 한 줄 — 산출물에 적어 두면 "왜 이렇게 생겼나" 를 되물을 수 있다. */
export function lookLine(l: Look): string {
  return (
    `연출: 제목 ${(l.titleScale * 100).toFixed(1)}% · 본문 ${(l.bodyScale * 100).toFixed(1)}% · 줄간격 ${l.lineGap.toFixed(2)} · ` +
    `${l.align === "left" ? "왼쪽" : "가운데"} 정렬 · 장면 사이 ${l.pad.toFixed(2)}초 · 바탕 #${l.bg} · 강조 #${l.accent}${l.accentStyle === "none" ? "(선 없음)" : ""}` +
    `\n  움직임: ${l.motion === "rise" ? "올라오며 나타남" : l.motion === "drift" ? "느리게 흐름" : "가만히"} · ${l.reveal === "line" ? "한 줄씩" : "한꺼번에"} · 장면 전환 ${l.transition === "fade" ? "페이드" : "컷"}` +
    `\n  왜: ${l.why}`
  );
}
