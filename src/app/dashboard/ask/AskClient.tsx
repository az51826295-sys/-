"use client";

import { useRef, useState } from "react";
import Link from "next/link";

/**
 * 회사에게 말을 거는 화면.
 *
 * 직원을 고르는 자리가 없다. 그게 이 화면의 전부다 — 매니저는 필요한 것을
 * 말하고, 누구를 뽑을지와 누가 할지는 회사가 정한다. 무슨 일이 있었는지는
 * 대화 안에 조용히 적힌다("Maya 를 뽑았습니다", "업무를 만들었습니다")
 * — 사람이 다음에 무엇을 눌러야 하는지 알 수 있을 만큼만.
 */

type Option = { label: string; description: string | null };
type Turn = {
  role: "user" | "assistant";
  content: string;
  hired?: { name: string; why: string } | null;
  assignment?: { id: string; title: string; queued: boolean } | null;
  needsOnboarding?: { id: string; name: string } | null;
  options?: Option[] | null;
};

export default function AskClient() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    const history = [...turns, { role: "user" as const, content: message }];
    setTurns(history);
    setText("");

    try {
      const res = await fetch("/api/company-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTurns([...history, { role: "assistant", content: data.error ?? "문제가 생겼습니다." }]);
      } else {
        setTurns([
          ...history,
          {
            role: "assistant",
            content: data.reply,
            hired: data.hired,
            assignment: data.assignment,
            needsOnboarding: data.needsOnboarding,
            options: data.options,
          },
        ]);
      }
    } catch {
      setTurns([...history, { role: "assistant", content: "연결이 끊겼습니다." }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    }
  }

  const last = turns[turns.length - 1];

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col px-4">
      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {turns.length === 0 && (
          <p className="text-sm text-neutral-500">
            필요한 것을 말씀하세요. 누가 할지는 회사가 정합니다.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <div
              className={
                "inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm " +
                (t.role === "user"
                  ? "bg-neutral-800 text-neutral-100"
                  : "bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100")
              }
            >
              {t.content}
            </div>
            {t.hired && (
              <p className="mt-1.5 text-xs text-neutral-500">
                {t.hired.name} 고용 — {t.hired.why}
              </p>
            )}
            {t.assignment && (
              <p className="mt-1.5 text-xs text-neutral-500">
                업무 생성: {t.assignment.title}
                {t.assignment.queued ? " (대기열에 넣음)" : ""}{" "}
                <Link className="underline" href={`/dashboard/assignments`}>
                  보기
                </Link>
              </p>
            )}
            {t.needsOnboarding && (
              <p className="mt-1.5 text-xs text-amber-600">
                <Link className="underline" href={`/dashboard/employees/${t.needsOnboarding.id}`}>
                  {t.needsOnboarding.name} 교육 마치기
                </Link>{" "}
                — 끝나야 일을 받을 수 있습니다.
              </p>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-neutral-500">…</p>}
        <div ref={endRef} />
      </div>

      {last?.options && last.options.length > 0 && !busy && (
        <div className="flex flex-wrap gap-2 pb-3">
          {last.options.map((o) => (
            <button
              key={o.label}
              onClick={() => send(o.label)}
              title={o.description ?? undefined}
              className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex gap-2 border-t border-neutral-200 py-3 dark:border-neutral-800"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="무엇을 도와드릴까요?"
          className="flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          disabled={busy || !text.trim()}
          className="rounded-xl bg-neutral-900 px-5 text-sm font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
        >
          보내기
        </button>
      </form>
    </div>
  );
}
