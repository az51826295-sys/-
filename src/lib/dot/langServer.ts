import { cookies } from "next/headers";
import type { Lang } from "./lang";

/**
 * **서버가 그리는 화면의 언어** (10-28).
 *
 * 두근도트 화면은 대부분 서버가 그린다. 그래서 언어가 `localStorage` 에만 있으면
 * 영어를 골라도 서버가 그린 글은 전부 한국어로 남는다 — 실측 77% 였다.
 * 쿠키는 서버가 읽을 수 있는 유일한 자리라 `setLang` 이 거기에도 적는다.
 *
 * **모르면 한국어다.** 영어를 기본으로 두면 쿠키가 아직 없는 기존 사용자가
 * 어느 날 영어 화면을 보게 된다 — 바뀐 적 없는 것이 바뀌어 보이는 게 제일 나쁘다.
 */
export async function langFromCookie(): Promise<Lang> {
  try {
    const v = (await cookies()).get("dot_lang")?.value;
    return v === "en" ? "en" : "ko";
  } catch {
    /* 쿠키를 못 읽는 자리(정적으로 그릴 때)도 한국어다. */
    return "ko";
  }
}
