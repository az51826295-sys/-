"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import BuyCredits from "./BuyCredits";
import Learned from "./Learned";

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
  /** 지우려고 한 번 누른 대화. 두 번째 눌러야 지워진다. */
  const [killing, setKilling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** 폰으로 이어하기(99회차): 서버가 만든 QR 과 만료 시각. */
  const [handoff, setHandoff] = useState<{ svg: string; until: number } | null>(null);
  const [handoffErr, setHandoffErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!handoff) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [handoff]);

  /** QR 을 새로 받는다. 지금 보고 있는 대화가 있으면 폰에서도 그 대화로 열린다. */
  async function openHandoff() {
    setHandoffErr(null);
    const conversationId = new URLSearchParams(window.location.search).get("c");
    try {
      const r = await fetch("/api/handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId }) });
      const j = (await r.json().catch(() => ({}))) as { svg?: string; expiresInSec?: number; error?: string };
      if (!r.ok || !j.svg) { setHandoffErr(j.error ?? "QR 을 만들지 못했어요."); return; }
      setNow(Date.now());
      setHandoff({ svg: j.svg, until: Date.now() + (j.expiresInSec ?? 120) * 1000 });
    } catch { setHandoffErr("QR 을 만들지 못했어요."); }
  }

  /** 계정 삭제 — 구글 플레이 등록 필수(97회차). 되돌릴 수 없다. 두 번 묻고, 문구를 치게 한다. */
  async function deleteAccount() {
    if (!window.confirm("계정을 지우면 회사·직원·대화·산출물이 전부 사라지고 되돌릴 수 없어요. 계속할까요?")) return;
    const typed = window.prompt("정말 지우려면 '삭제' 라고 적어 주세요.");
    if (typed !== "삭제") return;
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "삭제" }) });
      if (res.ok) window.location.href = "/login?message=" + encodeURIComponent("계정이 지워졌어요. 그동안 고마웠어요.");
      else setDeleting(false);
    } catch { setDeleting(false); }
  }

  /**
   * 대화를 지운다. **두 번 눌러야** 지워진다.
   *
   * 09-03 사장님 지시로 붙였다. 지우는 문(`DELETE /api/conversations/[id]`)은
   * 이미 있었고 화면에 손잡이만 없었다.
   *
   * 지워졌다고 말하기 전에 서버가 됐다고 해야 목록에서 뺀다 — 화면에서 먼저
   * 지우면 실패했을 때 "지워진 줄 알았는데 남아 있는" 상태가 된다.
   */
  async function removeSaved(id: string) {
    if (killing !== id) {
      setKilling(id);
      // 물어본 채로 두면 다음에 눌렀을 때 무엇을 지우는지 잊는다.
      setTimeout(() => setKilling((v) => (v === id ? null : v)), 4000);
      return;
    }
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (res.ok) setSaved((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // 못 지웠으면 목록에 그대로 둔다. 조용히 사라지는 것이 더 나쁘다.
    } finally {
      setKilling(null);
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
                        <li
                          key={c.id}
                          className="group flex items-center hover:bg-[var(--rk-100)] dark:hover:bg-neutral-900"
                        >
                          <a
                            href={`/ask?c=${c.id}`}
                            className="min-w-0 flex-1 truncate px-3 py-1.5 text-sm text-[var(--rk-600)] dark:text-[var(--rk-400)]"
                          >
                            {c.title || "(제목 없음)"}
                          </a>
                          {/*
                            지우기는 **가리켰을 때만** 보인다. 목록마다 ✕ 가
                            늘 떠 있으면 고르러 왔다가 지우게 된다.

                            한 번 더 묻는다. 대화는 되돌릴 수 없고, 손이
                            미끄러진 것과 지우려던 것은 구분이 안 된다.
                          */}
                          <button
                            type="button"
                            title="이 대화 지우기"
                            onClick={() => void removeSaved(c.id)}
                            className="shrink-0 px-2.5 py-1.5 text-xs text-[var(--rk-400)] opacity-0 hover:text-[var(--rk-ink)] focus:opacity-100 group-hover:opacity-100 dark:hover:text-white"
                          >
                            {killing === c.id ? "정말?" : "✕"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>


                <section className="mt-1 border-t border-[var(--rk-200)] pt-1">
                  <p className="truncate px-3 py-1.5 text-[11px] text-[var(--rk-400)]">
                    {me.email}
                  </p>
                  <BuyCredits />
                  <Learned />
                  <button
                    type="button"
                    onClick={() => void openHandoff()}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--rk-100)]"
                  >
                    폰으로 이어하기
                    <span className="block text-[11px] text-[var(--rk-400)]">QR 을 찍으면 폰 앱이 이 계정으로 열려요</span>
                  </button>
                  {(handoff || handoffErr) && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => { setHandoff(null); setHandoffErr(null); }} role="dialog" aria-label="폰으로 이어하기">
                      <div className="w-full max-w-xs border-2 border-[#E0703A] bg-[var(--rk-paper)] p-4 text-[var(--rk-ink)]" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-1 text-sm font-bold">폰으로 이어하기</div>
                        {handoffErr ? (
                          <p className="text-xs text-[#E07070]">{handoffErr}</p>
                        ) : handoff && now < handoff.until ? (
                          <>
                            <p className="mb-3 text-[11.5px] leading-relaxed text-[var(--rk-600)]">
                              폰 카메라로 찍으면 비밀번호 없이 이 계정으로 로키 앱이 열려요.
                              <b className="text-[var(--rk-ink)]"> 한 번만, {Math.ceil((handoff.until - now) / 1000)}초 안에</b> 쓸 수 있어요. 남에게 보여 주지 마세요.
                            </p>
                            {/* 서버가 우리 주소로만 만든 SVG(qrcode 라이브러리). 흰 바탕이어야 카메라가 읽는다. */}
                            <div className="mx-auto w-56 bg-white p-2" dangerouslySetInnerHTML={{ __html: handoff.svg }} />
                          </>
                        ) : (
                          <p className="text-xs text-[var(--rk-600)]">QR 이 만료됐어요.</p>
                        )}
                        <div className="mt-3 flex justify-end gap-2">
                          {(!handoff || now >= handoff.until || handoffErr) && (
                            <button type="button" onClick={() => void openHandoff()} className="border-2 border-[#E0703A] bg-[#E0703A] px-2.5 py-1 text-xs font-bold text-[var(--rk-paper)]">새로 만들기</button>
                          )}
                          <button type="button" onClick={() => { setHandoff(null); setHandoffErr(null); }} className="border-2 border-[var(--rk-ink)] px-2.5 py-1 text-xs">닫기</button>
                        </div>
                      </div>
                    </div>
                  )}
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
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void deleteAccount()}
                    className="w-full px-3 py-2 text-left text-sm text-[#E07070] hover:bg-[var(--rk-100)] disabled:opacity-50"
                  >
                    {deleting ? "지우는 중…" : "계정 삭제"}
                  </button>
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
