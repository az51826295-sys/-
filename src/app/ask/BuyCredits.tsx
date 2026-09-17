"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 결제창을 열어도 되는가 (140회차 09-16). **기본은 닫힘.**
 *
 * 09-15 에 Paddle 이 우리를 거절했는데(창작 AI 결과물은 셀프서브로 안 받는다) 이 단추는 조건 없이 떠 있었다.
 * 친구에게 링크를 건네면 **우리가 못 받는 결제창**을 누르게 된다. 못 받는 돈을 받는 척하지 않는다.
 * 대행사를 구하면 `NEXT_PUBLIC_CHECKOUT_OPEN=1` 로 다시 연다(클라이언트라 NEXT_PUBLIC_ 만 읽힌다).
 * 서버 쪽 짝은 `billing/plans.ts` 의 `checkoutOpen()`.
 */
const CHECKOUT_OPEN = process.env.NEXT_PUBLIC_CHECKOUT_OPEN === "1";

/**
 * 크레딧 · 충전 (100회차 09-13) — 설정 메뉴 안의 한 줄과 충전 창.
 *
 * 결제는 Paddle 이 판매자로서 받는다(사업자등록 없음). 창은 Paddle.js 오버레이 — 카드 번호는 우리 서버를 지나지 않는다.
 * 돈이 들어온 것은 **웹훅이 원장에 쓴 뒤에만** 잔고에 보인다. 여기서 "결제 완료" 신호를 받아도 잔고를 직접 올리지 않고 다시 읽는다.
 * 안드로이드 앱 안(inApp)에서는 잔고만 보이고 충전 단추가 없다(구글 플레이 결제 정책).
 */
type Info = {
  open: boolean;
  inApp: boolean;
  prepaid?: boolean;
  companyId?: string | null;
  email?: string | null;
  balance?: { credits: number; readable: boolean } | null;
  skus?: { id: string; name: string; priceLabel: string; credits: number; note: string | null; priceId: string }[];
  paddle?: { env: "sandbox" | "production"; clientToken: string | null } | null;
  /** 167회차: 어느 판매 대행사인가. Dodo 는 서버가 결제창 주소를 만들어 준다(`/api/billing/dodo/checkout`). */
  provider?: "dodo" | "paddle";
  testMode?: boolean;
  /** 서버가 정한다: 이 사람에게 구독 단추를 보여도 되는가(시험 모드면 명단에 있는 사람만). */
  canCheckout?: boolean;
};

type PaddleGlobal = {
  Environment: { set: (env: string) => void };
  Initialize: (o: { token: string; eventCallback?: (e: { name?: string }) => void }) => void;
  Checkout: { open: (o: Record<string, unknown>) => void };
};

let paddleReady: Promise<PaddleGlobal> | null = null;
function loadPaddle(env: string, token: string, onEvent: (name: string) => void): Promise<PaddleGlobal> {
  if (paddleReady) return paddleReady;
  paddleReady = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    s.async = true;
    s.onload = () => {
      const P = (window as unknown as { Paddle?: PaddleGlobal }).Paddle;
      if (!P) { reject(new Error("Paddle 을 못 불러왔어요.")); return; }
      if (env === "sandbox") P.Environment.set("sandbox");
      P.Initialize({ token, eventCallback: (e) => onEvent(e.name ?? "") });
      resolve(P);
    };
    s.onerror = () => { paddleReady = null; reject(new Error("결제 창을 불러오지 못했어요.")); };
    document.head.appendChild(s);
  });
  return paddleReady;
}

