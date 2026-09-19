"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 미리보기 — 대화 옆의 현재 버전 (UI B, 2026-09-06 사장님 승인).
 *
 * 남들(Rosebud·Bezi·Unity)은 결과가 대화 옆에 늘 있고, 버전을 되돌릴 수 있다. 우리는 사진이
 * 대화에 흘러 내려갔다. 이 칸이 그 자리다: 화면(사진), 검사 결과, 파일, 버전 기록, 이번 달 사용.
 * PC 는 오른쪽 칸, 폰은 입력창 위 띠(접힘) → 누르면 아래에서 올라온다.
 * 낱말은 `engine/docs/ui-words-2026-09-06.md` 표대로. 이 칸은 게임을 모른다 — 종류는 서버가 준다.
 */
type Panel = {
  /** 163회차 같이 보기: 손이 20초 안에 보낸 사장님 화면이 있으면. 그림은 /api/hand/screen 이 준다. */
  screen: { host: string; at: string } | null;
  versions: { n: number; deliverableId: string; title: string; kind: string; who: string | null; current: boolean; at: string }[];
  current: {
    n: number; deliverableId: string; title: string; kind: string; ruler: string; who: string | null; at: string;
    verdict: string | null; checks: { name: string; result: string; message: string }[]; checkedAt: string | null;
    photos: { title: string; href: string }[]; files: { name: string; href: string }[];
    /** 185회차: 브라우저에서 바로 여는 문(웹 게임). 없으면 null. */
    play: string | null;
    /** 심판자가 처음 보는 사람처럼 한 말(150회차). 점수도 통과/실패도 없다 — 읽고 사장님이 정한다. */
    judge: { firstGlance: string; wouldStop: string; awkward: string; soulless: string; oneChange: string } | null;
    /** 이 업무의 첫 판정. 없으면 아직 안 봤다는 뜻 — 단추가 뜬다. */
    review: { decision: "approved" | "needs_changes" | string; at: string; feedback: string | null } | null;
  } | null;
  /** credits 가 있으면 충전식 회사(100회차) — 달러·Meshy 대신 자기 크레딧만 보인다. */
  spend: { monthUsd: number; meshyCredits: number | null; credits?: number | null; note: string };
};

/** 계획 카드: 도는 동안 "무엇을, 기준 몇 개, 얼마쯤". 서버(workReturns)가 저장된 단계에서 만든다. */
export type PlanCard = { title: string; kind: string; lines: string[]; estimate: string; who?: string };

/** 미리보기 자료. 대화 화면이 들고 있다가 띠(폰)와 칸(PC) 둘에 준다. */
export function usePreview(conversationId: string | null, refreshKey: number) {
  const [data, setData] = useState<Panel | null>(null);
  const load = useCallback(async () => {
    if (!conversationId) return null;
    try {
      const r = await fetch(`/api/conversations/${conversationId}/panel`);
      return r.ok ? ((await r.json()) as Panel) : null;
    } catch { return null; }
  }, [conversationId]);
  useEffect(() => {
    let alive = true;
    void load().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [load, refreshKey]);
  return { data, setData, load };
}

export function previewSummary(data: Panel | null, steps: Record<string, string>): string {
  const working = Object.values(steps)[0];
  const cur = data?.current ?? null;
  return cur
    ? `미리보기 · v${cur.n} ${cur.title}` + (cur.checks.length ? ` · 걸린 것 ${cur.checks.filter((c) => c.result === "어긋남").length}` : "")
    : working ? `작업 중 · ${working}` : "미리보기 · 아직 결과가 없어요";
}

/**
 * 같이 보기의 그림 (163회차에 넣고 164회차에 고침). 처음엔 패널을 읽을 때의 `screen` 만 보고 그렸다 —
 * 손을 나중에 켜면 칸이 안 뜨고, 손을 꺼도 깨진 그림이 남는다. 그래서 그림을 직접 묻는다:
 * 보이는 동안은 3초, 안 보이는 동안은 15초마다. 204(20초 넘게 새 장 없음)면 칸을 내린다.
 * 탭이 뒤에 있으면 묻지 않는다.
 */
function useSharedScreen(initial: { host: string } | null) {
  const [shot, setShot] = useState<{ url: string; host: string } | null>(null);
  const live = shot !== null || initial !== null;
  useEffect(() => {
    let alive = true;
    async function ask() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/hand/screen", { cache: "no-store" });
        if (!alive) return;
        if (r.status !== 200) { setShot((old) => { if (old) URL.revokeObjectURL(old.url); return null; }); return; }
        const url = URL.createObjectURL(await r.blob());
        const host = r.headers.get("x-rookery-host") ?? "";
        if (!alive) { URL.revokeObjectURL(url); return; }
        setShot((old) => { if (old) URL.revokeObjectURL(old.url); return { url, host }; });
      } catch { /* 한 번 못 받은 건 다음 박자에 다시 묻는다 */ }
    }
    void ask();
    const id = setInterval(ask, live ? 3000 : 15000);
    return () => { alive = false; clearInterval(id); };
  }, [live]);
  return shot;
}

