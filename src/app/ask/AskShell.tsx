"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

type Saved = { id: string; title: string | null; mode: string; updated_at: string };
type Task = { id: string; title: string; goal: string | null; updated_at: string };

/**
 * 대화창 위에 얹는 얇은 껍데기 — 왼쪽 위 설정.
 *
 * 대화 화면에는 버튼이 거의 없어야 한다. 그래서 계정·모드 같은 것은 한 곳에
 * 모아 두고, 평소에는 점 세 개만 보인다.
 */

export type Me = { email: string | null } | null;

export default function AskShell({
  me,
  activeTask,
  children,
}: {
  me: Me;
  /** 지금 열려 있는 과제. 없으면 과제 밖의 대화다. */
  activeTask?: { id: string; title: string } | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [inTask, setInTask] = useState<Saved[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const tasksBox = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tasksOpen || !me?.email) return;
    let alive = true;
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setTasks(d.tasks ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tasksOpen, me?.email]);

  useEffect(() => {
    if (!tasksOpen) return;
    const onDown = (e: MouseEvent) => {
      if (tasksBox.current && !tasksBox.current.contains(e.target as Node)) {
        setTasksOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [tasksOpen]);

  // 지금 과제 안에 있으면, 그 안의 대화만 따로 가져온다. 과제의 값어치는
  // 대화를 **덜 보여 주는 것**이라, 이게 없으면 이름표만 붙인 셈이 된다.
  useEffect(() => {
    if (!tasksOpen || !activeTask) return;
    let alive = true;
    fetch(`/api/tasks/${activeTask.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setInTask(d.conversations ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tasksOpen, activeTask]);

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const d = await res.json();
    if (d.task) {
      setTasks((prev) => [d.task, ...prev]);
      setNewTask("");
    }
  }

  // 목록은 **열 때** 가져온다. 화면을 켤 때마다 부르면 대화를 시작할 생각이
  // 없는 사람에게도 요청이 나간다.
  useEffect(() => {
    if (!open || !me?.email) return;
    let alive = true;
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setSaved(d.conversations ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, me?.email]);

  // 바깥을 누르면 닫힌다. 메뉴가 열린 채로 남아 대화를 가리면 안 된다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    // 종이 바탕은 **화면 전체**다. 가운데 칸에만 깔면 좌우가 흰색으로 남아
    // 사무실이 아니라 흰 종이 위에 얹힌 사무실이 된다.
    <div className="relative min-h-screen bg-[var(--rk-paper)]">
      <div ref={box} className="absolute left-3 top-3 z-20">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="설정"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          <Icon name="settings" size={18} />
        </button>

        {open && (
          <div className="mt-1 w-60 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
            {me?.email ? (
              <>
                {/*
                  섹션을 나눈다.

                  로그아웃과 지난 대화가 한 덩어리에 붙어 있으면, 대화를 고르려다
                  로그아웃을 누르는 일이 생긴다 — 특히 폰에서. 성격이 다른 것은
                  선으로 갈라 놓고, 되돌릴 수 없는 것(로그아웃)은 맨 아래 따로 둔다.
                */}
                <section>
                  <p className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wide text-neutral-400">
                    <Icon name="history" size={12} />대화
                  </p>
                  <a
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                    href="/ask"
                  >
                    <span className="flex items-center gap-2">
                      <Icon name="chat" size={16} />새 대화
                    </span>
                  </a>
                  {saved.length > 0 && (
                    <ul className="max-h-56 overflow-y-auto">
                      {saved.map((c) => (
                        <li key={c.id}>
                          <a
                            href={`/ask?c=${c.id}`}
                            className="block truncate rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
                          >
                            {c.title || "(제목 없음)"}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="mt-1 border-t border-neutral-200 pt-1 dark:border-neutral-800">
                  <p className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-neutral-400">
                    회사
                  </p>
                  <a
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                    href="/dashboard"
                  >
                    <span className="flex items-center gap-2">
                      <Icon name="company" size={16} />직원과 업무
                    </span>
                  </a>
                </section>

                <section className="mt-1 border-t border-neutral-200 pt-1 dark:border-neutral-800">
                  <p className="truncate px-3 py-1.5 text-[11px] text-neutral-400">
                    {me.email}
                  </p>
                  <form action="/api/auth/signout" method="post">
                    <button
                      type="submit"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="signout" size={16} />로그아웃
                      </span>
                    </button>
                  </form>
                </section>
              </>
            ) : (
              <>
                <p className="px-3 py-2 text-xs text-neutral-500">
                  로그인하면 제한 없이 쓰고, 대화가 저장됩니다.
                </p>
                <a
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  href="/login"
                >
                  로그인
                </a>
                <a
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  href="/signup"
                >
                  가입하기
                </a>
              </>
            )}
          </div>
        )}
      </div>

      {/*
        과제는 **오른쪽 위**다.

        왼쪽 위는 계정과 지난 대화 — 내가 누구인지, 전에 뭘 했는지. 과제는
        지금 무엇을 하는 중인지이고, 성격이 다르므로 반대편에 둔다. 한쪽에
        다 모으면 대화 화면 한 귀퉁이가 메뉴 덩어리가 된다.
      */}
      <div ref={tasksBox} className="absolute right-3 top-3 z-20">
        <button
          onClick={() => setTasksOpen((v) => !v)}
          className="rounded-full px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          과제
        </button>

        {tasksOpen && (
          <div className="absolute right-0 mt-1 w-64 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
            {me?.email ? (
              <>
                {activeTask && (
                  <div className="border-b border-neutral-200 pb-1.5 dark:border-neutral-800">
                    <p className="px-3 pt-1.5 text-xs font-medium">
                      {activeTask.title}
                    </p>
                    {inTask.length === 0 ? (
                      <p className="px-3 py-1 text-xs text-neutral-500">
                        아직 이 과제의 대화가 없습니다.
                      </p>
                    ) : (
                      <ul className="max-h-40 overflow-y-auto">
                        {inTask.map((c) => (
                          <li key={c.id}>
                            <a
                              href={`/ask?task=${activeTask.id}&c=${c.id}`}
                              className="block truncate rounded-lg px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
                            >
                              {c.title ?? "제목 없음"}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    <a
                      href={`/ask?task=${activeTask.id}`}
                      className="block rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                    >
                      + 이 과제에서 새 대화
                    </a>
                  </div>
                )}
                <div className="flex gap-1 p-1">
                  <input
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addTask();
                    }}
                    placeholder="새 과제"
                    className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                  />
                  <button
                    onClick={() => void addTask()}
                    className="rounded-lg px-2.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  >
                    +
                  </button>
                </div>

                {tasks.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-neutral-500">
                    아직 과제가 없습니다. 여러 번에 걸쳐 할 일을 하나 만들면 그
                    안의 대화가 따로 모입니다.
                  </p>
                ) : (
                  <ul className="max-h-72 overflow-y-auto">
                    {tasks.map((t) => (
                      <li key={t.id}>
                        <a
                          href={`/ask?task=${t.id}`}
                          className="block truncate rounded-lg px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                        >
                          {t.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="px-3 py-2 text-xs text-neutral-500">
                <a className="underline" href="/login">
                  로그인
                </a>
                하면 과제로 대화를 묶을 수 있습니다.
              </p>
            )}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}
