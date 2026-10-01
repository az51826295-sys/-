"use client";
/**
 * **한 판을 이끄는 곳** (228회차 10-01).
 *
 * 사장님 기획의 흐름: **① 현장 조사 → ② 취조 → ③ 지목.**
 * 여기서 ①→② 를 잇는다. 찾은 증거만 취조실로 들고 간다 — 못 찾은 것은 들이댈 수 없다.
 *
 * **저장**: 한 판이 길어서 새로고침하면 처음부터였다. 브라우저에 담아 두고 다시 열면 이어 한다.
 * 담는 것은 **플레이어가 이미 본 것**뿐이다(찾은 증거·대화·수치) — 답은 애초에 화면에 없다.
 */
import { useEffect, useState } from "react";
import 현장, { type 보일지점, type 장소, type 현장상태 } from "./현장";
import 취조실 from "./취조실";

type 증거 = { id: string; 이름: string; 설명: string };
type 용의자 = { id: string; 이름: string; 관계: string; 겉모습: string; 얼굴: string };
type 확인 = { id: string; 주장: string; 물을사람: string; 얻는증거id: string };

const 담는곳 = "거짓말의온도-판-v1";
type 담은것 = { 단계: "현장" | "취조"; 현장상태: 현장상태; 찾은: 증거[] };

export default function 판({ 사건, 용의자들, 증거들, 확인할것, 곳들, 첫지점, 첫상태 }: {
  사건: { 제목: string; 피해자: string; 발생시각: string; 장소: string };
  용의자들: 용의자[]; 증거들: 증거[]; 확인할것: 확인[];
  곳들: 장소[]; 첫지점: 보일지점[]; 첫상태: 현장상태;
}) {
  const [단계, set단계] = useState<"현장" | "취조" | "불러오는중">("불러오는중");
  const [찾은, set찾은] = useState<증거[]>([]);
  const [현장쪽, set현장쪽] = useState<현장상태>(첫상태);

  // 담아 둔 판이 있으면 이어 한다. 없으면 현장부터.
  useEffect(() => {
    try {
      const 글 = localStorage.getItem(담는곳);
      if (글) {
        const d = JSON.parse(글) as 담은것;
        if (d.단계 === "취조" && Array.isArray(d.찾은)) {
          set찾은(d.찾은); set현장쪽(d.현장상태); set단계("취조"); return;
        }
        if (d.현장상태) set현장쪽(d.현장상태);
      }
    } catch { /* 담아 둔 게 깨졌으면 그냥 처음부터 */ }
    set단계("현장");
  }, []);

  function 들어가기(s: 현장상태, 찾은것: 증거[]) {
    set현장쪽(s); set찾은(찾은것); set단계("취조");
    try { localStorage.setItem(담는곳, JSON.stringify({ 단계: "취조", 현장상태: s, 찾은: 찾은것 } satisfies 담은것)); } catch { /* 꽉 찼거나 막혔으면 그냥 이어 한다 */ }
  }

  function 처음부터() {
    try { localStorage.removeItem(담는곳); } catch { /* 막혀 있어도 화면은 되돌린다 */ }
    set찾은([]); set현장쪽(첫상태); set단계("현장");
  }

  if (단계 === "불러오는중") return null;
  if (단계 === "현장") {
    return <현장 사건={사건} 곳들={곳들} 첫지점={첫지점} 첫상태={현장쪽} 들어가기={들어가기} />;
  }
  // **찾은 증거만** 취조실로. 못 찾은 것은 목록에 없으니 들이댈 수 없다.
  const 손에든것 = 증거들.filter((e) => 현장쪽.가진증거.includes(e.id));
  return (
    <취조실 사건={사건} 용의자들={용의자들} 증거들={손에든것} 확인할것={확인할것}
      현장으로={처음부터} 찾은수={현장쪽.가진증거.length} 모든증거수={증거들.length} />
  );
}
