"use client";
// i18n-ids: 꺼짐 켜는중 보는중 멈춤 화면띠 설명 잘못 눈 자리 무엇 높이비중
import type { T } from "@/lib/i18n/core";
/**
 * **로키가 화면을 보고 있다가 말을 건다** (228회차 10-02, 사장님이 (가)를 고르심).
 *
 * ## 사장님이 한 번 눌러야 켜진다
 * 브라우저는 화면을 몰래 못 읽게 막아 둔다 — `getDisplayMedia` 는 **사람이 누른 그 순간**에만 열리고,
 * 어느 창을 보여 줄지도 사장님이 고른다. 이건 불편이 아니라 **지켜 주는 것**이라 그대로 둔다.
 *
 * ## 돈이 새지 않게 — 바뀌었을 때만 본다
 * 20초마다 그림을 보내면 한 시간에 180번이고, 한 번에 1센트만 잡아도 하루에 몇 달러다.
 * 그래서 **화면이 지난번과 비슷하면 안 보낸다.** 비슷한지는 브라우저가 공짜로 센다 —
 * 작게 줄인 그림의 밝기 지문을 떠서 견준다. 글자 몇 자 바뀐 정도로는 안 보내고,
 * 창이 바뀌거나 오류가 뜨는 정도면 보낸다.
 *
 * ## 그림은 안 남는다
 * 서버는 판정에만 쓰고 저장하지 않는다. 사장님 화면에는 비밀번호도 메일도 지나간다.
 *
 * ## 보는 중인 것은 늘 보인다
 * 켜져 있는데 그걸 모르는 상태가 제일 나쁘다. 켜져 있으면 띠가 계속 떠 있고, 끄기도 거기 있다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** 몇 초마다 들여다보나. 짧으면 돈이 들고 길면 못 본다. */
const 간격초 = 20;
/** 한 번 켤 때 **보내는** 횟수의 상한. 켜 두고 잊어도 여기서 멈춘다. */
const 기본상한 = 40;
/** 지문이 이만큼 넘게 달라지면 "바뀌었다" 로 본다(0~1). */
const 바뀜문턱 = 0.12;

type 상태 = "꺼짐" | "켜는중" | "보는중" | "멈춤";

/** 지금 보이는 화면을 **한 장 떠서** 구조로 옮긴다 — 사장님이 "이거처럼" 하실 때. */
async function 한장뜨기(v: HTMLVideoElement): Promise<string> {
  const c = document.createElement("canvas");
  const 비 = Math.min(1, 1100 / v.videoWidth);   // 구조를 읽는 일이라 보기보다 조금 크게 뜬다
  c.width = Math.round(v.videoWidth * 비); c.height = Math.round(v.videoHeight * 비);
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72).split(",")[1];
}

