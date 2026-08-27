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

type Mode = "everyday" | "company";

/**
 * 브라우저가 들고 다니는 방문자 표시.
 *
 * 로그인 없이 쓰는 사람을 대충 세기 위한 값이다. 사람을 식별하지 않고, 지우면
 * 초기화된다 — 그래서 이것은 편의이지 방어가 아니며, 진짜 벽은 서버의 일일
 * 총액이다.
 */
function visitorId(): string {
  const KEY = "rookery.visitor";
  try {
    const found = localStorage.getItem(KEY);
    if (found) return found;
    const made = crypto.randomUUID();
    localStorage.setItem(KEY, made);
    return made;
  } catch {
    // 저장이 막힌 브라우저(사생활 모드 등)에서도 대화는 되어야 한다.
    return "no-storage";
  }
}
type Source = { title: string; url: string };
type Option = { label: string; description: string | null };
type Turn = {
  role: "user" | "assistant";
  content: string;
  hired?: { name: string; why: string } | null;
  assignment?: { id: string; title: string; queued: boolean } | null;
  needsOnboarding?: { id: string; name: string } | null;
  options?: Option[] | null;
  sources?: Source[] | null;
  searched?: string[] | null;
  images?: { dataUrl: string; prompt: string }[] | null;
};

export default function AskClient() {
  const [mode, setMode] = useState<Mode>("everyday");
  /** 익명일 때 남은 횟수. 로그인 상태면 null 이라 아무것도 안 보인다. */
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
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
      const res = await fetch(
        mode === "company" ? "/api/company-chat" : "/api/everyday-chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((t) => ({ role: t.role, content: t.content })),
            visitor: visitorId(),
          }),
        },
      );
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
            sources: data.sources,
            searched: data.searched,
            images: data.images,
          },
        ]);
        if (typeof data.turnsLeft === "number") setTurnsLeft(data.turnsLeft);
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
      {/*
        모드 전환은 가운데다.

        왼쪽 위에는 설정(점 세 개)이 떠 있어서, 여기를 왼쪽에 두면 폰에서 둘이
        붙어 잘못 눌린다. 가운데는 엄지에서 가장 먼 대신 오누름이 없다 —
        모드는 자주 바꾸는 것이 아니므로 그쪽이 맞다.
      */}
      <div className="flex justify-center gap-1 pt-3">
        {(
          [
            ["everyday", "일상", "묻고 답합니다. 필요하면 찾아봅니다."],
            ["company", "회사", "사람을 붙이고 업무로 만듭니다."],
          ] as const
        ).map(([key, label, hint]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            title={hint}
            className={
              "rounded-full px-3.5 py-1.5 text-sm " +
              (mode === key
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {turnsLeft !== null && (
        <p className="pt-2 text-center text-xs text-neutral-500">
          로그인 없이 {turnsLeft}번 더 쓸 수 있습니다 ·{" "}
          <a className="underline" href="/login">
            로그인
          </a>
          하면 제한 없이, 대화도 저장됩니다.
        </p>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {turns.length === 0 && (
          <p className="text-sm text-neutral-500">
            {mode === "everyday"
              ? "무엇이든 물어보세요. 최신 사실이 필요하면 찾아본 뒤 출처와 함께 답합니다."
              : "필요한 것을 말씀하세요. 누가 할지는 회사가 정합니다."}
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
            {t.images && t.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {t.images.map((img, k) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={k}
                    src={img.dataUrl}
                    alt={img.prompt}
                    className="max-h-72 rounded-xl border border-neutral-200 dark:border-neutral-800"
                  />
                ))}
              </div>
            )}
            {t.searched && t.searched.length > 0 && (
              <p className="mt-1.5 text-xs text-neutral-500">
                찾아본 것: {t.searched.join(" · ")}
              </p>
            )}
            {t.sources && t.sources.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-neutral-500">
                {t.sources.map((s) => (
                  <li key={s.url}>
                    <a className="underline" href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
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
          placeholder={mode === "everyday" ? "무엇이든 물어보세요" : "무슨 일을 맡길까요?"}
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
