"use client";
/**
 * **대화 중인가 일하는 중인가** (228회차 10-02, 사장님 "대화하고 있는지 개발하는지 구분해야 하고").
 *
 * 지금 화면은 둘을 같은 얼굴로 보여 준다. 답을 기다리는 몇 초와, 뒤에서 몇 분째 코드를 쓰는 것이
 * 똑같이 생겼다 — 그래서 사장님이 "이거 진행하는지 모르겠어" 라고 하신 적이 있고(177회차),
 * 그때는 막대 하나를 붙였다. 막대는 **어디까지 왔나**를 말할 뿐 **지금 무엇을 하는 중인가**를 안 말한다.
 *
 * ## 세 가지로 가른다
 *  - **조용함**: 아무 일도 안 돈다. 장식 없음(08-31 사장님 지시: 할 일 없는데 서 있으면 장식이다).
 *  - **대화 중**: 답을 기다린다. 몇 초짜리라 띠 하나로 족하다.
 *  - **일하는 중**: 업무가 돈다. 몇 분~몇십 분이다. **화면 전체가 달라진다** —
 *    들어갈 때 빨간 애니메이션이 한 번 지나가고, 그 뒤로는 테두리에 빨간 기운이 남는다.
 *
 * ## 왜 빨강인가
 * 사장님이 정하셨다("누르면 전체화면이 빨간색 애니메이션"). 로키 기본색은 주황이라,
 * 빨강은 **평소에 안 쓰는 색**이다 — 그래서 켜지면 바로 눈에 든다. 색이 뜻을 가지려면 아껴야 한다.
 *
 * ## 한 번만 지나간다
 * 전환 애니메이션은 **일이 시작된 순간 한 번**이다. 돌 때마다 번쩍이면 몇 분짜리 일에서 몇 번을 보고,
 * 그러면 그 색은 다시 아무 뜻도 없어진다.
 */
import { useEffect, useRef, useState } from "react";

export type 모드 = "조용함" | "대화중" | "일하는중";

export function 모드계산(busy: boolean, 도는일수: number): 모드 {
  if (도는일수 > 0) return "일하는중";
  if (busy) return "대화중";
  return "조용함";
}

/** 일하는 중으로 **막 들어갔나**. 들어간 순간 한 번만 참이 된다. */
export function use방금들어감(모드: 모드): boolean {
  const 앞 = useRef<모드>("조용함");
  const [켜짐, set켜짐] = useState(false);
  useEffect(() => {
    if (모드 === "일하는중" && 앞.current !== "일하는중") {
      set켜짐(true);
      const t = setTimeout(() => set켜짐(false), 1100);
      앞.current = 모드;
      return () => clearTimeout(t);
    }
    앞.current = 모드;
  }, [모드]);
  return 켜짐;
}

/**
 * **전체화면 빨간 전환.** 일하는 중으로 들어갈 때 한 번 지나간다.
 * 글자는 안 넣는다 — 읽을 틈이 없고, 무엇을 하는지는 아래 띠가 계속 말한다.
 */
export function 전환({ 보임 }: { 보임: boolean }) {
  if (!보임) return null;
  return (
    <div aria-hidden className="rk-전환">
      <div className="rk-전환-쓸기" />
    </div>
  );
}

/** 지금 무엇을 하는 중인지 늘 보이는 띠. 일하는 중이면 빨강, 대화 중이면 수수하게. */
export function 모드띠({ 모드, 하는일, 몇분 }: { 모드: 모드; 하는일?: string | null; 몇분?: number | null }) {
  if (모드 === "조용함") return null;
  const 일인가 = 모드 === "일하는중";
  return (
    <div className={`rk-모드띠 ${일인가 ? "rk-일" : "rk-말"}`} role="status" aria-live="polite">
      <span className="rk-점" />
      <b>{일인가 ? "일하는 중" : "대화 중"}</b>
      {일인가 && 하는일 ? <span className="rk-하는일">{하는일}</span> : null}
      {일인가 && 몇분 != null ? <span className="rk-분">{몇분}분째</span> : null}
      {!일인가 ? <span className="rk-하는일">답을 쓰는 중이에요</span> : null}
    </div>
  );
}

/**
 * **로키가 앞에 나와 있다.** 두근도트처럼 얼굴이 먼저고 말이 그 아래다.
 * 그림은 아직 사장님 것이 아니라 **로키 마크**다 — 캐릭터 그림은 사장님이 정하실 몫이라
 * 내가 지어내지 않는다(09-28 지시). 자리와 움직임만 먼저 만들어 둔다.
 */
export function 로키얼굴({ 모드 }: { 모드: 모드 }) {
  return (
    <div className={`rk-얼굴칸 ${모드 === "일하는중" ? "rk-얼굴-일" : 모드 === "대화중" ? "rk-얼굴-말" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/rookery-mark-white.svg" alt="" className="rk-얼굴" />
      <span className="rk-숨" aria-hidden />
    </div>
  );
}