/** 폰: 입력창 바로 위의 한 줄. 누르면 판이 올라온다. */
export function PreviewStrip({ summary, onOpen }: { summary: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-2 flex w-full items-center justify-between border-2 border-[#E0703A] bg-[var(--rk-paper)] px-3 py-2 text-left text-xs text-[var(--rk-ink)] lg:hidden"
    >
      <span className="truncate">{summary}</span>
      <span>▲</span>
    </button>
  );
}

export default function PreviewPanel({
  conversationId,
  preview,
  steps,
  plans = {},
  open,
  onOpenChange,
  onReverted,
  onFix,
}: {
  conversationId: string | null;
  preview: ReturnType<typeof usePreview>;
  /** 지금 도는 일의 단계(있으면). */
  steps: Record<string, string>;
  plans?: Record<string, PlanCard>;
  /** 폰에서 판이 올라온 상태. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReverted?: () => void;
  /** 수정 요청이 남은 뒤, 그 이유를 대화로 보내 직원이 바로 고치게 한다(98회차). */
  onFix?: (feedback: string) => void;
}) {
  const { data, setData, load } = preview;
  const setOpen = onOpenChange;
  const [busy, setBusy] = useState<string | null>(null);
  const [showPassed, setShowPassed] = useState(false);
  // 185회차 사장님: "v7 눌러도 아무 반응이 없는데" — 버전 단추는 **그 버전을 보여 주는** 것이고, 복원은 따로 누른다.
  const [viewing, setViewing] = useState<string | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const shot = useSharedScreen(data?.screen ?? null);

  async function revert(deliverableId: string, n: number) {
    if (!conversationId || busy) return;
    if (!confirm(`v${n} 으로 복원할까요? 다음 수정은 그 버전 위에서 해요.`)) return;
    setBusy(deliverableId);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/revert`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliverableId }),
      });
      if (r.ok) { setData(await load()); setViewing(null); onReverted?.(); }
    } finally { setBusy(null); }
  }

  /**
   * 이 판을 버린다 (136회차). **지우지 않는다** — 목록에서 내리고 현재 판을 앞으로 되돌린다.
   * 되돌릴 수 있게 만든 이유: 화면은 홧김에 누른 것과 진짜로 없애려는 것을 구별할 수 없다.
   */
  async function discard(deliverableId: string, n: number) {
    if (!conversationId || busy) return;
    if (!confirm(`v${n} 을 버릴까요?

목록에서 내려가고 그 앞 판이 현재 판이 돼요. 파일은 안 지워요.`)) return;
    setBusy(deliverableId);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/discard`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliverableId }),
      });
      if (!r.ok) { const j = (await r.json().catch(() => ({}))) as { error?: string }; alert(j.error ?? "버리지 못했어요."); }
      setData(await load());
      onReverted?.();
    } finally { setBusy(null); }
  }

  /**
   * 매니저 판정(98회차, 사장님 "승인"). 예측(`work_predictions`)은 149건인데 판정은 0건이었다 —
   * 09-05에 판정 화면이 대시보드와 함께 지워져서. 여기가 채점자다. 한 업무에 한 번,
   * 수정 요청은 이유 10자 이상(직원이 다음에 배울 재료).
   */
  async function judge(deliverableId: string, decision: "approved" | "needs_changes") {
    if (!conversationId || busy) return;
    let feedback = "";
    if (decision === "approved") {
      if (!confirm("이 결과를 승인할까요? 승인은 되돌리지 않아요.")) return;
    } else {
      const typed = prompt("무엇을 고칠지 적어 주세요 (10자 이상). 이 말이 직원의 다음 기준이 돼요.");
      if (typed === null) return;
      feedback = typed.trim();
      if (feedback.length < 10) { alert("10자 이상 적어 주세요."); return; }
    }
    setBusy(deliverableId);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliverableId, decision, feedback }),
      });
      if (!r.ok) { const j = (await r.json().catch(() => ({}))) as { error?: string }; alert(j.error ?? "판정을 남기지 못했어요."); }
      setData(await load());
      // 판정이 남았으면 이유를 그대로 직원에게 — "수정 요청: …" 은 FIX_WORDS 규칙에 걸려
      // 현재 판을 낸 직원이 그 판 위에서 고친다. 새 경로가 아니라 사람이 치는 것과 같은 경로다.
      if (r.ok && decision === "needs_changes") onFix?.(feedback);
    } finally { setBusy(null); }
  }

  const working = Object.values(steps)[0];
  const cur = data?.current ?? null;

  const body = (
    <div className="flex h-full flex-col text-sm">
      {/* 100회차: 폰 폭(360px)에서 "▼ 닫기" 가 오른쪽 끝에 붙었다 — 설명은 줄이고 단추는 줄지 않게. */}
      <div className="flex items-baseline justify-between gap-2 border-b-2 border-[var(--rk-ink)] px-3.5 py-2.5">
        <span className="shrink-0 font-bold">{cur ? `미리보기 · v${cur.n}` : "미리보기"}</span>
        <span className="flex min-w-0 items-baseline text-[11px] text-[var(--rk-600)]">
          <span className="min-w-0 truncate">
          {cur ? [cur.kind, cur.who, new Date(cur.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · ") : ""}
          </span>
          <button type="button" className="ml-3 shrink-0 whitespace-nowrap lg:hidden" onClick={() => setOpen(false)}>▼ 닫기</button>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* 163회차 같이 보기 — 사장님 "로키가 같이 보는 거, 같이 화면에 띄우는 거". 손(-Watch)이 3초마다 보낸 사장님 노트북 화면.
            로키가 답할 때도 같은 한 장을 본다. 20초 넘게 안 오면 이 칸이 사라진다 — 옛 화면을 지금인 척하지 않는다. */}
        {shot && (
          <section className="border-b-2 border-[var(--rk-ink)] px-3.5 py-2.5">
            <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-[var(--rk-600)]">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#E07070] align-middle" />사장님 화면 · 실시간 · {shot.host}</span>
              <span>로키가 같이 보고 있어요</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.url} alt="사장님 화면" className="w-full border-2 border-[var(--rk-ink)]" />
          </section>
        )}
        {Object.entries(plans).map(([id, pl]) => (
          <section key={id} className="border-b-2 border-[#E0703A] bg-[var(--rk-100)] px-3.5 py-2.5">
            <div className="mb-1 text-[11px] text-[var(--rk-600)]">계획 — {pl.kind}{pl.who ? ` · ${pl.who}` : ""} · {steps[id]?.split(": ")[1] ?? "진행 중"}</div>
            <div className="text-sm font-bold">{pl.title}</div>
            {pl.lines.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[11.5px] text-[var(--rk-600)]">
                {pl.lines.map((l, i) => <li key={i}>· {l}</li>)}
              </ul>
            )}
            <div className="mt-1.5 text-[11px] text-[var(--rk-600)]">{pl.estimate}</div>
          </section>
        ))}
        {!cur && (
          <p className="px-3.5 py-6 text-xs text-[var(--rk-600)]">
            {working ? `${working}… 끝나면 여기 나타나요.` : "일을 시키면 결과가 여기 나타나요. 화면, 검사 결과, 버전 기록."}
          </p>
        )}
        {cur && (
          <section className="border-b-2 border-[#E0703A] px-3.5 py-2.5">
            {cur.review ? (
              <div className="text-xs">
                <span className={cur.review.decision === "approved" ? "font-bold text-[#7ED9A0]" : "font-bold text-[#E0703A]"}>
                  {cur.review.decision === "approved" ? "✓ 승인됨" : "✎ 수정 요청됨"}
                </span>
                <span className="ml-2 text-[var(--rk-600)]">{new Date(cur.review.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                {cur.review.feedback && <div className="mt-1 text-[11.5px] text-[var(--rk-600)]">{cur.review.feedback}</div>}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="mr-auto min-w-0 text-[11px] text-[var(--rk-600)]">
                  이 결과, 어때요?
                  {/* 100회차: 플레이 AI 생성 콘텐츠 정책 — 결과물도 앱 안에서 신고할 수 있게. */}
                  <a
                    href={`mailto:az51826295@gmail.com?subject=${encodeURIComponent("로키 신고: 결과물 " + cur.title)}&body=${encodeURIComponent(`대화: ${conversationId}\n결과물: ${cur.deliverableId} (v${cur.n})\n\n무엇이 문제인지 적어 주세요:\n`)}`}
                    className="ml-2 underline hover:text-[var(--rk-ink)]"
                  >신고</a>
                </span>
                {/* 136회차(사장님): "승인버튼 수정버튼 밖에없고 삭제 버튼 없음."
                    승인도 수정 요청도 아닌 것이 있다 — 그냥 아니었던 것. 지우지 않고 목록에서 내린다. */}
                <button type="button" disabled={busy !== null} onClick={() => void discard(cur.deliverableId, cur.n)}
                  className="shrink-0 whitespace-nowrap border-2 border-[var(--rk-600)] px-2.5 py-1 text-xs text-[var(--rk-600)] hover:bg-[var(--rk-100)] disabled:opacity-50">버리기</button>
                <button type="button" disabled={busy !== null} onClick={() => void judge(cur.deliverableId, "needs_changes")}
                  className="shrink-0 whitespace-nowrap border-2 border-[var(--rk-ink)] px-2.5 py-1 text-xs hover:bg-[var(--rk-100)] disabled:opacity-50">수정 요청</button>
                <button type="button" disabled={busy !== null} onClick={() => void judge(cur.deliverableId, "approved")}
                  className="shrink-0 whitespace-nowrap border-2 border-[#E0703A] bg-[#E0703A] px-2.5 py-1 text-xs font-bold text-[var(--rk-paper)] disabled:opacity-50">승인</button>
              </div>
            )}
          </section>
        )}
        {cur && cur.photos.length > 0 && (
          <section className="border-b border-[var(--rk-200)] px-3.5 py-2.5">
            <div className="mb-1.5 text-[11px] text-[var(--rk-600)]">화면</div>
            <div className="grid gap-1.5">
              {cur.photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.href} src={p.href} alt={p.title} className={"w-full border-2 border-[var(--rk-ink)] " + (i === 0 ? "" : "")} />
              ))}
            </div>
            <div className="mt-1 text-[10.5px] text-[var(--rk-600)]">{cur.photos.map((p) => p.title).join(" · ")}</div>
          </section>
        )}
        {/* 150회차 — **심판자의 말이 닿는 자리.**
            그전까지 심판자는 결과물 본문 안에서만 말했고, 152건 중 판정이 붙은 것은 2건, 그중 "치명" 이 1건,
            그래서 다시 만든 판은 **0건**이었다. 말은 했는데 받는 쪽이 없었다.
            여기는 문이 아니다 — 아무것도 막지 않는다(화면 보는 AI 를 문으로 쓰면 애매할 때 통과 쪽으로 기울어
            열린 채로 고장 난다, 09-16 조사). 사람이 읽고 **누르는 것**이 받는 쪽이다. */}
        {cur && cur.judge && (
          <section className="border-b border-[var(--rk-200)] px-3.5 py-2.5">
            <div className="mb-1.5 text-[11px] text-[var(--rk-600)]">처음 보는 사람이라면 — 막지 않아요, 읽고 정하세요</div>
            <div className="grid gap-1 text-[11.5px] leading-snug">
              <div><span className="text-[var(--rk-600)]">3초만 봤을 때</span> {cur.judge.firstGlance}</div>
              <div><span className="text-[var(--rk-600)]">멈출까 넘길까</span> {cur.judge.wouldStop}</div>
              {cur.judge.awkward && <div><span className="text-[var(--rk-600)]">어색한 곳</span> {cur.judge.awkward}</div>}
              {cur.judge.soulless && <div><span className="text-[var(--rk-600)]">고른 흔적</span> {cur.judge.soulless}</div>}
              <div className="mt-0.5"><span className="text-[var(--rk-600)]">하나만 바꾼다면</span> <b>{cur.judge.oneChange}</b></div>
            </div>
            {onFix && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  const j = cur.judge!;
                  onFix(j.oneChange + (j.awkward ? ` (어색한 곳: ${j.awkward})` : ""));
                }}
                className="mt-2 w-full border-2 border-[var(--rk-ink)] px-2.5 py-1 text-xs hover:bg-[var(--rk-100)] disabled:opacity-50"
              >이 말대로 고쳐 줘</button>
            )}
          </section>
        )}
        {cur && cur.checks.length > 0 && (
          <section className="border-b border-[var(--rk-200)] px-3.5 py-2.5">
            <div className="mb-1.5 text-[11px] text-[var(--rk-600)]">
              {/* 157회차: 딱지를 뗐다. "통과 N · 실패 M · 해당 없음 K" 는 판정처럼 읽히는데 센 것이지 판단이 아니다. 못 잼은 세지 않는다. */}
              자동 확인 {cur.checks.filter((c) => c.result !== "못 잼").length}가지 · 걸린 것 {cur.checks.filter((c) => c.result === "어긋남").length}가지 <span className="text-[var(--rk-400)]">(기계가 잰 값이에요 — 좋고 나쁨은 사장님이 정해요)</span>
            </div>
            {/* 45회차: 통과한 줄은 접는다. 여덟 줄이 다 펴져 있으면 실패 한 줄이 안 보인다. */}
            {cur.checks
              .filter((c) => showPassed || c.result !== "맞음")
              .map((c) => (
                <div key={c.name} className={"text-xs " + (c.result === "어긋남" ? "text-[#E07070]" : "text-[var(--rk-600)]")} title={c.message}>
                  {c.result === "어긋남" ? "≠" : c.result === "맞음" ? "·" : "–"} {c.name}{c.message && c.result !== "맞음" ? ` (${c.message.slice(0, 60)})` : ""}
                </div>
              ))}
            {cur.checks.some((c) => c.result === "맞음") && (
              <button type="button" className="mt-1 text-[11px] text-[var(--rk-600)] underline" onClick={() => setShowPassed((v) => !v)}>
                {showPassed ? "맞은 줄 접기" : `맞은 줄 ${cur.checks.filter((c) => c.result === "맞음").length}개 보기`}
              </button>
            )}
          </section>
        )}
        {cur && cur.files.length > 0 && (
          <section className="border-b border-[var(--rk-200)] px-3.5 py-2.5">
            <div className="mb-1.5 text-[11px] text-[var(--rk-600)]">파일</div>
            <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[11.5px]">
              {cur.files.slice(0, 8).map((f) => (
                <a key={f.href} href={f.href} target="_blank" rel="noopener" className="underline">{f.name}</a>
              ))}
              {cur.files.length > 8 && <span className="text-[var(--rk-600)]">+{cur.files.length - 8}</span>}
            </div>
          </section>
        )}
        {cur && (cur.play || viewing) && (() => {
          // 185회차: 게임을 여기서 바로 한다. 보는 판(viewing)이 있으면 그 판, 아니면 현재 판.
          const id = viewing ?? cur.deliverableId;
          const src = `/api/deliverables/${id}/play/`;
          const v = data?.versions.find((x) => x.deliverableId === id);
          return (
            <section className="border-b border-[var(--rk-200)] px-3.5 py-2.5">
              <div className="mb-1.5 flex items-center gap-2 text-[11px] text-[var(--rk-600)]">
                <span className="mr-auto">{viewing && viewing !== cur.deliverableId ? `v${v?.n ?? "?"} 보는 중 · 현재는 v${cur.n}` : "바로 해 보기 — 창 안을 한 번 누르면 키가 먹어요"}</span>
                {viewing && viewing !== cur.deliverableId && (
                  <button type="button" disabled={busy !== null} onClick={() => void revert(id, v?.n ?? 0)} className="border border-[#E0703A] px-1.5 py-0.5 text-[#E0703A]">이 버전으로 복원</button>
                )}
                <button type="button" onClick={() => setPlayKey((k) => k + 1)} className="border border-[var(--rk-200)] px-1.5 py-0.5 hover:border-[var(--rk-ink)]">다시 시작</button>
                <a href={src} target="_blank" rel="noopener" className="border border-[var(--rk-200)] px-1.5 py-0.5 hover:border-[var(--rk-ink)]">새 창에서 열기</a>
              </div>
              <iframe
                key={`${id}-${playKey}`}
                src={src}
                title={`v${v?.n ?? ""} 미리보기`}
                sandbox="allow-scripts allow-pointer-lock allow-popups allow-forms"
                className="h-[360px] w-full border-2 border-[var(--rk-ink)] bg-black"
              />
            </section>
          );
        })()}
        {data && data.versions.length > 0 && (
          <section className="border-b border-[var(--rk-200)] px-3.5 py-2.5">
            <div className="mb-1.5 text-[11px] text-[var(--rk-600)]">버전 기록 — 누르면 그 버전이 위에 보여요. 복원은 위의 단추로.</div>
            <div className="flex flex-wrap gap-1.5">
              {data.versions.map((v) => {
                const shown = (viewing ?? cur?.deliverableId) === v.deliverableId;
                return (
                  <button
                    key={v.deliverableId}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setViewing(v.current ? null : v.deliverableId)}
                    title={`${v.kind} · ${v.who ?? ""} · ${v.title}${v.current ? " · 현재 판" : ""}`}
                    className={"border-2 px-2 py-0.5 text-xs " + (shown ? "border-[#E0703A] text-[var(--rk-ink)]" : v.current ? "border-[var(--rk-ink)] text-[var(--rk-ink)]" : "border-[var(--rk-200)] text-[var(--rk-600)] hover:border-[var(--rk-ink)] hover:text-[var(--rk-ink)]")}
                  >
                    v{v.n} {v.title.slice(0, 14)}{v.title.length > 14 ? "…" : ""}{v.current ? " ●" : ""}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
      {data && (
        <div className="flex justify-between border-t-2 border-[var(--rk-ink)] px-3.5 py-2 text-[11px] text-[var(--rk-600)]" title={data.spend.note}>
          {data.spend.credits != null ? (
            <span>남은 크레딧 <b className="text-[var(--rk-ink)]">{data.spend.credits.toLocaleString("ko-KR")}</b></span>
          ) : (
            <>
              <span>이번 달 사용 <b className="text-[var(--rk-ink)]">${data.spend.monthUsd.toFixed(2)}</b></span>
              <span>Meshy 크레딧 <b className="text-[var(--rk-ink)]">{data.spend.meshyCredits === null ? "—" : data.spend.meshyCredits.toLocaleString()}</b></span>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* PC: 오른쪽 칸 */}
      <aside className="hidden h-[calc(100vh-4rem)] w-[400px] shrink-0 border-l-2 border-[var(--rk-ink)] lg:block">{body}</aside>
      {/* 폰: 아래에서 올라오는 판 (띠는 대화 화면이 입력창 위에 그린다) */}
      {conversationId && open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/55" />
          <div className="absolute inset-x-0 bottom-0 top-[14%] border-t-[3px] border-[var(--rk-ink)] bg-[var(--rk-paper)]" onClick={(e) => e.stopPropagation()}>
            {body}
          </div>
        </div>
      )}
    </>
  );
}
