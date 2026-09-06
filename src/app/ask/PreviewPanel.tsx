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
  versions: { n: number; deliverableId: string; title: string; kind: string; who: string | null; current: boolean; at: string }[];
  current: {
    n: number; deliverableId: string; title: string; kind: string; ruler: string; who: string | null; at: string;
    verdict: string | null; checks: { name: string; result: string; message: string }[]; checkedAt: string | null;
    photos: { title: string; href: string }[]; files: { name: string; href: string }[];
  } | null;
  spend: { monthUsd: number; meshyCredits: number | null; note: string };
};

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
    ? `미리보기 · v${cur.n} ${cur.title}` + (cur.checks.length ? ` · 통과 ${cur.checks.filter((c) => c.result === "통과").length}` : "")
    : working ? `작업 중 · ${working}` : "미리보기 · 아직 결과가 없어요";
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
  open,
  onOpenChange,
  onReverted,
}: {
  conversationId: string | null;
  preview: ReturnType<typeof usePreview>;
  /** 지금 도는 일의 단계(있으면). */
  steps: Record<string, string>;
  /** 폰에서 판이 올라온 상태. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReverted?: () => void;
}) {
  const { data, setData, load } = preview;
  const setOpen = onOpenChange;
  const [busy, setBusy] = useState<string | null>(null);

  async function revert(deliverableId: string, n: number) {
    if (!conversationId || busy) return;
    if (!confirm(`v${n} 으로 복원할까요? 다음 수정은 그 버전 위에서 해요.`)) return;
    setBusy(deliverableId);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/revert`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliverableId }),
      });
      if (r.ok) { setData(await load()); onReverted?.(); }
    } finally { setBusy(null); }
  }

  const working = Object.values(steps)[0];
  const cur = data?.current ?? null;

  const body = (
    <div className="flex h-full flex-col text-sm">
      <div className="flex items-baseline justify-between border-b-2 border-[var(--rk-ink)] px-3.5 py-2.5">
        <span className="font-bold">{cur ? `미리보기 · v${cur.n}` : "미리보기"}</span>
        <span className="text-[11px] text-[var(--rk-600)]">
          {cur ? [cur.kind, cur.who, new Date(cur.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · ") : ""}
          <button type="button" className="ml-3 lg:hidden" onClick={() => setOpen(false)}>▼ 닫기</button>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!cur && (
          <p className="px-3.5 py-6 text-xs text-[var(--rk-600)]">
            {working ? `${working}… 끝나면 여기 나타나요.` : "일을 시키면 결과가 여기 나타나요. 화면, 검사 결과, 버전 기록."}
          </p>
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
        {cur && cur.checks.length > 0 && (
          <section className="border-b border-[var(--rk-200)] px-3.5 py-2.5">
            <div className="mb-1.5 text-[11px] text-[var(--rk-600)]">
              검사 결과 — 통과 {cur.checks.filter((c) => c.result === "통과").length} · 실패 {cur.checks.filter((c) => c.result === "실패").length} · 해당 없음 {cur.checks.filter((c) => c.result === "해당 없음").length}
            </div>
            {cur.checks.map((c) => (
              <div key={c.name} className={"text-xs " + (c.result === "통과" ? "text-[#7ED9A0]" : c.result === "실패" ? "text-[#E07070]" : "text-[var(--rk-400)]")} title={c.message}>
                {c.result === "통과" ? "✓" : c.result === "실패" ? "✗" : "–"} {c.name}{c.message && c.result !== "통과" ? ` (${c.message.slice(0, 60)})` : ""}
              </div>
            ))}
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
        {data && data.versions.length > 0 && (
          <section className="border-b border-[var(--rk-200)] px-3.5 py-2.5">
            <div className="mb-1.5 text-[11px] text-[var(--rk-600)]">버전 기록 — 누르면 그 버전으로 복원해요</div>
            <div className="flex flex-wrap gap-1.5">
              {data.versions.map((v) => (
                <button
                  key={v.deliverableId}
                  type="button"
                  disabled={v.current || busy !== null}
                  onClick={() => void revert(v.deliverableId, v.n)}
                  title={`${v.kind} · ${v.who ?? ""} · ${v.title}`}
                  className={"border-2 px-2 py-0.5 text-xs " + (v.current ? "border-[#E0703A] text-[var(--rk-ink)]" : "border-[var(--rk-200)] text-[var(--rk-600)] hover:border-[var(--rk-ink)] hover:text-[var(--rk-ink)]")}
                >
                  v{v.n} {v.title.slice(0, 14)}{v.title.length > 14 ? "…" : ""}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      {data && (
        <div className="flex justify-between border-t-2 border-[var(--rk-ink)] px-3.5 py-2 text-[11px] text-[var(--rk-600)]" title={data.spend.note}>
          <span>이번 달 사용 <b className="text-[var(--rk-ink)]">${data.spend.monthUsd.toFixed(2)}</b></span>
          <span>Meshy 크레딧 <b className="text-[var(--rk-ink)]">{data.spend.meshyCredits === null ? "—" : data.spend.meshyCredits.toLocaleString()}</b></span>
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
