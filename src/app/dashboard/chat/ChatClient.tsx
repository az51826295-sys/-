"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import UnityStrip from "./UnityStrip";
import Link from "next/link";

/**
 * GPT식 대화 화면.
 *
 * 왼쪽에 대화 목록, 가운데에 스레드, 아래에 입력창. 직원이 갈림길을
 * 만나면 열린 질문 대신 선택지 버튼을 내놓고, 매니저는 타이핑 대신
 * 클릭으로 답한다.
 *
 * 대화는 localStorage 에 산다. 한 명이 쓰는 베타에서 서버 저장이
 * 벌어 주는 것이 없고, 마이그레이션 없이 오늘 쓸 수 있는 쪽이 이긴다.
 * 서버로 옮기는 날이 와도 이 컴포넌트는 저장소만 바꾸면 된다.
 */

type EmployeeChip = {
  companyEmployeeId: string;
  name: string;
  role: string;
  workStatus: string;
};

type ChatOption = { label: string; description: string | null };

type Message = {
  role: "user" | "assistant";
  content: string;
  /** 이 턴에 접수된 업무. 스레드에 카드로 남는다. */
  assignment?: { id: string; title: string; queued: boolean } | null;
  /** 클릭으로 답할 수 있는 선택지. 답하고 나면 지운다. */
  options?: ChatOption[] | null;
};

type Conversation = {
  id: string;
  title: string;
  companyEmployeeId: string;
  messages: Message[];
  updatedAt: number;
};

