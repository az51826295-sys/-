"use client";
// i18n-ids: 로키 좁은창 작은창 창 작게 창단추 막힘
import { useT } from "@/lib/i18n/client";
import { ROOKERY } from "@/lib/i18n/dict/rookery";
/**
 * **문자 띄워놓고 하듯** (228회차 10-02, 사장님 "컴퓨터에서 쓰는거니까 문자를 뛰어놓고 하는거랑 비슷해").
 *
 * 지금 `/ask` 는 넓은 화면을 통째로 쓴다. 그런데 사장님이 쓰시는 모양은 **한쪽에 켜 두고
 * 다른 일을 하다가 말을 거는 것**이다 — 메신저 창처럼. 넓은 창은 "들어가서 쓰는 곳" 이고
 * 좁은 창은 "켜 두는 곳" 이다. 같은 화면이 두 노릇을 하려면 **모양이 달라져야** 한다.
 *
 * ## 두 가지를 준다
 *  - **좁게**: 이 탭 안에서 폭만 줄인다(420px). 미리보기 칸은 접는다 — 좁은 데서 반을 떼면 대화가 죽는다.
 *  - **창으로 띄우기**: 진짜 작은 창을 하나 연다(`window.open`). 그게 "문자 띄워놓고" 에 제일 가깝다.
 *    띄운 창은 `?창=작게` 로 열려서 저절로 좁은 모양이 된다.
 *
 * ## 고른 것은 기억한다
 * 켜 두는 창인데 열 때마다 넓게 나오면 매번 다시 눌러야 한다. 브라우저에 담아 둔다 —
 * 이건 **그 사람 편의**라 저장소에 둘 일이 아니다(기기마다 다른 게 맞다).
 */
import { useEffect, useState } from "react";

const 담는곳 = "로키-좁은창-v1";

export function use좁은창() {
  const [좁게, set좁게] = useState<boolean | null>(null);   // null = 아직 모른다(첫 그림에서 깜빡임 막기)

  useEffect(() => {
    try {
      const 주소 = new URLSearchParams(window.location.search);
      if (주소.get("창") === "작게") { set좁게(true); return; }   // 띄운 창은 늘 작게
      set좁게(localStorage.getItem(담는곳) === "1");
    } catch { set좁게(false); }
  }, []);

  const 바꾸기 = (v: boolean) => {
    set좁게(v);
    try { localStorage.setItem(담는곳, v ? "1" : "0"); } catch { /* 막혀 있어도 이번 판은 바뀐다 */ }
  };
  return { 좁게: 좁게 === true, 정해짐: 좁게 !== null, 바꾸기 };
}

/** 진짜 작은 창으로 하나 띄운다 — 켜 두고 다른 일을 하는 모양. */
export function 창으로띄우기() {
  const w = 420, h = 760;
  // 오른쪽 아래에 붙인다. 메신저가 거기 있는 까닭과 같다 — 쓰던 것을 안 가린다.
  const left = Math.max(0, (window.screen?.availWidth ?? 1280) - w - 24);
  const top = Math.max(0, (window.screen?.availHeight ?? 800) - h - 48);
  const 창 = window.open(
    "/ask?창=작게", "로키-작은창",
    `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  );
  // 팝업이 막히면 아무 일도 안 일어난 것처럼 보인다 — 그러면 사람은 단추가 고장 난 줄 안다.
  if (!창) return false;
  창.focus();
  return true;
}

export function 창단추({ 좁게, 바꾸기 }: { 좁게: boolean; 바꾸기: (v: boolean) => void }) {
  const t = useT(ROOKERY);
  const [막힘, set막힘] = useState(false);
  /**
   * **그릴 때 `window` 를 읽으면 안 된다.** 서버는 주소줄을 모르니 단추를 그리고, 브라우저는
   * 작은 창이라 안 그린다 — 둘이 어긋나 hydration 이 깨진다(10-02 에 실제로 깨졌다).
   * 그래서 처음에는 **서버와 같게** 그려 두고, 붙은 뒤에 고친다.
   */
  const [작은창인가, set작은창인가] = useState(false);
  useEffect(() => {
    try { set작은창인가(new URLSearchParams(window.location.search).get("창") === "작게"); } catch { /* 못 읽으면 그냥 둔다 */ }
  }, []);
  return (
    <div className="rk-창단추">
      <button type="button" onClick={() => 바꾸기(!좁게)} title={좁게 ? t("넓게 보기") : t("좁게 — 켜 두고 쓰기")}>
        {좁게 ? t("넓게") : t("좁게")}
      </button>
      {!작은창인가 && (
        <button type="button" onClick={() => set막힘(!창으로띄우기())} title={t("작은 창으로 띄워 켜 두기")}>
          {t("창으로 띄우기")}
        </button>
      )}
      {막힘 && <span className="rk-막힘">{t("브라우저가 창을 막았어요 — 주소창 오른쪽에서 허용해 주세요")}</span>}
    </div>
  );
}
