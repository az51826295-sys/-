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

  const [사는중, set사는중] = useState<string | null>(null);

  /**
   * 11-12: 여기는 `window.location.href = "/api/dot/buy?pack=…"` 이었다 — **GET 으로
   * 길에 보내는** 코드였는데 그 길은 아예 없었다(404). 이제 앱 결제로 토큰을 받아
   * **POST** 로 내민다. 하트를 더하는 것은 끝까지 서버다.
   */
  async function 사기(p: HeartPack) {
    if (!open) {
      알림("결제는 곧 열려요. 지금은 출석과 광고로 받아 주세요.");
      return;
    }
    if (사는중) return;
    set사는중(p.key);
    try {
      const { 앱에서사기 } = await import("@/lib/dot/playClient");
      let 받은 = 0;
      const r = await 앱에서사기(p.key, async (purchaseToken) => {
        const res = await fetch("/api/dot/buy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pack: p.key, token: purchaseToken }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; hearts?: number; error?: string };
        if (!res.ok || !j.ok) { 알림(j.error ?? "충전을 못 했어요."); return false; }
        받은 = j.hearts ?? p.hearts;
        return true;
      });
      if (r.ok) {
        알림(`하트 ${받은}개 들어왔어요.`);
        /* 잔고는 서버가 그린다 — 화면이 세지 않고 다시 받아 온다. */
        setTimeout(() => window.location.reload(), 1200);
      } else if (r.까닭 === "앱아님") {
        알림("지금은 앱에서만 살 수 있어요.");
      } else if (r.까닭 === "상품없음") {
        알림("묶음이 아직 준비 중이에요.");
      } else if (r.까닭 === "실패") {
        알림("결제가 안 됐어요. 돈은 빠지지 않아요.");
      }
      /* "취소" 는 사람이 닫은 것이다 — 아무 말도 하지 않는다. */
    } finally {
      set사는중(null);
    }
  }

  function 알림(s: string) {
    set말(s);
    setTimeout(() => set말(null), 2600);
  }

  return (
    <>
      <style>{CSS}</style>
      {!open && <div className="py-soon">결제 준비 중이에요</div>}
      {packs.map((p) => (
        <button key={p.key} className="py-pack" onClick={() => 사기(p)} disabled={사는중 !== null} aria-busy={사는중 === p.key}>
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
