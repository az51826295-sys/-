"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHECKIN_HEARTS } from "@/lib/dot/bond";

/**
 * **하루 첫 입장에 저절로 뜨는 출석체크** (11-06 사장님 "출석체크는 매일 처음 들어갈 때 자동으로 나오게 해").
 *
 * 앞서는 머리의 하트 칸이 출석 전에 단추로 바뀌었는데, 사장님이 *"총 개수를 보여주고"* 라 하셔서
 * 그 자리는 **숫자만** 남겼다. 받는 일은 이 판이 한다.
 *
 * 닫으면 **이 창(세션) 동안만** 안 뜬다(`sessionStorage`). 날짜로 막지 않는 까닭:
 * 닫았다는 이유로 그날 하트를 못 받게 되면 **말을 아예 못 거는 사람**이 생긴다.
 * 앱을 다시 열면 또 뜨고, 방 안의 하트 0 카드에도 받는 단추가 그대로 있다 — 길이 셋이다.
 *
 * 저장은 서버가 하고(`/api/dot/checkin`), 화면은 `router.refresh()` 로 **서버가 센 값**을 다시 받는다 —
 * 머리의 숫자는 서버 조각이라 그래야 같이 바뀐다.
 */
export default function CheckInPopup({ name }: { name: string | null }) {
  const router = useRouter();
  const 키 = "dot-checkin-skip";
  const [열림, set열림] = useState(() => {
    try { return sessionStorage.getItem(키) !== "1"; } catch { return true; }
  });
  const [busy, setBusy] = useState(false);
  const [틀림, set틀림] = useState<string | null>(null);

  function 닫기() {
    try { sessionStorage.setItem(키, "1"); } catch { /* 사생활 보호 창에서는 못 적는다 — 그래도 닫힌다 */ }
    set열림(false);
  }

  async function 받기() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dot/checkin", { method: "POST" });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { set틀림(data.error ?? "출석을 못 했어요"); return; }
      닫기();
      router.refresh();
    } catch {
      set틀림("출석을 못 했어요");
    } finally {
      setBusy(false);
    }
  }

  if (!열림) return null;
  return (
    <>
      <style>{CSS}</style>
      <div className="ci-back" onClick={닫기} role="dialog" aria-label="출석체크">
        <div className="ci-card" onClick={(e) => e.stopPropagation()}>
          <div className="ci-heart">♥</div>
          <div className="ci-title">오늘의 하트</div>
          <div className="ci-body">
            {name ? `${name}가 기다렸어요.` : "오늘도 왔네요."}<br />
            출석하면 하트 {CHECKIN_HEARTS}개를 받아요.
          </div>
          <button className="ci-go" onClick={받기} disabled={busy}>
            {busy ? "받는 중…" : `하트 ${CHECKIN_HEARTS}개 받기`}
          </button>
          {틀림 && <div className="ci-err">{틀림}</div>}
          <button className="ci-later" onClick={닫기}>나중에</button>
        </div>
      </div>
    </>
  );
}

/* 누르는 자리는 44px(WCAG 2.5.5) — 화면 점검이 재는 자리다. */
const CSS = `
.ci-back { position:fixed; inset:0; background:rgba(10,14,20,.5); display:flex; align-items:center; justify-content:center; z-index:40; padding:24px; }
.ci-card { width:100%; max-width:320px; background:#fff; border-radius:18px; padding:22px 20px 16px; text-align:center;
  box-shadow:0 12px 40px rgba(0,0,0,.28); }
.ci-heart { font-size:34px; color:#ff5c7a; line-height:1; margin-bottom:8px; }
.ci-title { font-size:18px; font-weight:800; color:#141414; margin-bottom:6px; }
.ci-body { font-size:13px; color:#5c6570; line-height:1.6; margin-bottom:16px; }
.ci-go { display:block; width:100%; min-height:44px; background:#ff5c7a; color:#fff; border:none; border-radius:12px;
  font:inherit; font-size:14px; font-weight:700; cursor:pointer; }
.ci-go:disabled { opacity:.6; cursor:default; }
.ci-err { margin-top:8px; font-size:12px; color:#c0392b; }
.ci-later { display:block; width:100%; min-height:44px; margin-top:4px; background:none; border:none; font:inherit;
  font-size:13px; color:#8a8f98; cursor:pointer; }
`;