/** 서버가 준 충전 정보. 못 읽으면 null — 줄 자체를 안 보인다. */
async function fetchInfo(): Promise<Info | null> {
  try {
    const r = await fetch("/api/billing", { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as Info;
    // 앱 안인데 쿠키가 아직 없으면(첫 화면이 캐시였다든지) 여기서도 알아본다.
    if (!j.inApp && document.referrer.startsWith("android-app://")) {
      document.cookie = "rk_app=android; path=/; max-age=31536000; samesite=lax; secure";
      return { ...j, inApp: true, skus: [], paddle: null };
    }
    return j;
  } catch { return null; }
}

export default function BuyCredits() {
  const [info, setInfo] = useState<Info | null>(null);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await fetchInfo();
    if (j) setInfo(j);
  }, []);
  useEffect(() => {
    let alive = true;
    void fetchInfo().then((j) => { if (alive && j) setInfo(j); });
    // Dodo 결제창에서 돌아온 길(`?paid=1`): 웹훅이 원장에 쓰는 데 몇 초~몇 분 걸린다(Dodo 문서: 첫 청구 확인 2~10분일 수 있다).
    let timers: ReturnType<typeof setTimeout>[] = [];
    if (new URLSearchParams(window.location.search).get("paid") === "1") {
      timers = [4000, 15000, 60000, 180000].map((ms) => setTimeout(() => void fetchInfo().then((j) => { if (alive && j) setInfo(j); }), ms));
    }
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, []);

  if (!info?.open || !info.prepaid) return null;

  const credits = info.balance?.readable ? info.balance.credits.toLocaleString("ko-KR") : "—";

  /** Dodo: 서버에 결제창 주소를 달라고 하고 그리로 간다. 돌아오면(`?paid=1`) 잔고를 다시 읽는다 — 화면이 잔고를 지어내지 않는다. */
  async function buyDodo(skuId: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/billing/dodo/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku: skuId }) });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !j.url) { setMsg(j.error ?? "결제 창을 열지 못했어요."); return; }
      window.location.assign(j.url);
    } catch { setMsg("결제 창을 열지 못했어요."); }
    finally { setBusy(false); }
  }

  async function buy(priceId: string) {
    if (!info?.paddle?.clientToken || !info.companyId) { setMsg("결제 준비가 아직 안 됐어요."); return; }
    setBusy(true); setMsg(null);
    try {
      const P = await loadPaddle(info.paddle.env, info.paddle.clientToken, (name) => {
        if (name === "checkout.completed") {
          setMsg("구독됐어요. 크레딧이 들어오는 데 몇 초 걸려요.");
          // 웹훅이 원장에 쓰는 것을 기다렸다 다시 읽는다 — 화면이 잔고를 지어내지 않는다.
          setTimeout(() => void load(), 4000);
          setTimeout(() => void load(), 12000);
        }
      });
      P.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: info.email ? { email: info.email } : undefined,
        customData: { company_id: info.companyId },
        settings: { displayMode: "overlay", theme: "dark", locale: "ko" },
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "결제 창을 열지 못했어요.");
    } finally { setBusy(false); }
  }

  // 140회차: 결제 대행사가 없으면 이 자리를 아예 안 보여 준다. 잔액은 미리보기 패널에 이미 뜬다.
  // 167회차: 서버가 "이 사람은 된다" 고 하면 빌드 때 박힌 스위치가 꺼져 있어도 보인다(시험 모드 명단).
  if (!CHECKOUT_OPEN && !info.canCheckout) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => { setShow(true); void load(); }}
        className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--rk-100)]"
      >
        크레딧 {credits}
        <span className="block text-[11px] text-[var(--rk-400)]">
          {info.inApp ? "일을 맡길 때마다 쓴 만큼 빠져요" : "구독하기 · 매달 새로 채워져요"}
        </span>
      </button>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShow(false)} role="dialog" aria-label="크레딧">
          <div className="w-full max-w-sm border-2 border-[#E0703A] bg-[var(--rk-paper)] p-4 text-[var(--rk-ink)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold">크레딧</span>
              <span className="text-lg font-bold tabular-nums">{credits}</span>
            </div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-[var(--rk-600)]">
              답하기는 거의 안 들고, 조사·문서·그림·앱처럼 일을 맡기면 실제로 든 만큼 빠져요. 보통 업무 하나에 30~40 크레딧이에요. 구독하면 매달 크레딧이 새로 채워지고, 남은 크레딧은 다음 달로 넘어가지 않아요.
            </p>
            {!info.inApp && (info.skus?.length ? (
              <div className="flex flex-col gap-2">
                {info.skus.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void (info.provider === "dodo" ? buyDodo(s.id) : buy(s.priceId))}
                    className="flex items-center justify-between gap-3 border-2 border-[var(--rk-ink)] px-3 py-2 text-left hover:bg-[var(--rk-100)] disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{s.name}</span>
                      {s.note && <span className="block truncate text-[11px] text-[var(--rk-600)]">{s.note}</span>}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-sm font-bold">{s.priceLabel}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--rk-600)]">구독은 곧 열려요.</p>
            ))}
            {msg && <p className="mt-2 text-xs text-[#7ED9A0]">{msg}</p>}
            {!info.inApp && (
              <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--rk-400)]">
                {info.testMode ? "[시험 모드 — 실제 돈은 안 나가요] " : ""}결제와 영수증은 판매 대행사 {info.provider === "dodo" ? "Dodo Payments" : "Paddle"} 가 처리해요. 구독은 언제든 해지할 수 있어요. <a href="/pricing" className="underline">요금</a> · <a href="/terms" className="underline">약관</a> · <a href="/refund" className="underline">환불</a>
              </p>
            )}
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setShow(false)} className="border-2 border-[var(--rk-ink)] px-2.5 py-1 text-xs">닫기</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