export function use화면보기(말붙이기: (말: string) => void, 앞말: () => string[], t: T) {
  const [상태, set상태] = useState<상태>("꺼짐");
  const [본횟수, set본횟수] = useState(0);
  const [보낸횟수, set보낸횟수] = useState(0);
  const [잘못, set잘못] = useState("");
  const 흐름 = useRef<MediaStream | null>(null);
  const 비디오 = useRef<HTMLVideoElement | null>(null);
  const 지난지문 = useRef<number[] | null>(null);
  const 마지막말 = useRef<string>("");
  const 멈춤요청 = useRef(false);

  const 끄기 = useCallback(() => {
    멈춤요청.current = true;
    흐름.current?.getTracks().forEach((t) => t.stop());
    흐름.current = null;
    지난지문.current = null;
    set상태("꺼짐");
  }, []);

  useEffect(() => () => { 흐름.current?.getTracks().forEach((t) => t.stop()); }, []);

  const 켜기 = useCallback(async () => {
    set잘못("");
    set상태("켜는중");
    멈춤요청.current = false;
    try {
      // **이 호출은 사람이 누른 그 순간에만 열린다.** 나중에 몰래 부를 수 없다.
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      흐름.current = s;
      // 사장님이 브라우저 쪽 "공유 중지" 를 누르면 여기로 온다 — 화면 상태도 같이 꺼야 한다.
      s.getVideoTracks()[0]?.addEventListener("ended", () => 끄기());
      const v = document.createElement("video");
      v.srcObject = s; v.muted = true; await v.play();
      비디오.current = v;
      set상태("보는중");
    } catch (e) {
      // 사장님이 고르기를 취소한 것도 여기로 온다 — 그건 잘못이 아니다.
      const 취소인가 = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError");
      set잘못(취소인가 ? "" : t("화면을 못 받았어요"));
      set상태("꺼짐");
    }
  }, [끄기]);

  // 들여다보는 고리
  useEffect(() => {
    if (상태 !== "보는중") return;
    let 멈춤 = false;
    const 자 = setInterval(async () => {
      if (멈춤 || 멈춤요청.current) return;
      const v = 비디오.current;
      if (!v || !v.videoWidth) return;

      // ① 작게 줄여 지문을 뜬다(공짜). ② 지난번과 비슷하면 **안 보낸다**.
      const 작 = document.createElement("canvas");
      작.width = 32; 작.height = 18;
      작.getContext("2d")!.drawImage(v, 0, 0, 32, 18);
      const px = 작.getContext("2d")!.getImageData(0, 0, 32, 18).data;
      const 지문: number[] = [];
      for (let i = 0; i < px.length; i += 4) 지문.push((px[i] + px[i + 1] + px[i + 2]) / 765);
      set본횟수((n) => n + 1);

      const 앞 = 지난지문.current;
      if (앞) {
        let 차 = 0;
        for (let i = 0; i < 지문.length; i++) 차 += Math.abs(지문[i] - 앞[i]);
        if (차 / 지문.length < 바뀜문턱) return;   // 비슷하다 — 돈을 안 쓴다
      }
      지난지문.current = 지문;

      // ③ 바뀌었으니 한 장 보낸다. 너무 크면 값이 새므로 900px 로 줄인다.
      const 큰 = document.createElement("canvas");
      const 비 = Math.min(1, 900 / v.videoWidth);
      큰.width = Math.round(v.videoWidth * 비); 큰.height = Math.round(v.videoHeight * 비);
      큰.getContext("2d")!.drawImage(v, 0, 0, 큰.width, 큰.height);
      const 그림 = 큰.toDataURL("image/jpeg", 0.65).split(",")[1];

      try {
        const r = await fetch("/api/ask/screen", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ 그림, 앞말: 앞말(), 마지막말: 마지막말.current }),
        });
        set보낸횟수((n) => {
          const 다음 = n + 1;
          if (다음 >= 기본상한) { 끄기(); set상태("멈춤"); } // i18n-skip
          return 다음;
        });
        const j = await r.json();
        if (r.ok && j.말걸까 && j.말) { 마지막말.current = j.말; 말붙이기(j.말); }
      } catch { /* 한 번 못 보낸 것으로 끄지 않는다 — 다음 판에 다시 본다 */ }
    }, 간격초 * 1000);
    return () => { 멈춤 = true; clearInterval(자); };
  }, [상태, 말붙이기, 앞말, 끄기]);

  /**
   * **이거처럼.** 사장님이 베끼고 싶은 앱을 띄워 두고 누르면, 그 화면을 구조로 옮겨 대화에 붙인다.
   * 말 걸기와 다른 점: 이건 **사장님이 먼저 시킨 것**이라 문턱이 없다. 반드시 답한다.
   */
  const [옮기는중, set옮기는중] = useState(false);
  const 이거처럼 = useCallback(async () => {
    const v = 비디오.current;
    if (!v || !v.videoWidth || 옮기는중) return;
    set옮기는중(true); set잘못("");
    try {
      const r = await fetch("/api/ask/copy", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ 그림: await 한장뜨기(v) }),
      });
      const j = await r.json();
      if (!r.ok || !j.구조) { set잘못(j.잘못 ?? t("구조를 못 읽었어요")); set옮기는중(false); return; }
      const k = j.구조 as {
        무엇: string; 뼈대: { 자리: string; 무엇: string; 높이비중: string }[];
        글자층: string; 색쓰임: string; 간격: string; 움직임: string;
        옮기면: string[]; 안가져올것: string[]; 못본것: string[];
      };
      말붙이기([
        t("**이 화면을 봤어요 — {what}**", { what: k.무엇 }),
        "",
        t("**뼈대**"),
        ...k.뼈대.map((b) => `- [${b.자리}] ${b.무엇} (${b.높이비중})`),
        "",
        t("**글자 층** {v}", { v: k.글자층 }),
        t("**색 쓰임** {v}", { v: k.색쓰임 }),
        t("**간격** {v}", { v: k.간격 }),
        t("**움직임** {v}", { v: k.움직임 }),
        "",
        t("**우리 화면으로 옮기면**"),
        ...k.옮기면.map((x) => `- ${x}`),
        "",
        t("**안 가져올 것**(그 앱 고유의 것)"),
        ...k.안가져올것.map((x) => `- ${x}`),
        "",
        t("**한 장으로는 못 본 것**"),
        ...k.못본것.map((x) => `- ${x}`),
      ].join(String.fromCharCode(10)));
    } catch { set잘못(t("서버에 못 닿았어요")); }
    set옮기는중(false);
  }, [옮기는중, 말붙이기, t]);

  return { 상태, 본횟수, 보낸횟수, 잘못, 켜기, 끄기, 상한: 기본상한, 이거처럼, 옮기는중, t };
}

export function 화면보기띠({ 상태, 본횟수, 보낸횟수, 상한, 잘못, 켜기, 끄기, 이거처럼, 옮기는중, t }: ReturnType<typeof use화면보기>) {
  if (상태 === "꺼짐" || 상태 === "켜는중") {
    return (
      <div className="rk-화면띠">
        <button type="button" onClick={() => void 켜기()} disabled={상태 === "켜는중"}>
          {상태 === "켜는중" ? t("화면 고르는 중…") : t("화면 보여주기")}
        </button>
        <span className="rk-설명">{t("로키가 보고 있다가 말 걸 만할 때만 말해요")}</span>
        {잘못 && <span className="rk-잘못">{잘못}</span>}
      </div>
    );
  }
  if (상태 === "멈춤") {
    return (
      <div className="rk-화면띠">
        <span className="rk-설명">{t("{n}번을 채워서 멈췄어요", { n: 상한 })}</span>
        <button type="button" onClick={() => void 켜기()}>{t("다시 보기")}</button>
      </div>
    );
  }
  return (
    <div className="rk-화면띠 rk-보는중" role="status" aria-live="polite">
      <span className="rk-눈" aria-hidden />
      <b>{t("화면 보는 중")}</b>
      <span className="rk-설명">{t("{seen}번 봄 · {sent}/{max}번 물어봄", { seen: 본횟수, sent: 보낸횟수, max: 상한 })}</span>
      <button type="button" onClick={() => void 이거처럼()} disabled={옮기는중} title={t("지금 보이는 화면을 베낄 수 있는 구조로 옮긴다")}>
        {옮기는중 ? t("보는 중…") : t("이거처럼")}
      </button>
      <button type="button" onClick={끄기}>{t("그만 보기")}</button>
    </div>
  );
}
