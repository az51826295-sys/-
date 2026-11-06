"use client";

import { useState } from "react";
import type { HeartPack } from "@/lib/dot/money";

/**
 * 하트 묶음 단추들. **파는 길이 안 열렸으면 눌러도 "곧 열려요"** 로 끝난다
 * (11-06 사장님 "결제창까지 보이고 준비 중").
 *
 * 왜 단추를 꺼 두지 않고 눌리게 두나: 꺼진 단추만 셋이면 **고장으로 보인다.** 눌리되
 * 왜 안 되는지 말해 주는 쪽이 낫다. 다만 **값은 진짜 값**이라 열리는 날 그대로 팔린다.
 */
export default function PayClient({ packs, open }: { packs: HeartPack[]; open: boolean }) {
  const [말, set말] = useState<string | null>(null);

  function 사기(p: HeartPack) {
    if (!open) {
      set말("결제는 곧 열려요. 지금은 출석과 광고로 받아 주세요.");
      setTimeout(() => set말(null), 2600);
      return;
    }
    /* 파는 길이 열리는 날 여기에 Play Billing / 웹 결제 호출이 들어온다.
       충전은 끝까지 **서버가** 한다 — 화면이 하트를 더하면 안 된다. */
    window.location.href = `/api/dot/buy?pack=${encodeURIComponent(p.key)}`;
  }

  return (
    <>
      <style>{CSS}</style>
      {!open && <div className="py-soon">결제 준비 중이에요</div>}
      {packs.map((p) => (
        <button key={p.key} className="py-pack" onClick={() => 사기(p)}>
          <span className="py-pack-l">
            <span className="py-pack-n"><b>♥</b> 하트 {p.hearts}개</span>
            {p.note && <small>{p.note}</small>}
          </span>
          <span className="py-pack-p">{p.price}</span>
        </button>
      ))}
      {말 && <div className="py-toast">{말}</div>}
    </>
  );
}

/* 누르는 자리는 44px 위(WCAG 2.5.5). 묶음 줄은 두 줄짜리라 56px 로 둔다. */
const CSS = `
.py-soon { margin-bottom:8px; padding:8px 12px; background:#fff4e5; color:#8a5a00; border-radius:10px; font-size:12px; text-align:center; }
.py-pack { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; min-height:56px; margin-bottom:8px;
  padding:12px 14px; background:#fff; border:1px solid #e7eaee; border-radius:14px; font:inherit; color:#141414; text-align:left; cursor:pointer; }
.py-pack:active { background:#f2f4f7; }
.py-pack-l { display:flex; flex-direction:column; gap:2px; }
.py-pack-n { font-size:15px; font-weight:700; }
.py-pack-n b { color:#ff5c7a; }
.py-pack-l small { font-size:12px; color:#8a8f98; }
.py-pack-p { font-size:15px; font-weight:700; white-space:nowrap; }
.py-toast { position:fixed; left:50%; bottom:40px; transform:translateX(-50%); background:rgba(20,24,30,.92); color:#fff;
  padding:10px 16px; font-size:13px; border-radius:999px; box-shadow:0 6px 20px rgba(0,0,0,.25); z-index:50; }
`;
