"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AD_REFILL_TURNS } from "@/lib/dot/money";

/**
 * **하트 수 표시 + 누르면 하트 늘리는 자리** (11-06).
 *
 * 세 번에 걸쳐 여기까지 왔다(사장님 말 그대로 적어 둔다):
 *   ① *"유아이에 하트 수 표시"* — 방 밖에서는 하트가 안 보였다. 머리에 달았다.
 *   ② *"총 겟수를 보여주고 출석체크는 매일 처음 들어갈때 자동으로"* — 이 자리는 **숫자만**,
 *      받는 일은 하루 첫 입장 판(`CheckInPopup`)이 한다.
 *   ③ *"하트 누르면 광고보기, 하트 결제창으로 넘어가자"* — 숫자를 **누를 수 있게** 하고,
 *      그 안에 하트를 늘리는 길 둘(광고·사기)을 둔다.
 *
 * 광고 스위치가 꺼져 있으면 광고 줄을 **안 그린다** — 누르면 503 이 오는 단추는 두지 않는다.
 * 결제는 아직 받을 길이 없어 `/dot/pay` 가 "준비 중" 으로 답한다(사장님이 그렇게 정하셨다).
 */
export default function HeartBadge({ hearts: hearts0, adOpen, adLeft: adLeft0 }: {
  hearts: number; adOpen: boolean; adLeft: number;
}) {
  const router = useRouter();
  const [열림, set열림] = useState(false);
  const [hearts, setHearts] = useState(hearts0);
  const [adLeft, setAdLeft] = useState(adLeft0);
  const [busy, setBusy] = useState(false);
  const [말, set말] = useState<string | null>(null);

  async function 광고보기() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dot/ad", { method: "POST" });
      const data = await res.json().catch(() => ({})) as { balance?: { remaining: number; adLeft: number }; error?: string };
      if (!res.ok) { set말(data.error ?? "광고를 불러오지 못했어요"); return; }
      /* 서버가 센 잔고로 갈아 끼운다 — 화면에서 더하면 두 번 눌렀을 때 어긋난다. */
      if (data.balance) { setHearts(data.balance.remaining); setAdLeft(data.balance.adLeft); }
      set말(`하트 ${AD_REFILL_TURNS}개가 찼어요`);
      router.refresh();
    } catch {
      set말("광고를 불러오지 못했어요");
    } finally {
      setBusy(false);
      setTimeout(() => set말(null), 2200);
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <button className="hb" onClick={() => set열림(true)} aria-label={`남은 하트 ${hearts}개 · 하트 늘리기`}>
        <b>♥</b>{hearts}
      </button>

      {열림 && (
        <div className="hb-back" onClick={() => set열림(false)} role="dialog" aria-label="하트">
          <div className="hb-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="hb-now"><b>♥</b> 지금 하트 {hearts}개</div>

            {adOpen && adLeft > 0 && (
              <button className="hb-row" onClick={광고보기} disabled={busy}>
                <span className="hb-row-t">{busy ? "광고를 불러오는 중…" : `광고 보고 하트 +${AD_REFILL_TURNS}`}</span>
                <span className="hb-row-s">오늘 {adLeft}번 남음</span>
              </button>
            )}

            <a className="hb-row" href="/dot/pay">
              <span className="hb-row-t">하트 사기</span>
              <span className="hb-row-s">묶음으로 사면 기다리지 않아요</span>
            </a>

            <button className="hb-close" onClick={() => set열림(false)}>닫기</button>
          </div>
        </div>
      )}
      {말 && <div className="hb-toast">{말}</div>}
    </>
  );
}

/* 누르는 자리는 44px(WCAG 2.5.5) — 화면 점검이 재는 자리다. */
const CSS = `
.hb { margin-left:auto; display:inline-flex; align-items:center; gap:4px; min-height:44px; padding:0 6px; border:none; background:none;
  font:inherit; font-size:14px; font-weight:700; color:#ff5c7a; white-space:nowrap; cursor:pointer; }
.hb b { font-weight:700; }
.hb-back { position:fixed; inset:0; background:rgba(10,14,20,.5); display:flex; align-items:flex-end; justify-content:center; z-index:40; }
/* 아래 탭(.dt-tabs)이 화면 바닥에 붙어 있어서, 시트 바닥을 그대로 두면 **닫기 단추가 탭에 깔린다**
   (11-06 화면 점검이 '탭에 가림 1 (닫기)' 로 잡았다). 탭 높이만큼 올려 둔다. */
.hb-sheet { width:100%; max-width:430px; background:#fff; border-radius:18px 18px 0 0;
  padding:18px 16px calc(76px + env(safe-area-inset-bottom)); }
.hb-now { font-size:15px; font-weight:700; color:#141414; margin-bottom:12px; text-align:center; }
.hb-now b { color:#ff5c7a; }
.hb-row { display:flex; flex-direction:column; align-items:flex-start; gap:2px; width:100%; min-height:56px; margin-bottom:8px;
  padding:10px 14px; background:#f5f7fa; border:none; border-radius:14px; font:inherit; color:#141414; text-align:left;
  text-decoration:none; cursor:pointer; justify-content:center; }
.hb-row:active { background:#eaeef3; }
.hb-row:disabled { opacity:.6; cursor:default; }
.hb-row-t { font-size:15px; font-weight:700; }
.hb-row-s { font-size:12px; color:#8a8f98; }
.hb-close { display:block; width:100%; min-height:44px; background:none; border:none; font:inherit; font-size:13px; color:#8a8f98; cursor:pointer; }
.hb-toast { position:fixed; left:50%; bottom:84px; transform:translateX(-50%); background:rgba(20,24,30,.92); color:#fff;
  padding:10px 16px; font-size:13px; border-radius:999px; box-shadow:0 6px 20px rgba(0,0,0,.25); z-index:50; }
`;
