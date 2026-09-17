"use client";
import { useState } from "react";

/** 팔로우/팔로잉 단추 — 프로필·피드·친구 목록이 같이 쓴다(83회차). */
export default function FollowButton({ characterId, following: f0, name, size = "md" }: { characterId: string; following: boolean; name?: string; size?: "sm" | "md" }) {
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
    <button className={`fb ${size}${following ? " on" : ""}`} onClick={toggle} disabled={busy} aria-pressed={following} aria-label={`${name ?? ""} ${following ? "팔로잉" : "팔로우"}`}>
      <style>{CSS}</style>
      {following ? "팔로잉" : "팔로우"}
    </button>
  );
}

const CSS = `
.fb { border:none; border-radius:999px; font:inherit; font-weight:600; cursor:pointer; background:#fee500; color:#1f1a00; }
.fb.md { padding:9px 18px; font-size:14px; }
.fb.sm { padding:6px 12px; font-size:12px; }
.fb.on { background:#eef1f5; color:#5c6570; }
.fb:disabled { opacity:.7; }
`;
