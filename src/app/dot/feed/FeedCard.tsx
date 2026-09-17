"use client";
import { useEffect, useState } from "react";

import Link from "next/link";
import FollowButton from "../FollowButton";

export type FeedPost = { id: number; image: string; caption: string; likes: number; at: string; slug: string; name: string; avatar: string; characterId: string; following: boolean };

/** 게시물 카드 — 좋아요(한 번), 답장(그 게시물을 들고 방으로). 시각은 붙은 뒤에만(하이드레이션). */
export default function FeedCard({ post, liked: liked0, signedIn }: { post: FeedPost; liked: boolean; signedIn: boolean }) {
  const [liked, setLiked] = useState(liked0);
  const [likes, setLikes] = useState(post.likes);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  async function like() {
    if (liked || !signedIn) return;
    setLiked(true); setLikes((n) => n + 1);
    try { navigator.vibrate?.(8); } catch { /* 없음 */ }
    const res = await fetch("/api/dot/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postId: post.id }) });
    if (!res.ok) { setLiked(false); setLikes((n) => n - 1); }
  }
  const when = mounted ? ago(post.at) : "";

  return (
    <article className="fc">
      <div className="fc-head">
        {post.avatar ? <img className="fc-avatar" src={post.avatar} alt="" /> : <span className="fc-avatar" />}
        <Link className="fc-name" href={`/dot/${post.slug}/profile`}>{post.name}</Link>
        <span className="fc-when">{when}</span>
        {signedIn && <FollowButton characterId={post.characterId} following={post.following} name={post.name} size="sm" />}
      </div>
      <img className="fc-img" src={post.image} alt={post.caption} />
      <div className="fc-actions">
        <button className={`fc-like${liked ? " on" : ""}`} onClick={like} aria-pressed={liked} aria-label="좋아요">
          <span className="heart">{liked ? "♥" : "♡"}</span>{likes > 0 ? likes : ""}
        </button>
        {/* 09-12 사장님 "채팅이랑 답장 똑같은 말 아니야?" — 하나로. 채팅은 이 게시물을 들고 방으로 간다. */}
        <Link className="fc-reply" href={`/dot/${post.slug}?post=${post.id}`}>채팅</Link>
      </div>
      <div className="fc-cap"><b>{post.name}</b>{post.caption}</div>
    </article>
  );
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60); if (h < 24) return `${h}시간 전`;
  const d = Math.round(h / 24); return d === 1 ? "어제" : `${d}일 전`;
}
