import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import DotTabs from "../DotTabs";
import FeedCard, { type FeedPost } from "./FeedCard";
import StoryRow, { type StoryItem } from "./StoryRow";
import { ensureStarter } from "@/lib/dot/starter";

/**
 * 피드 — 캐릭터들이 올린 게시물 (78회차 09-11, 사장님 "카톡 벤치마킹: 캐릭터들이 도트 게시물을 올리고 팔로우하고 채팅").
 * 좋아요는 친밀도 +1(한 번), "답장" 은 그 게시물을 들고 방으로 간다.
 */
export const metadata = { title: "두근도트 — 피드" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#ffffff" };

export default async function DotFeed({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const showAll = all === "1";
  const supabase = await createClient();
  const db = createServiceClient();
  const [{ data: { user } }, { data: rows }] = await Promise.all([
    supabase.auth.getUser(),
    db.from("dot_posts").select("id, image_url, caption, likes, created_at, character_id, dot_characters(slug, name, photos, is_public)").order("id", { ascending: false }).limit(60),
  ]);
  type Row = { id: number; image_url: string; caption: string; likes: number; created_at: string; character_id: string; dot_characters: { slug: string; name: string; photos: { url: string }[] | null; is_public: boolean } | null };
  // 팔로우 — 기본은 팔로잉한 캐릭터만. 아무도 안 하면 전체를 보여 주고 "팔로우하면 여기 모여요".
  let follows = new Set<string>();
  if (user) {
    // 227회차 09-29: 처음 온 사람에게는 기본 캐릭터 **한 명**만 넣어 준다(사장님 방식 바꾸기).
    // 첫 화면이 피드이므로 여기가 그 자리다. 쓰던 사람은 아무 일도 안 일어난다.
    await ensureStarter(user.id);
    const { data: f } = await db.from("dot_follows").select("character_id").eq("user_id", user.id);
    follows = new Set(((f ?? []) as { character_id: string }[]).map((x) => x.character_id));
  }
  const filterFollowing = !showAll && follows.size > 0;
  const posts: FeedPost[] = ((rows ?? []) as unknown as Row[])
    .filter((r) => r.dot_characters?.is_public && (!filterFollowing || follows.has(r.character_id)))
    .map((r) => ({ id: r.id, image: r.image_url, caption: r.caption, likes: r.likes, at: r.created_at, slug: r.dot_characters!.slug, name: r.dot_characters!.name, avatar: r.dot_characters!.photos?.[0]?.url ?? "", characterId: r.character_id, following: follows.has(r.character_id) }));
  // ── 스토리 줄: 추가한 캐릭터 + 안 읽은 말 수 (227회차 09-29) ──
  let stories: StoryItem[] = [];
  if (user && follows.size) {
    const [{ data: cs }, { data: bs }, { data: ms }] = await Promise.all([
      db.from("dot_characters").select("id, slug, name, photos").in("id", [...follows]),
      db.from("dot_bonds").select("character_id, last_seen_at").eq("user_id", user.id),
      db.from("dot_messages").select("character_id, role, created_at").eq("user_id", user.id).order("id", { ascending: false }).limit(60),
    ]);
    const 본때 = new Map<string, string | null>();
    for (const b of (bs ?? []) as { character_id: string; last_seen_at: string | null }[]) 본때.set(b.character_id, b.last_seen_at);
    const 안읽음 = new Map<string, number>();
    for (const m of (ms ?? []) as { character_id: string; role: string; created_at: string }[]) {
      if (m.role !== "character") continue;
      const at = 본때.get(m.character_id);
      if (!at || m.created_at > at) 안읽음.set(m.character_id, (안읽음.get(m.character_id) ?? 0) + 1);
    }
    stories = ((cs ?? []) as { id: string; slug: string; name: string; photos: { url: string }[] | null }[])
      .map((c) => ({ slug: c.slug, name: c.name, avatar: c.photos?.[0]?.url ?? "", unread: 안읽음.get(c.id) ?? 0 }));
  }

  let liked = new Set<number>();
  if (user && posts.length) {
    const { data: l } = await db.from("dot_post_likes").select("post_id").eq("user_id", user.id).in("post_id", posts.map((p) => p.id));
    liked = new Set(((l ?? []) as { post_id: number }[]).map((x) => x.post_id));
  }

  return (
    <div className="fd-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="fd-phone">
        <header className="fd-bar">
          {/* 09-29: "피드" 라는 글자 대신 **이름**을 둔다 — 인스타 맨 위가 그렇다. */}
          <span className="fd-title">두근도트</span>
          <nav className="fd-tabs">
            <Link href="/dot/feed" className={!showAll ? "on" : ""}>팔로잉</Link>
            <Link href="/dot/feed?all=1" className={showAll ? "on" : ""}>전체</Link>
          </nav>
        </header>
        {!showAll && follows.size === 0 && <div className="fd-hint">아직 팔로우한 캐릭터가 없어요. 팔로우하면 여기에 모여요.</div>}
        <div className="fd-list">
          <StoryRow items={stories} />
          {posts.length === 0 && <div className="fd-empty">아직 올라온 게시물이 없어요. 캐릭터들이 곧 올릴 거예요.</div>}
          {posts.map((p) => <FeedCard key={p.id} post={p} liked={liked.has(p.id)} signedIn={!!user} />)}
        </div>
        <DotTabs on="feed" />
      </div>
    </div>
  );
}

const CSS = `
* { box-sizing:border-box; }
.fd-root { min-height:100dvh; background:#0b0f14; display:flex; align-items:center; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.fd-phone { width:100%; max-width:430px; height:100dvh; max-height:940px; background:#fff; display:flex; flex-direction:column; overflow:hidden; }
.fd-bar { padding:18px 20px 10px; display:flex; align-items:center; gap:14px; }
.fd-tabs { margin-left:auto; display:flex; gap:4px; background:#f1f3f6; border-radius:999px; padding:3px; }
.fd-tabs a { padding:6px 12px; border-radius:999px; font-size:13px; color:#7b8590; text-decoration:none; }
.fd-tabs a.on { background:#fff; color:#111; font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,.08); }
.fd-hint { margin:0 16px 8px; padding:10px 12px; background:#fff8d6; color:#5a4a00; font-size:13px; border-radius:12px; }
.fd-title { font-size:22px; font-weight:800; letter-spacing:-.6px; color:#111; }
.fd-list { flex:1; min-height:0; overflow-y:auto; }
.fd-empty { padding:24px 20px; font-size:14px; color:#8a8f98; }
.fc { border-bottom:1px solid #f1f3f6; padding-bottom:12px; margin-bottom:6px; }
.fc-head { display:flex; align-items:center; gap:10px; padding:10px 16px; }
.fc-avatar { width:34px; height:34px; border-radius:50%; object-fit:cover; object-position:center top; image-rendering:pixelated; background:#f1f3f6; }
.fc-name { font-size:14px; font-weight:600; color:#111; text-decoration:none; }
.fc-dot { font-size:12px; color:#a3aab3; }
.fc-when { font-size:12px; color:#a3aab3; }
.fc-fb { margin-left:auto; }
.fc-likes { padding:4px 16px 0; font-size:13px; font-weight:600; color:#141414; }
.fc-img { display:block; width:100%; aspect-ratio:4/5; object-fit:cover; image-rendering:pixelated; background:#eef2f6; }
.fc-actions { display:flex; align-items:center; gap:6px; padding:8px 12px 0; }
.fc-like { background:none; border:none; font:inherit; color:#141414; cursor:pointer; padding:4px 8px; border-radius:10px; display:flex; align-items:center; }
.fc-like:active { background:#f2f4f7; }
.fc-like .heart { font-size:20px; line-height:1; color:#c5cbd3; }
.fc-like.on .heart { color:#ff5c7a; }
.fc-chat { margin-left:auto; background:#fff; color:#1c1c1c; text-decoration:none; font-size:13px; font-weight:600; padding:8px 14px; border-radius:999px; box-shadow:inset 0 0 0 2px #1c1c1c; margin-right:6px; }
.fc-reply { margin-left:0; background:#fee500; color:#1f1a00; text-decoration:none; font-size:13px; font-weight:600; padding:8px 14px; border-radius:999px; }
.fc-cap { padding:6px 16px 0; font-size:14px; line-height:1.55; color:#141414; }
.fc-cap b { margin-right:6px; }
`;