const STORE_KEY = "rookery-chat-v1";

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function ChatClient({
  companyName,
  employees,
}: {
  companyName: string;
  employees: EmployeeChip[];
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState(
    employees[0]?.companyEmployeeId ?? "",
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setConversations(loadConversations());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORE_KEY, JSON.stringify(conversations));
  }, [conversations, hydrated]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const employee = useMemo(
    () =>
      employees.find(
        (e) => e.companyEmployeeId === (active?.companyEmployeeId ?? employeeId),
      ) ?? employees[0],
    [employees, active, employeeId],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, busy]);

  function newChat() {
    setActiveId(null);
    setDraft("");
    inputRef.current?.focus();
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || !employee) return;

    // 선택지는 한 번 답하면 접는다 — 지난 갈림길이 계속 클릭돼 보이면
    // 대화가 어디까지 왔는지 헷갈린다.
    const base = active
      ? {
          ...active,
          messages: active.messages.map((m) => ({ ...m, options: null })),
        }
      : {
          id: crypto.randomUUID(),
          title: content.slice(0, 40),
          companyEmployeeId: employee.companyEmployeeId,
          messages: [] as Message[],
          updatedAt: Date.now(),
        };

    const withUser: Conversation = {
      ...base,
      messages: [...base.messages, { role: "user", content }],
      updatedAt: Date.now(),
    };

    setConversations((prev) => {
      const rest = prev.filter((c) => c.id !== withUser.id);
      return [withUser, ...rest];
    });
    setActiveId(withUser.id);
    setDraft("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyEmployeeId: withUser.companyEmployeeId,
          messages: withUser.messages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        assignment?: Message["assignment"];
        options?: ChatOption[] | null;
        error?: string;
      };

      const assistant: Message = res.ok
        ? {
            role: "assistant",
            content: data.reply ?? "…",
            assignment: data.assignment ?? null,
            options: data.options ?? null,
          }
        : {
            role: "assistant",
            content: data.error ?? "Something went wrong — try again.",
          };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === withUser.id
            ? { ...c, messages: [...c.messages, assistant], updatedAt: Date.now() }
            : c,
        ),
      );
    } catch {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === withUser.id
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  { role: "assistant", content: "Connection hiccup — try again." },
                ],
              }
            : c,
        ),
      );
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function removeConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  return (
    <div className="fixed inset-0 z-40 flex bg-white text-neutral-900">
      {/* ── 사이드바 ─────────────────────────────────────────── */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 md:flex">
        <div className="flex items-center justify-between p-3">
          <Link
            href="/dashboard"
            className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-200"
          >
            ← {companyName}
          </Link>
        </div>
        <div className="px-3 pb-2">
          <button
            onClick={newChat}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-left text-sm font-medium hover:bg-neutral-100"
          >
            + New chat
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {conversations.map((c) => {
            const who = employees.find(
              (e) => e.companyEmployeeId === c.companyEmployeeId,
            );
            return (
              <div key={c.id} className="group relative">
                <button
                  onClick={() => setActiveId(c.id)}
                  className={`w-full truncate rounded-lg px-3 py-2 pr-8 text-left text-sm ${
                    c.id === activeId
                      ? "bg-neutral-200 font-medium"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  <span className="mr-1 text-neutral-400">{who?.name ?? "?"}·</span>
                  {c.title}
                </button>
                <button
                  onClick={() => removeConversation(c.id)}
                  aria-label="Delete conversation"
                  className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-700 group-hover:block"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── 스레드 ───────────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2.5">
          <select
            value={active?.companyEmployeeId ?? employeeId}
            disabled={Boolean(active)}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm font-medium disabled:opacity-70"
          >
            {employees.map((e) => (
              <option key={e.companyEmployeeId} value={e.companyEmployeeId}>
                {e.name} — {e.role}
              </option>
            ))}
          </select>
          {employee && (
            <span className="text-xs text-neutral-400">{employee.workStatus}</span>
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {!active && (
              <div className="mt-24 text-center text-neutral-400">
                <p className="text-2xl font-medium text-neutral-600">
                  {employee ? `${employee.name}에게 말을 걸어 보세요` : "직원이 없습니다"}
                </p>
                <p className="mt-2 text-sm">
                  일을 시키면 접수하고, 갈림길에서는 선택지를 드립니다.
                </p>
              </div>
            )}

            {active?.messages.map((m, i) => (
              <div key={i} className="mb-6">
                {m.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-3xl bg-neutral-100 px-4 py-2.5 whitespace-pre-wrap">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                      {employee?.name.slice(0, 1) ?? "A"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="whitespace-pre-wrap leading-relaxed">
                        {m.content}
                      </div>

                      {m.assignment && (
                        <Link
                          href={`/dashboard/assignments/${m.assignment.id}`}
                          className="mt-3 block rounded-xl border border-neutral-200 p-3 hover:bg-neutral-50"
                        >
                          <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                            {m.assignment.queued ? "Assignment queued" : "Assignment started"}
                          </div>
                          <div className="mt-0.5 truncate font-medium">
                            {m.assignment.title}
                          </div>
                        </Link>
                      )}

                      {m.options && m.options.length > 0 && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {m.options.map((o, j) => (
                            <button
                              key={j}
                              disabled={busy}
                              onClick={() => send(o.label)}
                              className="rounded-xl border border-neutral-300 px-3 py-2.5 text-left text-sm hover:border-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
                            >
                              <div className="font-medium">{o.label}</div>
                              {o.description && (
                                <div className="mt-0.5 text-xs text-neutral-500">
                                  {o.description}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="flex gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                  {employee?.name.slice(0, 1) ?? "A"}
                </div>
                <div className="animate-pulse pt-1 text-neutral-400">…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* ── 입력창 ─────────────────────────────────────────── */}
        <div className="border-t border-neutral-100 px-4 pb-4 pt-2">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-3xl border border-neutral-300 px-4 py-2 shadow-sm focus-within:border-neutral-500">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                rows={1}
                placeholder={
                  employee ? `Message ${employee.name}…` : "고용된 직원이 없습니다"
                }
                className="max-h-40 flex-1 resize-none bg-transparent py-1.5 outline-none"
              />
              <button
                onClick={() => void send(draft)}
                disabled={busy || !draft.trim()}
                aria-label="Send"
                className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-white disabled:opacity-30"
              >
                ↑
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-neutral-400">
              업무 지시는 실제 실행으로 이어지고 회사 지출 한도 안에서 돕니다.
            </p>
          </div>
        </div>
      </main>

      {/* ── 작업 칸 ─────────────────────────────────────────── */}
      {/*
        유니티 일은 **회사의 것**이라 어느 대화를 보고 있든 같은 자리에 있다.
        대화 흐름에 섞지 않은 이유는 두 가지다: 말풍선에 넣으면 브라우저에 사는
        대화와 서버에 사는 세션이 새로고침 한 번에 어긋나고, 십 분짜리 일이
        스크롤 위로 흘러가 버린다.

        좁은 화면에서는 접는다. 폰에서 이 칸이 대화를 반으로 자르면, 정작 말을
        거는 일이 불편해진다.
      */}
      <aside className="hidden w-[360px] shrink-0 border-l border-neutral-200 bg-[#08080c] lg:block">
        <UnityStrip panel />
      </aside>
    </div>
  );
}
