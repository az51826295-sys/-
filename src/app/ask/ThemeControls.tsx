"use client";

import { useEffect, useState } from "react";
import { applyTheme, getTheme, resetTheme, setTheme, DEFAULT_THEME, type 꾸밈 } from "@/lib/ui/theme";

/**
 * **화면 꾸미기** — 점 세 개 메뉴 안에 들어가는 조각 (10-25).
 *
 * 사장님이 "지피티 같다" 고 하셔서 만든 것인데, **내가 새 모양을 들이밀지 않는다.**
 * `globals.css` 가 세운 토큰(바탕·글자·명도 다섯 단계)을 그대로 두고 **값만** 돌린다.
 * 그래서 아무것도 안 건드리면 지금 화면과 **똑같다.**
 */
export default function ThemeControls() {
  const [t, t설정] = useState<꾸밈>(DEFAULT_THEME);
  useEffect(() => { t설정(getTheme()); applyTheme(); }, []);
  const 바꾸기 = (x: Partial<꾸밈>) => t설정(setTheme(x));

  const 줄 = "w-full px-3 py-2 text-left text-sm hover:bg-[var(--rk-100)]";
  const 밑말 = "block text-[11px] text-[var(--rk-400)]";

  return (
    <>
      <div className="px-3 pt-2 text-[11px] text-[var(--rk-400)]">화면 꾸미기</div>

      <label className={줄.replace("hover:bg-[var(--rk-100)]", "")}>
        <span className="flex items-center justify-between gap-2">
          바탕색
          <input type="color" value={t.paper} onChange={(e) => 바꾸기({ paper: e.target.value })}
            className="h-6 w-10 cursor-pointer bg-transparent" aria-label="바탕색" />
        </span>
        <span className={밑말}>명도 다섯 단계는 바탕과 글자 사이에서 저절로 잡혀요</span>
      </label>

      <label className={줄.replace("hover:bg-[var(--rk-100)]", "")}>
        <span className="flex items-center justify-between gap-2">
          글자색
          <input type="color" value={t.ink} onChange={(e) => 바꾸기({ ink: e.target.value })}
            className="h-6 w-10 cursor-pointer bg-transparent" aria-label="글자색" />
        </span>
      </label>

      <label className={줄.replace("hover:bg-[var(--rk-100)]", "")}>
        <span className="flex items-center justify-between gap-2">
          일할 때 색
          <input type="color" value={t.accent} onChange={(e) => 바꾸기({ accent: e.target.value })}
            className="h-6 w-10 cursor-pointer bg-transparent" aria-label="일할 때 색" />
        </span>
        <span className={밑말}>직원이 일하는 중일 때 띠에 도는 색이에요</span>
      </label>

      <button type="button" className={줄} onClick={() => 바꾸기({ pixel: !t.pixel })}>
        글꼴 — {t.pixel ? "픽셀" : "보통"}
        <span className={밑말}>{t.pixel ? "눌러서 읽기 쉬운 글꼴로 바꿔요" : "눌러서 픽셀 글꼴로 돌아가요"}</span>
      </button>

      <label className={줄.replace("hover:bg-[var(--rk-100)]", "")}>
        글자 크기 <span className="text-[var(--rk-400)]">{Math.round(t.size * 100)}%</span>
        <input type="range" min={0.85} max={1.4} step={0.05} value={t.size}
          onChange={(e) => 바꾸기({ size: Number(e.target.value) })} className="mt-1 w-full" />
      </label>

      <label className={줄.replace("hover:bg-[var(--rk-100)]", "")}>
        빽빽함 <span className="text-[var(--rk-400)]">{Math.round(t.density * 100)}%</span>
        <input type="range" min={0.7} max={1.3} step={0.05} value={t.density}
          onChange={(e) => 바꾸기({ density: Number(e.target.value) })} className="mt-1 w-full" />
        <span className={밑말}>작을수록 촘촘해요</span>
      </label>

      <button type="button" className={줄} onClick={() => t설정(resetTheme())}>
        처음으로 되돌리기
        <span className={밑말}>아무것도 안 건드린 상태로</span>
      </button>
    </>
  );
}
