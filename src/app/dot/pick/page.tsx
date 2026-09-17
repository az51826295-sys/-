import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import DotTabs from "../DotTabs";
import { publicCharacters } from "@/lib/dot/load";

/**
 * 고르기 — **처음 온 사람에게만** 보이는 화면.
 *
 * 사장님 09-09: "캐릭터 고르기 창." 목록(`/dot`)도 고르는 곳이지만 그건 카톡 친구목록이라
 * 이름 한 줄뿐이다. 처음 온 사람은 이 사람들이 **누구인지** 모른다 — 성격 한 줄과
 * 첫마디를 크게 보여 주고, 마음에 드는 쪽을 누르게 한다.
 *
 * 한 번이라도 대화한 사람은 여기로 안 온다(`/dot` 이 사이가 있으면 목록을 보여 준다).
 * 매번 고르라고 하면 그건 고르기가 아니라 관문이다.
 */
export const metadata = { title: "두근도트 — 친구" };
export const viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#a5bccd",
};

export default async function DotPick() {
  const characters = await publicCharacters();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let follows = new Set<string>();
  if (user) { const { data: f } = await createServiceClient().from("dot_follows").select("character_id").eq("user_id", user.id); follows = new Set(((f ?? []) as { character_id: string }[]).map((x) => x.character_id)); }
  return (
    <div className="pk-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="pk-phone">
        <header className="pk-head">
          <div className="pk-title">친구</div>
          {/* 95회차: 카톡처럼 설정은 친구 탭 오른쪽 위. 8×8 격자 톱니(도트). */}
          <Link href="/dot/settings" className="pk-gear" aria-label="설정">
            <svg width="24" height="24" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden><path d="M3 0h2v1h1v1h1v2h-1v1h-1v1h-2v-1h-1v-1h-1v-2h1v-1h1zM3 3v2h2v-2z" fill="currentColor" fillRule="evenodd" /></svg>
          </Link>
        </header>
        <div className="pk-cards">
          {characters.map((c) => (
            <div key={c.id} className="pk-card">
              <Link href={`/dot/${c.slug}/profile`} className="pk-main" aria-label={`${c.name} 프로필`}>
                <div className="pk-face">
                  {/* 프로필 사진 = 개인 스냅사진(09-11). 표정은 대화방 말풍선 옆에서만. */}
                  {c.photos?.[0]?.url ? <img src={c.photos[0].url} alt={c.name} className="photo" /> : c.sprites?.happy ? <img src={c.sprites.happy} alt={c.name} /> : null}
                </div>
                <div className="pk-text">
                  <div className="pk-name">{c.name}{follows.has(c.id) && <span className="pk-fl">팔로잉</span>}</div>
                  <div className="pk-line">{c.tagline}</div>
                </div>
              </Link>
            </div>
          ))}
        </div>
        <DotTabs on="friends" />
      </div>
    </div>
  );
}

const CSS = `
* { box-sizing:border-box; }
.pk-root { min-height:100dvh; background:#0b0f14; display:flex; align-items:center; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.pk-phone { width:100%; max-width:430px; min-height:100dvh; max-height:940px; background:#f5f7fa; display:flex; flex-direction:column; overflow:hidden; }
.pk-head { padding:28px 22px 12px; display:flex; align-items:center; justify-content:space-between; }
.pk-gear { color:#111; display:flex; width:40px; height:40px; align-items:center; justify-content:center; text-decoration:none; }
.pk-gear:active { opacity:.6; }
.pk-title { font-size:24px; font-weight:700; letter-spacing:-.4px; color:#111; }
.pk-sub { font-size:13px; color:#7b8590; margin-top:6px; }
.pk-cards { flex:1; min-height:0; overflow-y:auto; padding:8px 16px 24px; display:flex; flex-direction:column; gap:12px; }
.pk-main { display:flex; align-items:center; gap:12px; flex:1; min-width:0; text-decoration:none; color:inherit; }
.pk-text { min-width:0; }
.pk-card { display:flex; align-items:center; gap:12px; background:#fff; border-radius:20px; padding:14px;
  text-decoration:none; color:#111; box-shadow:0 2px 10px rgba(0,0,0,.06); }
.pk-card:active { background:#f7f9fb; }
.pk-face { grid-row:1 / span 3; width:96px; height:96px; background:#eef2f6; border-radius:22px; overflow:hidden; display:flex; align-items:center; justify-content:center; }
.pk-face img { width:100%; height:100%; image-rendering:pixelated; object-fit:contain; }
.pk-face img.photo { object-fit:cover; object-position:center top; }
.pk-name { font-size:18px; font-weight:700; letter-spacing:-.2px; }
.pk-fl { margin-left:8px; font-size:11px; font-weight:600; color:#5c6570; background:#eef1f5; border-radius:999px; padding:2px 8px; vertical-align:middle; }
.pk-say { font-size:14px; color:#141414; margin-top:4px; line-height:1.5; }
.pk-line { font-size:12px; color:#8a8f98; margin-top:4px; }
.pk-go { grid-column:2; justify-self:end; margin-top:10px; background:#fee500; color:#1f1a00; font-size:13px; font-weight:600; padding:8px 14px; border-radius:999px; }
`;
