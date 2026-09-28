"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import FollowButton from "../FollowButton";

/**
 * 검색 — 인스타 돋보기 탭의 그 결 (227회차 09-29).
 *
 * 인스타는 검색창이 비어 있을 때 **빈 화면이 아니라 탐색 격자**를 보여 준다. 그게 핵심이다 —
 * 사람들은 대개 찾을 이름을 모르고, 보다가 마음에 드는 걸 누른다. 그래서 여기도 똑같이:
 *   · 검색창이 비면 → **타일 격자**(전부, 아직 안 넣은 사람이 위로)
 *   · 글자를 치면 → 이름·한 줄 소개·첫마디에서 찾아 **목록**으로
 *
 * 캐릭터가 아직 몇 명뿐이라 **찾기는 이 화면 안에서 한다**(서버에 다시 안 묻는다).
 * 한 번 받아 둔 목록에서 거르는 것이라 글자를 칠 때마다 즉시 바뀐다. 수백 명이 되면
 * 그때 서버로 옮긴다 — 지금 옮기면 왕복만 늘고 느려진다([[felt-latency-is-first-token]]).
 */
export type SearchItem = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  greeting: string;
  avatar: string;
  following: boolean;
};

/** 띄어쓰기·대소문자를 무시하고 견준다. "유 나" 로 쳐도 유나가 나오게. */
const 납작 = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export default function SearchList({ items }: { items: SearchItem[] }) {
  const [q, setQ] = useState("");
  const 찾는중 = q.trim().length > 0;

  const 결과 = useMemo(() => {
    if (!찾는중) {
      // 아직 안 넣은 사람이 위로 — 이미 넣은 사람을 다시 보여 주는 건 탐색이 아니다.
      return [...items].sort((a, b) => Number(a.following) - Number(b.following));
    }
    const k = 납작(q);
    return items.filter((c) => 납작(`${c.name} ${c.tagline} ${c.greeting}`).includes(k));
  }, [items, q, 찾는중]);

  return (
    <>
      <style>{CSS}</style>
      <div className="sc-bar">
        <svg className="sc-mag" width="18" height="18" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden>
          <path d="M1 0h4v1h1v4h-1v1h-4v-1h-1v-4h1zM2 1v4h2v-4zM6 6h1v1h1v1h-2z" fill="currentColor" fillRule="evenodd" />
        </svg>
        <input
          className="sc-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름이나 분위기로 찾기"
          aria-label="캐릭터 검색"
          autoComplete="off"
          enterKeyHint="search"
        />
        {q && <button className="sc-x" onClick={() => setQ("")} aria-label="지우기">×</button>}
      </div>

      {결과.length === 0 && (
        <div className="sc-none">
          <b>&ldquo;{q}&rdquo;</b> 로는 아무도 안 나왔어요.
          <div className="sc-none-sub">이름 말고 &ldquo;조용한&rdquo;, &ldquo;선배&rdquo; 같은 말로도 찾아보세요.</div>
        </div>
      )}

      {!찾는중 ? (
        <div className="sc-grid">
          {결과.map((c) => (
            <Link key={c.id} href={`/dot/${c.slug}/profile`} className="sc-tile" aria-label={`${c.name} 프로필`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.avatar ? <img src={c.avatar} alt="" /> : <span className="sc-tile-none" />}
              <span className="sc-tile-name">{c.name}</span>
              {c.following && <span className="sc-tile-on">추가됨</span>}
            </Link>
          ))}
        </div>
      ) : (
        <ul className="sc-list">
          {결과.map((c) => (
            <li key={c.id}>
              <Link href={`/dot/${c.slug}/profile`} className="sc-row" aria-label={`${c.name} 프로필`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.avatar ? <img src={c.avatar} alt="" className="sc-av" /> : <span className="sc-av" />}
                <span className="sc-text">
                  <span className="sc-name">{c.name}</span>
                  <span className="sc-tag">{c.tagline}</span>
                </span>
              </Link>
              <FollowButton characterId={c.id} following={c.following} name={c.name} size="sm" words={["추가", "추가됨"]} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const CSS = `
.sc-bar { display:flex; align-items:center; gap:8px; margin:4px 16px 14px; padding:9px 12px; background:#f1f3f6; border-radius:12px; color:#8a919a; }
.sc-mag { flex:0 0 auto; }
.sc-input { flex:1; min-width:0; border:none; background:none; font:inherit; font-size:15px; color:#141414; outline:none; }
.sc-input::placeholder { color:#a3aab3; }
.sc-x { border:none; background:none; font-size:20px; line-height:1; color:#8a919a; cursor:pointer; padding:0 2px; }
.sc-none { padding:34px 24px; text-align:center; font-size:14px; color:#5c6570; line-height:1.7; }
.sc-none-sub { margin-top:6px; font-size:13px; color:#a3aab3; }
.sc-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; }
.sc-tile { position:relative; aspect-ratio:1; background:#eef1f5; display:block; text-decoration:none; overflow:hidden; }
.sc-tile img { width:100%; height:100%; object-fit:cover; display:block; }
.sc-tile-none { display:block; width:100%; height:100%; background:#e6eaef; }
.sc-tile-name { position:absolute; left:0; right:0; bottom:0; padding:14px 8px 6px; font-size:12px; font-weight:600; color:#fff;
  background:linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0)); }
.sc-tile-on { position:absolute; top:6px; right:6px; font-size:10px; font-weight:600; color:#1f1a00; background:#fee500; border-radius:999px; padding:2px 7px; }
.sc-list { list-style:none; margin:0; padding:0 16px; }
.sc-list li { display:flex; align-items:center; gap:10px; padding:9px 0; }
.sc-row { flex:1; min-width:0; display:flex; align-items:center; gap:11px; text-decoration:none; color:inherit; }
.sc-av { flex:0 0 46px; width:46px; height:46px; border-radius:50%; background:#eef1f5; object-fit:cover; }
.sc-text { min-width:0; display:flex; flex-direction:column; gap:2px; }
.sc-name { font-size:15px; font-weight:600; color:#111; }
.sc-tag { font-size:13px; color:#8a919a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;
