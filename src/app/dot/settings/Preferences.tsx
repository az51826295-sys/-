"use client";

import { useEffect, useState } from "react";
import { feelOff, SFX, buzz, BUZZ, setFeelOff } from "@/lib/dot/feel";
import { getLang, setLang, t, type Lang } from "@/lib/dot/lang";

/**
 * **언어와 손맛 스위치** — 설정 안 두 줄 (10-28 사장님 기획 4·5번).
 *
 * 로그인 없이 쓰는 앱이라 **이 기기에 남긴다.** 계정에 묶으면 로그인 안 한 사람은
 * 고를 수도 없다.
 *
 * 언어를 바꾸면 **화면을 다시 띄운다.** 서버가 그린 글이 섞여 있어서 그 자리에서
 * 바꾸면 반만 바뀐 화면이 된다 — 반만 바뀌는 게 제일 나쁘다.
 */
export default function Preferences() {
  const [lang, setLangState] = useState<Lang>("ko");
  const [off, setOff] = useState(false);
  const [준비, 준비설정] = useState(false);

  useEffect(() => {
    setLangState(getLang());
    setOff(feelOff());
    준비설정(true);
  }, []);

  /* 서버가 그린 첫 판과 글자가 달라지면 깜빡인다 — 읽고 나서 그린다 */
  if (!준비) return null;

  function 언어바꾸기(l: Lang) {
    if (l === lang) return;
    setLang(l);
    SFX.tap();
    buzz(BUZZ.tap);
    window.location.reload();
  }

  function 손맛바꾸기() {
    const 다음 = !off;
    setFeelOff(다음);
    setOff(다음);
    /* 켜는 쪽일 때만 들려 준다 — 끄면서 소리가 나면 안 꺼진 줄 안다 */
    if (!다음) { SFX.tap(); buzz(BUZZ.tap); }
  }

  return (
    <>
      <div className="st-row">
        <span>🌐 {t("lang_label", lang)}</span>
        <div className="pf-pick">
          <button type="button" className={`pf-btn${lang === "ko" ? " on" : ""}`} onClick={() => 언어바꾸기("ko")}>한국어</button>
          <button type="button" className={`pf-btn${lang === "en" ? " on" : ""}`} onClick={() => 언어바꾸기("en")}>English</button>
        </div>
      </div>

      <button type="button" className="st-row" onClick={손맛바꾸기}>
        <span>{off ? "🔇" : "🔊"} {t("feel_label", lang)}</span>
        <small>{off ? t("feel_off", lang) : t("feel_on", lang)}</small>
      </button>

      <style>{`
        .pf-pick{display:flex;gap:8px;margin-top:6px}
        .pf-btn{flex:1;background:#eef1f5;border:2px solid transparent;border-radius:10px;padding:8px;
          font-size:13px;font-family:inherit;color:#5c6570;cursor:pointer}
        .pf-btn.on{background:#fff;border-color:#111;color:#111}
      `}</style>
    </>
  );
}
