"use client";
import { useState } from "react";

/**
 * 팔로우/팔로잉 단추 — 프로필·피드·검색이 같이 쓴다(83회차).
 *
 * 227회차 09-29: 사장님이 *"마음에들면 추가하는거야"* 라고 하셔서 **글자를 고를 수 있게** 했다.
 * 피드·프로필은 인스타 그대로 "팔로우", 검색은 사장님 말 그대로 "추가". 하는 일은 같다.
 */
export default function FollowButton({ characterId, following: f0, name, size = "md", words = ["팔로우", "팔로잉"] }: { characterId: string; following: boolean; name?: string; size?: "sm" | "md"; words?: [string, string] }) {
  const [following, setFollowing] = useState(f0);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return; setBusy(true);
    const next = !following; setFollowing(next);
    try {
      const res = await fetch("/api/dot/follow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ characterId, follow: next }) });
      if (!res.ok) setFollowing(!next);
    } catch { setFollowing(!next); } finally { setBusy(false); }
  }
  return (
    /* `<style>` 가 **단추 안에** 있었다(11-06 화면 점검) — `<button>` 안에 들어갈 수 없는 꼬리표라
       브라우저는 참아 주지만 단추의 글자가 CSS 가 된다: 화면을 글로 읽는 것(자·읽어 주는 기계)에
       단추 이름이 `.fb { border:none;` 으로 보였다. 밖으로 꺼낸다 — 보이는 것은 그대로다. */
    <>
      <style>{CSS}</style>
      <button className={`fb ${size}${following ? " on" : ""}`} onClick={toggle} disabled={busy} aria-pressed={following} aria-label={`${name ?? ""} ${following ? words[1] : words[0]}`}>
        {following ? words[1] : words[0]}
      </button>
    </>
  );
}

const CSS = `
.fb { border:none; border-radius:999px; font:inherit; font-weight:600; cursor:pointer; background:#fee500; color:#1f1a00; }
.fb.md { padding:9px 18px; font-size:14px; }
.fb.sm { padding:6px 12px; font-size:12px; }
.fb.on { background:#eef1f5; color:#5c6570; }
.fb:disabled { opacity:.7; }
`;
