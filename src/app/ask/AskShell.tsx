"use client";

import { useEffect, useRef, useState } from "react";

type Saved = { id: string; title: string | null; mode: string; updated_at: string };

/**
 * 대화창 위에 얹는 얇은 껍데기 — 왼쪽 위 설정.
 *
 * 대화 화면에는 버튼이 거의 없어야 한다. 그래서 계정·모드 같은 것은 한 곳에
 * 모아 두고, 평소에는 점 세 개만 보인다.
 */

export type Me = { email: string | null } | null;

export default function AskShell({
  me,
  children,
}: {
  me: Me;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const box = useRef<HTMLDivElement>(null);

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
    <div className="relative">
      <div ref={box} className="absolute left-3 top-3 z-20">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="설정"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>

        {open && (
          <div className="mt-1 w-60 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
            {me?.email ? (
              <>
                <p className="truncate px-3 py-2 text-xs text-neutral-500">
                  {me.email}
                </p>
                <a
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  href="/ask"
                >
                  새 대화
                </a>
                <a
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  href="/dashboard"
                >
                  회사 관리
                </a>

                {saved.length > 0 && (
                  <div className="mt-1 border-t border-neutral-200 pt-1 dark:border-neutral-800">
                    <p className="px-3 py-1 text-xs text-neutral-500">지난 대화</p>
                    <ul className="max-h-64 overflow-y-auto">
                      {saved.map((c) => (
                        <li key={c.id}>
                          <a
                            href={`/ask?c=${c.id}`}
                            className="block truncate rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                          >
                            {c.title || "(제목 없음)"}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <form action="/api/auth/signout" method="post">
                  <button
                    type="submit"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  >
                    로그아웃
                  </button>
                </form>
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

      {children}
    </div>
  );
}
