"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

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
  /** 지금 열려 있는 과제. 없으면 과제 밖의 대화다. */
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
    // 종이 바탕은 **화면 전체**다. 가운데 칸에만 깔면 좌우가 흰색으로 남아
    // 사무실이 아니라 흰 종이 위에 얹힌 사무실이 된다.
    <div className="relative min-h-screen bg-[var(--rk-paper)]">
      <div ref={box} className="absolute left-3 top-3 z-20">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="설정"
          className="flex h-9 w-9 items-center justify-center text-[var(--rk-600)] hover:bg-[var(--rk-100)]"
        >
          <Icon name="settings" size={18} />
        </button>

        {open && (
          <div className="mt-1 w-60 border-2 border-[var(--rk-ink)] bg-[var(--rk-paper)] p-1.5 text-[var(--rk-ink)]">
            {me?.email ? (
              <>
                {/*
                  섹션을 나눈다.

                  로그아웃과 지난 대화가 한 덩어리에 붙어 있으면, 대화를 고르려다
                  로그아웃을 누르는 일이 생긴다 — 특히 폰에서. 성격이 다른 것은
                  선으로 갈라 놓고, 되돌릴 수 없는 것(로그아웃)은 맨 아래 따로 둔다.
                */}
                <section>
                  <p className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wide text-[var(--rk-400)]">
                    <Icon name="history" size={12} />대화
                  </p>
                  <a
                    className="block px-3 py-2 text-sm hover:bg-[var(--rk-100)]"
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
                            className="block truncate px-3 py-1.5 text-sm text-[var(--rk-600)] hover:bg-[var(--rk-100)] dark:text-[var(--rk-400)] dark:hover:bg-neutral-900"
                          >
                            {c.title || "(제목 없음)"}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="mt-1 border-t border-[var(--rk-200)] pt-1">
                  <p className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-[var(--rk-400)]">
                    회사
                  </p>
                  <a
                    className="block px-3 py-2 text-sm hover:bg-[var(--rk-100)]"
                    href="/dashboard"
                  >
                    <span className="flex items-center gap-2">
                      <Icon name="company" size={16} />직원과 업무
                    </span>
                  </a>
                </section>

                <section className="mt-1 border-t border-[var(--rk-200)] pt-1">
                  <p className="truncate px-3 py-1.5 text-[11px] text-[var(--rk-400)]">
                    {me.email}
                  </p>
                  <form action="/api/auth/signout" method="post">
                    <button
                      type="submit"
                      className="w-full px-3 py-2 text-left text-sm text-[var(--rk-600)] hover:bg-[var(--rk-100)]"
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
                <p className="px-3 py-2 text-xs text-[var(--rk-600)]">
                  로그인하면 제한 없이 쓰고, 대화가 저장됩니다.
                </p>
                <a
                  className="block px-3 py-2 text-sm hover:bg-[var(--rk-100)]"
                  href="/login"
                >
                  로그인
                </a>
                <a
                  className="block px-3 py-2 text-sm hover:bg-[var(--rk-100)]"
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
      {/*
        과제 버튼을 뺐다 (09-03 사장님: "과제창 일단 없애자", "그냥 대화하자").

        과제는 여러 번에 걸쳐 하는 일을 묶는 자리였는데, 대화 화면 귀퉁이에
        떠 있으니 **대화보다 먼저 눈에 들어왔다.** 이 화면의 일은 대화지
        관리가 아니다.

        지운 것은 버튼뿐이다 — 과제는 표에 그대로 있고 `/ask?task=<id>` 로
        열린다. 다시 붙일 자리가 생기면 이 주석을 지우고 되살리면 된다
        (git: 15ff06e 이전).
      */}

      {children}
    </div>
  );
}
