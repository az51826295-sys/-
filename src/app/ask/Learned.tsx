"use client";

import { useCallback, useState } from "react";

/**
 * 배운 것 (109회차 09-14) — 설정 메뉴 안의 한 줄과 창.
 *
 * 규칙 고리가 매일 실패 기록에서 규칙을 제안하고, 따로 떼어 둔 사례로 검증해서 나아질 때만 채택한다. 그 결과가 여기 보인다:
 * 지키는 규칙(검증된 것만, 끌 수 있다) · 최근 시험(채택/떨어짐과 수치) · 매일 실행 기록.
 * 숫자는 숨기지 않는다 — "어긴 11건 중 10건 실패" 가 규칙을 믿을 이유 전부다.
 */
type Counts = { a: number; b: number; c: number; d: number };
type Rule = { id: string; title: string; rule: string; since: string; counts: Counts | null; lift: number | null; p: number | null; holdout: number | null };
type Recent = { id: string; title: string; rule: string; status: string; note: string; counts: Counts | null; lift: number | null; p: number | null; at: string };
type Run = { date: string; status: string; rules: string; prediction: string; video?: string | null; rulers?: string | null };
type Data = { rules: Rule[]; recent: Recent[]; runs: Run[] };

const day = (s: string) => new Date(s).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
const evidence = (c: Counts | null, p: number | null) =>
  c ? `어긴 ${c.a + c.b}건 중 ${c.a}건 실패 · 안 어긴 ${c.c + c.d}건 중 ${c.c}건 실패${p !== null ? ` · 우연일 확률 ${Math.round(p * 100)}%` : ""}` : "";

export default function Learned() {
  const [show, setShow] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/learning", { cache: "no-store" });
      if (!r.ok) throw new Error("불러오지 못했어요.");
      setData((await r.json()) as Data);
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "불러오지 못했어요."); }
  }, []);

  async function turnOff(id: string, title: string) {
    if (busy) return;
    if (!confirm(`"${title}" 규칙을 끌까요? 다음 일부터 안 지켜요. 되돌리려면 말씀해 주세요.`)) return;
    setBusy(id);
    try {
      const r = await fetch("/api/learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ knowledgeId: id }) });
      if (!r.ok) { const j = (await r.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "끄지 못했어요."); return; }
      await load();
    } finally { setBusy(null); }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setShow(true); void load(); }}
        className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--rk-100)]"
      >
        배운 것
        <span className="block text-[11px] text-[var(--rk-400)]">실패 기록에서 찾아 검증한 규칙 · 매일 새벽에 돌아요</span>
      </button>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShow(false)} role="dialog" aria-label="배운 것">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto border-2 border-[#E0703A] bg-[var(--rk-paper)] p-4 text-[var(--rk-ink)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold">배운 것</span>
              <button type="button" onClick={() => setShow(false)} className="text-xs text-[var(--rk-400)] hover:text-[var(--rk-ink)]">닫기</button>
            </div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-[var(--rk-600)]">
              매일 새벽, 실패한 일의 기록에서 규칙을 찾아요. 따로 떼어 둔 사례로 검증해서 실제로 나아질 때만 지키기로 하고, 새 사례가 쌓이면 다시 재요.
            </p>
            {err && <p className="mb-2 text-xs text-[#E0703A]">{err}</p>}
            {!data ? (
              <p className="text-xs text-[var(--rk-600)]">불러오는 중…</p>
            ) : (
              <>
                <h3 className="mb-1 text-xs font-bold">지키는 규칙 {data.rules.length}개</h3>
                {data.rules.length === 0 ? (
                  <p className="mb-3 text-xs text-[var(--rk-600)]">아직 없어요. 검증을 통과한 규칙만 여기 와요.</p>
                ) : (
                  <ul className="mb-3 flex flex-col gap-2">
                    {data.rules.map((r) => (
                      <li key={r.id} className="border-2 border-[var(--rk-ink)] px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-sm font-bold">{r.title}</span>
                            <span className="block text-[12px] leading-relaxed">{r.rule}</span>
                            <span className="mt-1 block text-[11px] text-[var(--rk-600)]">{day(r.since)}부터 · {evidence(r.counts, r.p)}</span>
                          </span>
                          <button type="button" disabled={busy !== null} onClick={() => void turnOff(r.id, r.title)}
                            className="shrink-0 whitespace-nowrap border-2 border-[var(--rk-ink)] px-2 py-1 text-xs hover:bg-[var(--rk-100)] disabled:opacity-50">끄기</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <h3 className="mb-1 text-xs font-bold">최근 시험</h3>
                {data.recent.length === 0 ? (
                  <p className="mb-3 text-xs text-[var(--rk-600)]">아직 없어요. 실패 기록이 2건 이상 쌓이면 시작해요.</p>
                ) : (
                  <ul className="mb-3 flex flex-col gap-1.5">
                    {data.recent.map((c) => (
                      <li key={c.id} className="text-[12px] leading-snug">
                        <span className={c.status === "approved" ? "font-bold text-[#7ED9A0]" : "font-bold text-[var(--rk-400)]"}>{c.status === "approved" ? "채택" : "떨어짐"}</span>
                        <span className="ml-1.5">{c.title}</span>
                        <span className="block text-[11px] text-[var(--rk-600)]">{day(c.at)} · {c.note || evidence(c.counts, c.p)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <h3 className="mb-1 text-xs font-bold">매일 실행</h3>
                {data.runs.length === 0 ? (
                  <p className="text-xs text-[var(--rk-600)]">아직 한 번도 안 돌았어요.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {data.runs.map((r) => (
                      <li key={r.date} className="text-[11.5px] leading-snug text-[var(--rk-600)]">
                        <span className="font-bold text-[var(--rk-ink)]">{r.date.slice(5).replace("-", ".")}</span>
                        <span className="ml-1.5">규칙: {r.rules}</span>
                        <span className="ml-1.5">· 예측: {r.prediction}</span>
                        {r.video && <span className={r.video === "정상" ? "ml-1.5" : "ml-1.5 font-bold text-[#E0703A]"}>· 영상 배관: {r.video}</span>}
                        {r.rulers && <span className="ml-1.5">· 수상한 검사: {r.rulers}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
