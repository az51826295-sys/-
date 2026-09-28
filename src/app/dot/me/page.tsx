import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DotTabs from "../DotTabs";
import Uploader from "./Uploader";
import { mineView, 맞팔_하트 } from "@/lib/dot/mine";

/**
 * **내 창** (227회차 09-29, 사장님 *"자신의 창도 있어야지"*).
 *
 * 인스타 프로필 탭의 그 화면: 위에 숫자 세 개(게시물·팔로워·팔로잉), 아래에 3열 격자.
 * 우리 쪽에서 **팔로워**는 나를 맞팔해 준 캐릭터다 — 사장님이 정한 규칙대로
 * 한 캐릭터가 내게 준 하트가 {@link 맞팔_하트} 개가 되면 맞팔이 된다.
 *
 * 그래서 이 화면은 **아직 안 된 쪽도 보여 준다**: "서하 3/5" 처럼. 문턱만 있고 진행이 안 보이면
 * 사람은 그 규칙이 있는 줄도 모른다 — 안 보이는 규칙은 없는 규칙이다.
 */
export const metadata = { title: "두근도트 — 내 창" };
export const viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#ffffff",
};

export default async function DotMe() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const v = await mineView(user.id);
  const 이름 = (user.email ?? "나").split("@")[0];

  return (
    <div className="me-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="me-phone">
        <header className="me-head">
          <div className="me-title">{이름}</div>
          <Link href="/dot/settings" className="me-gear" aria-label="설정">
            <svg width="24" height="24" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden><path d="M3 0h2v1h1v1h1v2h-1v1h-1v1h-2v-1h-1v-1h-1v-2h1v-1h1z" fill="currentColor" fillRule="evenodd" /></svg>
          </Link>
        </header>

        <div className="me-body">
          <div className="me-nums">
            <div><b>{v.posts.length}</b><span>게시물</span></div>
            <div><b>{v.followers.length}</b><span>팔로워</span></div>
            <div><b>{v.following}</b><span>팔로잉</span></div>
            <div><b>{v.hearts}</b><span>받은 하트</span></div>
          </div>

          {v.followers.length > 0 && (
            <div className="me-back">
              <div className="me-sub">맞팔해 준 캐릭터</div>
              <div className="me-chips">
                {v.followers.map((c) => (
                  <Link key={c.slug} href={`/dot/${c.slug}`} className="me-chip">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.avatar && <img src={c.avatar} alt="" />}
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {v.progress.length > 0 && (
            <div className="me-back">
              <div className="me-sub">맞팔까지</div>
              {v.progress.map((c) => (
                <div key={c.slug} className="me-prog">
                  <span className="me-prog-name">{c.name}</span>
                  <span className="me-bar"><i style={{ width: `${Math.min(100, (c.hearts / 맞팔_하트) * 100)}%` }} /></span>
                  <span className="me-prog-n">{c.hearts}/{맞팔_하트}</span>
                </div>
              ))}
            </div>
          )}

          <Uploader />

          {v.posts.length === 0 ? (
            <div className="me-empty">
              아직 올린 게 없어요.
              <div className="me-empty-sub">사진을 올리면 추가한 캐릭터들이 보고 하트를 줘요.<br />한 캐릭터에게 하트 {맞팔_하트}개를 받으면 맞팔해 줍니다.</div>
            </div>
          ) : (
            <div className="me-grid">
              {v.posts.map((p) => (
                <div key={p.id} className="me-tile">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt={p.caption} />
                  {p.likes > 0 && <span className="me-tile-n">♥ {p.likes}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <DotTabs on="me" />
      </div>
    </div>
  );
}

const CSS = `
* { box-sizing:border-box; }
.me-root { min-height:100dvh; background:#0b0f14; display:flex; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.me-phone { width:100%; max-width:430px; min-height:100dvh; background:#fff; color:#141414; display:flex; flex-direction:column; }
.me-head { display:flex; align-items:center; padding:14px 16px 10px; }
.me-title { font-size:20px; font-weight:700; letter-spacing:-.3px; }
.me-gear { margin-left:auto; color:#5c6570; display:flex; }
.me-body { flex:1; min-height:0; overflow-y:auto; padding-bottom:14px; }
.me-nums { display:flex; padding:6px 16px 16px; }
.me-nums div { flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; }
.me-nums b { font-size:18px; font-weight:700; }
.me-nums span { font-size:12px; color:#8a919a; }
.me-back { padding:0 16px 14px; }
.me-sub { font-size:13px; font-weight:600; color:#5c6570; margin-bottom:8px; }
.me-chips { display:flex; flex-wrap:wrap; gap:8px; }
.me-chip { display:flex; align-items:center; gap:6px; padding:5px 12px 5px 5px; background:#f1f3f6; border-radius:999px; font-size:13px; color:#141414; text-decoration:none; }
.me-chip img { width:24px; height:24px; border-radius:50%; object-fit:cover; object-position:center top; image-rendering:pixelated; }
.me-prog { display:flex; align-items:center; gap:9px; padding:4px 0; }
.me-prog-name { flex:0 0 58px; font-size:13px; color:#3c434b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.me-bar { flex:1; height:7px; background:#eef1f5; border-radius:999px; overflow:hidden; }
.me-bar i { display:block; height:100%; background:#ff5c7a; }
.me-prog-n { flex:0 0 auto; font-size:12px; color:#8a919a; }
.me-empty { padding:34px 24px; text-align:center; font-size:14px; color:#5c6570; }
.me-empty-sub { margin-top:8px; font-size:13px; line-height:1.8; color:#a3aab3; }
.me-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; }
.me-tile { position:relative; aspect-ratio:1; background:#eef1f5; }
.me-tile img { width:100%; height:100%; object-fit:cover; display:block; }
.me-tile-n { position:absolute; right:5px; bottom:5px; font-size:11px; font-weight:600; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.6); }
`;
