"use client";

import { useEffect, useState } from "react";
import { canUseFolder, folderName } from "@/lib/hand/folder";

/**
 * **무엇이 붙어 있나** — 메뉴 맨 위 한 칸 (10-26). 사장님: "연결된거 유아이로 표시해야해."
 *
 * ## 열린 것과 붙은 것을 섞지 않는다
 *
 * "연결됨" 하나로 그리면 사장님이 붙은 줄 알고 기다린다. 그래서 네 값으로 그린다:
 *   **붙음** (실제로 썼다) · **열림** (쓸 수 있는데 아직 안 왔다) · **닫힘** · **모름**
 *
 * **모름을 닫힘으로 그리지 않는다.** 마지막으로 붙은 때는 서버 한 대의 기억이라
 * 배포하면 지워진다 — 비어 있는 것이 "안 붙음" 을 뜻하지 않는다.
 *
 * 폴더는 **브라우저만 안다**(핸들이 이 기기에 있다). 그래서 서버에 안 묻고 여기서 본다.
 */

type 서버줄 = {
  id: string; 이름: string; 열림: boolean | null;
  마지막붙은때: string | null; 마지막한것: string | null; 말: string;
};

type 칸 = { 이름: string; 상태: "붙음" | "열림" | "닫힘" | "모름"; 말: string };

const 색 = {
  붙음: "bg-[var(--rk-accent)]",
  열림: "bg-[var(--rk-400)]",
  닫힘: "bg-[var(--rk-300)]",
  모름: "bg-transparent border border-[var(--rk-400)]",
} as const;

/** 얼마 전인지 — "3분 전" 이 ISO 보다 읽힌다. */
function 언제(iso: string): string {
  const 초 = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (초 < 60) return "방금";
  if (초 < 3600) return `${Math.floor(초 / 60)}분 전`;
  if (초 < 86400) return `${Math.floor(초 / 3600)}시간 전`;
  return `${Math.floor(초 / 86400)}일 전`;
}

export default function ConnectionStatus() {
  const [칸들, 칸들설정] = useState<칸[] | null>(null);

  useEffect(() => {
    let 살아있나 = true;

    void (async () => {
      /* ① 폴더 — 이 기기의 사실. 서버는 모른다. */
      const 폴더칸: 칸 = !canUseFolder()
        ? { 이름: "폴더", 상태: "닫힘", 말: "이 브라우저에서는 안 돼요 (컴퓨터 크롬·엣지에서 돼요)" }
        : await (async () => {
            const n = await folderName().catch(() => null);
            return n
              ? { 이름: "폴더", 상태: "붙음" as const, 말: `${n} — 어떤 AI로 만들었든 여기 떨구면 재요` }
              : { 이름: "폴더", 상태: "열림" as const, 말: "폴더를 고르면 붙어요" };
          })();

      /* ② 서버가 아는 둘 */
      let 서버칸: 칸[] = [{ 이름: "클로드 코드·커서 (MCP)", 상태: "모름", 말: "확인을 못 했어요" }];
      try {
        const r = await fetch("/api/ask/connections");
        const j = (await r.json()) as { ok?: boolean; 연결?: 서버줄[] };
        if (j.ok && j.연결) {
          서버칸 = j.연결.map((s) => ({
            이름: s.이름,
            /* 붙은 기록이 있으면 '붙음'. 없으면 열림/닫힘/모름 — **모름을 닫힘으로 적지 않는다.** */
            상태: s.마지막붙은때 ? "붙음" : s.열림 === true ? "열림" : s.열림 === false ? "닫힘" : "모름",
            말: s.마지막붙은때
              ? `${언제(s.마지막붙은때)} · ${s.마지막한것 ?? s.말}`
              : s.말,
          }));
        }
      } catch {
        /* 못 물어본 것은 닫힌 것이 아니다 — 위 기본값('모름') 그대로 둔다 */
      }

      if (살아있나) 칸들설정([폴더칸, ...서버칸]);
    })();

    return () => { 살아있나 = false; };
  }, []);

  if (!칸들) return null;

  return (
    <div className="border-b border-[var(--rk-200)] px-3 py-2">
      <div className="mb-1 text-[11px] font-medium text-[var(--rk-600)]">붙어 있는 것</div>
      {칸들.map((c) => (
        <div key={c.이름} className="flex items-start gap-2 py-[3px]">
          <span className={`mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full ${색[c.상태]}`} />
          <span className="min-w-0 text-[12px] leading-tight">
            {c.이름}
            {/* 붙음과 열림을 글자로도 가른다 — 색만으로 가르면 못 보는 사람이 생긴다 */}
            <span className="ml-1 text-[var(--rk-400)]">{c.상태}</span>
            <span className="block truncate text-[11px] text-[var(--rk-400)]">{c.말}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
