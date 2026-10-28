"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * **처음 온 사람에게 자리를 만들어 준다** (10-28).
 *
 * 두근도트는 로그인 없이 쓰는 앱인데 익명 세션을 만드는 곳이 없었다. 그래서 입력칸이
 * 꺼진 채로 있었고, 사장님이 *"버튼이 안 눌려"* 라고 하셨다.
 *
 * `signedIn` 은 **서버가 그린 사실**이다 — 서버가 "없다" 고 한 때만 만든다.
 * 클라이언트에서 혼자 짐작하면 이미 있는 사람에게도 부르게 된다.
 *
 * 만든 뒤 **한 번 다시 그린다.** 지금 화면은 "사람 없음" 으로 그려져 있어서
 * 다시 그리지 않으면 자리는 생겼는데 입력칸은 그대로 꺼져 있다.
 */
export default function GuestSession({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (signedIn) return;
    let 살아있음 = true;
    (async () => {
      try {
        const r = await fetch("/api/dot/guest", { method: "POST" });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; 새로만듦?: boolean };
        if (살아있음 && j.ok && j.새로만듦) router.refresh();
      } catch { /* 인터넷이 없으면 다음에 열 때 다시 한다 */ }
    })();
    return () => { 살아있음 = false; };
  }, [signedIn, router]);
  return null;
}
