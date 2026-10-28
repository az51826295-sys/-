"use client";
import { useEffect, useState } from "react";

import Link from "next/link";
import FollowButton from "../FollowButton";
import { t, likesLine, agoLine, type Lang } from "@/lib/dot/lang";

export type FeedPost = { id: number; image: string; caption: string; likes: number; at: string; slug: string; name: string; avatar: string; characterId: string; following: boolean };

/** 게시물 카드 — 좋아요(한 번), 답장(그 게시물을 들고 방으로). 시각은 붙은 뒤에만(하이드레이션). */
export default function FeedCard({ post, liked: liked0, signedIn, lang = "ko" }: { post: FeedPost; liked: boolean; signedIn: boolean; lang?: Lang }) {
  const [liked, setLiked] = useState(liked0);
  const [likes, setLikes] = useState(post.likes);
  const [mounted, setMounted] = useState(false);
  const [그림깨짐, 그림깨짐설정] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  async function like() {
    if (liked || !signedIn) return;
    setLiked(true); setLikes((n) => n + 1);
    try { navigator.vibrate?.(8); } catch { /* 없음 */ }
    const res = await fetch("/api/dot/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postId: post.id }) });
    if (!res.ok) { setLiked(false); setLikes((n) => n - 1); }
  }
  const when = mounted ? agoLine(Date.parse(post.at), lang) : "";

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
      {/**
        * 10-24: 이사 뒤 사진 111장이 **죽은 주소**를 가리킨다(옛 스토리지, 10-27 에 가져온다).
        * 그대로 두면 피드가 **깨진 그림 아이콘 벽**이 된다 — 글은 멀쩡한데 앱이 고장난 것처럼 보인다.
        * 그래서 못 받아 온 사진은 **칸째 숨기고 글만 남긴다.** 없는 것을 있는 척하지 않는다.
        */}
      {!그림깨짐 && <img className="fc-img" src={post.image} alt={post.caption} onError={() => 그림깨짐설정(true)} />}
      <div className="fc-actions">
        <button className={`fc-like${liked ? " on" : ""}`} onClick={like} aria-pressed={liked} aria-label={t("feed_like", lang)}>
          <span className="heart">{liked ? "♥" : "♡"}</span>
        </button>
        {/* 09-12 사장님 "채팅이랑 답장 똑같은 말 아니야?" — 하나로. 채팅은 이 게시물을 들고 방으로 간다. */}
        <Link className="fc-reply" href={`/dot/${post.slug}?post=${post.id}`}>{t("feed_chat", lang)}</Link>
      </div>
      {likes > 0 && <div className="fc-likes">{likesLine(likes, lang)}</div>}
      <div className="fc-cap"><b>{post.name}</b>{post.caption}</div>
    </article>
  );
}

/* 10-28: "N분 전" 은 lang.agoLine 이 만든다 — 영어는 하나일 때 글자가 달라서(1 minute)
   화면마다 따로 쓰면 "1 minutes ago" 가 나온다. */
