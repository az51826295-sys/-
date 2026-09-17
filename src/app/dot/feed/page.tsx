import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import DotTabs from "../DotTabs";
import FeedCard, { type FeedPost } from "./FeedCard";

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
    const { data: f } = await db.from("dot_follows").select("character_id").eq("user_id", user.id);
    follows = new Set(((f ?? []) as { character_id: string }[]).map((x) => x.character_id));
  }
  const filterFollowing = !showAll && follows.size > 0;
  const posts: FeedPost[] = ((rows ?? []) as unknown as Row[])
    .filter((r) => r.dot_characters?.is_public && (!filterFollowing || follows.has(r.character_id)))
    .map((r) => ({ id: r.id, image: r.image_url, caption: r.caption, likes: r.likes, at: r.created_at, slug: r.dot_characters!.slug, name: r.dot_characters!.name, avatar: r.dot_characters!.photos?.[0]?.url ?? "", characterId: r.character_id, following: follows.has(r.character_id) }));
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
          <span className="fd-title">피드</span>
          <nav className="fd-tabs">
            <Link href="/dot/feed" className={!showAll ? "on" : ""}>팔로잉</Link>
            <Link href="/dot/feed?all=1" className={showAll ? "on" : ""}>전체</Link>
          </nav>
        </header>
        {!showAll && follows.size === 0 && <div className="fd-hint">아직 팔로우한 캐릭터가 없어요. 팔로우하면 여기에 모여요.</div>}
        <div className="fd-list">
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
.fd-title { font-size:24px; font-weight:700; letter-spacing:-.4px; color:#111; }
.fd-list { flex:1; min-height:0; overflow-y:auto; }
.fd-empty { padding:24px 20px; font-size:14px; color:#8a8f98; }
.fc { border-bottom:1px solid #f1f3f6; padding-bottom:12px; margin-bottom:6px; }
.fc-head { display:flex; align-items:center; gap:10px; padding:10px 16px; }
.fc-avatar { width:36px; height:36px; border-radius:12px; object-fit:cover; object-position:center top; image-rendering:pixelated; background:#f1f3f6; }
.fc-name { font-size:14px; font-weight:600; color:#111; text-decoration:none; }
.fc-when { font-size:12px; color:#a3aab3; margin-left:auto; }
.fc-img { display:block; width:100%; aspect-ratio:4/5; object-fit:cover; image-rendering:pixelated; background:#eef2f6; }
.fc-actions { display:flex; align-items:center; gap:6px; padding:8px 12px 0; }
.fc-like { background:none; border:none; font:inherit; font-size:14px; color:#141414; cursor:pointer; padding:6px 8px; border-radius:10px; display:flex; align-items:center; gap:6px; }
.fc-like:active { background:#f2f4f7; }
.fc-like .heart { font-size:20px; line-height:1; color:#c5cbd3; }
.fc-like.on .heart { color:#ff5c7a; }
.fc-chat { margin-left:auto; background:#fff; color:#1c1c1c; text-decoration:none; font-size:13px; font-weight:600; padding:8px 14px; border-radius:999px; box-shadow:inset 0 0 0 2px #1c1c1c; margin-right:6px; }
.fc-reply { margin-left:0; background:#fee500; color:#1f1a00; text-decoration:none; font-size:13px; font-weight:600; padding:8px 14px; border-radius:999px; }
.fc-cap { padding:6px 16px 0; font-size:14px; line-height:1.55; color:#141414; }
.fc-cap b { margin-right:6px; }
`;
