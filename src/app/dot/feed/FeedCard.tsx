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
      {/*
        227회차 09-29 사장님 "인스타 모방해라" — 인스타 카드의 순서를 그대로 따른다:
        ① 동그란 아바타 + 이름 · 시간   ② 사진   ③ 하트(숫자 없이)   ④ "좋아요 N개"   ⑤ 이름 + 캡션
        숫자를 하트 옆에서 떼어 **아래 제 줄로** 옮긴 것이 핵심이다. 인스타가 그렇게 하는 이유가 있다 —
        하트는 누르는 것이고 숫자는 읽는 것이라, 붙여 두면 누를 자리가 글자만큼 커졌다 작아졌다 한다.
      */}
      <div className="fc-head">
        {post.avatar ? <img className="fc-avatar" src={post.avatar} alt="" /> : <span className="fc-avatar" />}
        <Link className="fc-name" href={`/dot/${post.slug}/profile`}>{post.name}</Link>
        {when && <span className="fc-dot">·</span>}
        <span className="fc-when">{when}</span>
        {signedIn && <span className="fc-fb"><FollowButton characterId={post.characterId} following={post.following} name={post.name} size="sm" /></span>}
      </div>
      <img className="fc-img" src={post.image} alt={post.caption} />
      <div className="fc-actions">
        <button className={`fc-like${liked ? " on" : ""}`} onClick={like} aria-pressed={liked} aria-label="좋아요">
          <span className="heart">{liked ? "♥" : "♡"}</span>
        </button>
        {/* 09-12 사장님 "채팅이랑 답장 똑같은 말 아니야?" — 하나로. 채팅은 이 게시물을 들고 방으로 간다. */}
        <Link className="fc-reply" href={`/dot/${post.slug}?post=${post.id}`}>채팅</Link>
      </div>
      {likes > 0 && <div className="fc-likes">좋아요 {likes}개</div>}
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
