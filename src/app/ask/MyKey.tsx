"use client";

import { useState } from "react";

/**
 * **내 연결 열쇠** — 메뉴 한 칸 (10-26).
 *
 * 사장님: "다른 사용자가 AI 연결하는 과정이 구현 되어 있어?" → 안 돼 있었다.
 * 열쇠는 회사별로 있었는데 **화면에 안 떴다.** 남이 자기 열쇠를 받을 길이 없으면
 * "누구나 붙을 수 있다" 는 말이 거짓이 된다. 이 칸이 그 길이다.
 *
 * 기본은 **가려 둔다.** 열쇠는 비밀이고, 화면 공유·녹화 중에 메뉴를 열 수 있다.
 * 누르면 보이고, 베끼기는 가리지 않고도 된다.
 */

export default function MyKey() {
  const [열쇠, 열쇠설정] = useState<string | null>(null);
  const [보임, 보임설정] = useState(false);
  const [말, 말설정] = useState<string | null>(null);
  const [미는중, 미는중설정] = useState(false);

  async function 받기() {
    미는중설정(true);
    말설정(null);
    try {
      const r = await fetch("/api/ask/mcp-key");
      const j = (await r.json()) as { ok?: boolean; key?: string; error?: string; 만든것?: boolean };
      if (!r.ok || !j.key) { 말설정(j.error ?? "못 받았어요"); return; }
      열쇠설정(j.key);
      if (j.만든것) 말설정("열쇠를 새로 만들었어요");
    } catch {
      /* 못 물어본 것은 "열쇠가 없다" 가 아니다 */
      말설정("못 물어봤어요 — 잠시 뒤에 다시요");
    } finally { 미는중설정(false); }
  }

  async function 베끼기(글: string) {
    try { await navigator.clipboard.writeText(글); 말설정("베꼈어요"); }
    catch { 말설정("베끼기가 막혀 있어요 — 눌러서 직접 골라 주세요"); }
  }

  const 줄 = "w-full px-3 py-2 text-left text-sm hover:bg-[var(--rk-100)]";
  const 밑말 = "block text-[11px] text-[var(--rk-400)]";
  const 명령 = 열쇠
    ? `claude mcp add --transport http rookery ${typeof window === "undefined" ? "" : window.location.origin}/api/mcp --header "Authorization: Bearer ${열쇠}"`
    : "";

  if (!열쇠) {
    return (
      <button type="button" className={줄} disabled={미는중} onClick={() => void 받기()}>
        내 연결 열쇠
        <span className={밑말}>
          {미는중 ? "받는 중…" : 말 ?? "클로드 코드·커서를 이 회사에 붙일 때 쓰는 열쇠예요"}
        </span>
      </button>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="text-sm">내 연결 열쇠</div>
      <div className="mt-1 flex items-center gap-1">
        <code className="min-w-0 flex-1 truncate rounded bg-[var(--rk-100)] px-1.5 py-1 font-mono text-[11px]">
          {보임 ? 열쇠 : 열쇠.slice(0, 6) + "·".repeat(14)}
        </code>
        <button type="button" onClick={() => 보임설정(!보임)}
          className="shrink-0 px-1.5 py-1 text-[11px] text-[var(--rk-400)] hover:text-[var(--rk-ink)]">
          {보임 ? "가리기" : "보기"}
        </button>
        <button type="button" onClick={() => void 베끼기(열쇠)}
          className="shrink-0 px-1.5 py-1 text-[11px] text-[var(--rk-400)] hover:text-[var(--rk-ink)]">
          베끼기
        </button>
      </div>

      {/* 열쇠만 줘도 어디에 넣는지 모른다 — 넣을 줄을 통째로 준다 */}
      <button type="button" onClick={() => void 베끼기(명령)}
        className="mt-1 w-full rounded border border-[var(--rk-300)] px-2 py-1 text-left text-[11px] hover:bg-[var(--rk-100)]">
        클로드 코드에 붙이는 줄 베끼기
        <span className={밑말}>터미널에 한 번 붙여 넣으면 끝이에요</span>
      </button>

      {말 && <div className="mt-1 text-[11px] text-[var(--rk-400)]">{말}</div>}
      <div className="mt-1 text-[11px] text-[var(--rk-400)]">
        남에게 주지 마세요 — 이 열쇠로 이 회사 일을 재고 맡길 수 있어요
      </div>
    </div>
  );
}
