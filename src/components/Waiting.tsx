"use client";

import { useEffect, useState } from "react";

/**
 * 기다리는 동안 **살아 있다고 말하는 자리.**
 *
 * 2026-09-03 사장님: "애니 같은 걸 만들어서… 글자에 진행되는 느낌, 생각하는 중
 * 같은 거." 배포된 것을 재 보니 서버는 안 느렸다(첫 바이트 309ms, 전체 1.8초).
 * **느린 것과 느리게 느껴지는 것은 다르다** — 기다리는 동안 화면이 죽어 있으면
 * 2초도 길다.
 *
 * 대화창은 점 세 개(`…`)만 있었다. 그건 멈춘 것과 도는 것을 구분해 주지 않는다.
 *
 * ## 가짜 진행률은 안 만든다
 *
 * 퍼센트 막대나 "곧 끝납니다" 는 **재지 않은 것을 그리는 것**이다. 이 저장소가
 * 계속 경계하는 자리이고, 화면에서 그 짓을 하면 사람이 그 숫자를 믿는다.
 *
 * 여기서 보여 주는 것은 셋 다 **진짜**다:
 * - 지금 무엇을 하는 중인가 (서버가 말해 줄 때만. 없으면 "생각하는 중")
 * - 몇 초 지났는가 (시계를 읽은 값)
 * - 아직 살아 있는가 (점이 도는 것)
 *
 * 점이 도는 것만이 장식인데, 그것도 "아직 안 죽었다" 는 참인 말을 한다.
 */

/** 오래 걸린다고 말하기 시작하는 시점. 이보다 짧으면 아무 말도 안 한다. */
const LONG_SECONDS = 15;

export function Waiting({
  /** 서버가 알려 준 지금 단계. 없으면 "생각하는 중". */
  stage,
  className = "",
}: {
  stage?: string | null;
  className?: string;
}) {
  const [seconds, setSeconds] = useState(0);
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const started = Date.now();
    const clock = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      500,
    );
    // 점은 초와 따로 돈다. 초에 맞추면 1초에 한 번만 움직여서 멈춘 것처럼 보인다.
    const spin = setInterval(() => setDots((d) => (d % 3) + 1), 400);
    return () => {
      clearInterval(clock);
      clearInterval(spin);
    };
  }, []);

  return (
    <p className={"text-sm leading-relaxed " + className}>
      <span>{stage?.trim() || "생각하는 중"}</span>
      {/* 자리를 세 칸으로 잡아 둔다. 점이 늘었다 줄 때 뒤 글자가 흔들리면
          그것 자체가 조급해 보인다. */}
      <span className="inline-block w-[1.6em] text-left">
        {".".repeat(dots)}
      </span>
      {/* 1초 전에는 안 적는다. 0초가 잠깐 보였다 사라지면 깜빡임이 된다. */}
      {seconds >= 1 && (
        <span className="tabular-nums opacity-60">{seconds}초</span>
      )}
      {seconds >= LONG_SECONDS && (
        <span className="opacity-60">
          {" · 오래 걸리고 있습니다"}
        </span>
      )}
    </p>
  );
}
