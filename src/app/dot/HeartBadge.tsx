"use client";

import { useState } from "react";
import { CHECKIN_HEARTS } from "@/lib/dot/bond";

/**
 * **하트 수 표시** (11-06 사장님 "유아이에 하트 수 표시").
 *
 * 방 안에서는 입력칸 아래에 늘 보이는데, **방 밖에서는 안 보였다** — 피드·채팅목록·검색·내 창에서
 * 내 하트가 몇 개인지 알 길이 없었다. 하트가 쓰는 값이 된 날부터 그건 "지갑을 안 보여 주는" 것이다.
 *
 * 09-28 에 사장님이 *"오늘 남은 대화는 표시하지말고"* 라 하셔서 뺀 자리이기도 하다.
 * 그때와 **조건이 다르다**: 그때는 아침마다 저절로 차는 수라 미터기였고, 지금은 **받아야 생기는 값**이라
 * 안 보이면 받을 수가 없다. 새 지시가 이긴다.
 *
 * 출석 전에는 **그 자리가 받는 단추**다 — 안 그러면 하트를 받으러 방까지 들어가야 한다.
 */
export default function HeartBadge({ hearts0, checkedIn0 }: { hearts0: number; checkedIn0: boolean }) {
  const [hearts, setHearts] = useState(hearts0);
  const [checked, setChecked] = useState(checkedIn0);
  const [busy, setBusy] = useState(false);
  const [말, set말] = useState<string | null>(null);

  async function 받기() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dot/checkin", { method: "POST" });
      const data = await res.json().catch(() => ({})) as { balance?: { remaining: number; 출석함: boolean }; error?: string };
      if (!res.ok) { set말(data.error ?? "출석을 못 했어요"); setChecked(true); return; }
      /* 서버가 센 잔고로 갈아 끼운다 — 화면에서 +5 를 더하면 두 번 눌렀을 때 어긋난다. */
      if (data.balance) { setHearts(data.balance.remaining); setChecked(data.balance.출석함); }
      set말(`하트 ${CHECKIN_HEARTS}개를 받았어요`);
    } catch {
      set말("출석을 못 했어요");
    } finally {
      setBusy(false);
      setTimeout(() => set말(null), 2200);
    }
  }

  return (
    <>
      <style>{CSS}</style>
      {checked ? (
        <span className="hb" aria-label={`남은 하트 ${hearts}개`}><b>♥</b>{hearts}</span>
      ) : (
        <button className="hb hb-get" onClick={받기} disabled={busy} aria-label={`출석하고 하트 ${CHECKIN_HEARTS}개 받기`}>
          {busy ? "받는 중…" : `출석 ♥+${CHECKIN_HEARTS}`}
        </button>
      )}
      {말 && <div className="hb-toast">{말}</div>}
    </>
  );
}

/* 44px(WCAG 2.5.5) — 받는 단추는 화면 점검이 재는 자리다. 글자만 있는 쪽은 누르는 자리가 아니라 상관없다. */
const CSS = `
.hb { margin-left:auto; display:inline-flex; align-items:center; gap:4px; font-size:14px; font-weight:700; color:#ff5c7a; white-space:nowrap; }
.hb b { font-weight:700; }
.hb-get { min-height:44px; padding:0 12px; border:1px solid #ffd3dc; border-radius:999px; background:#fff0f3; font:inherit; font-size:13px; font-weight:700; color:#ff5c7a; cursor:pointer; }
.hb-get:disabled { opacity:.6; cursor:default; }
.hb-toast { position:fixed; left:50%; bottom:84px; transform:translateX(-50%); background:rgba(20,24,30,.92); color:#fff;
  padding:10px 16px; font-size:13px; border-radius:999px; box-shadow:0 6px 20px rgba(0,0,0,.25); z-index:30; }
`;
