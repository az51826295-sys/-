import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DotTabs from "../DotTabs";
import { t, type Lang } from "@/lib/dot/lang";
import { langFromCookie } from "@/lib/dot/langServer";
import Uploader from "./Uploader";
import { mineView, 맞팔_하트 } from "@/lib/dot/mine";
import MeSignIn from "./MeSignIn";

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
  width: "device-width", viewportFit: "cover" as const, initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#ffffff",
};

export default async function DotMe() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  /**
   * **로그인 안 한 사람을 말없이 튕기지 않는다** (10-28 화면 점검에서 잡힘).
   *
   * 전에는 설정으로 `redirect` 했는데, 아래 탭에서 "내 창" 을 누른 사람 입장에서는
   * **탭이 고장 난 것**으로 보인다(글자 수가 설정과 똑같아서 자가 찾아냈다).
   * 여기 올 이유를 적고, 계정을 만들 길을 같이 준다 — 계정이 있어야 폰을 바꿔도
   * 이어지고, 결제도 그걸로 이어진다.
   */
  const lang = await langFromCookie();
  if (!user) return <MeEmpty lang={lang} />;
  const v = await mineView(user.id);
  const 이름 = (user.email ?? "나").split("@")[0];

  return (
    <div className="me-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="me-phone">
        <header className="me-head">
          <div className="me-title">{이름}</div>
          <Link href="/dot/settings" className="me-gear" aria-label={t("settings_aria", lang)}>
            <svg width="24" height="24" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden><path d="M3 0h2v1h1v1h1v2h-1v1h-1v1h-2v-1h-1v-1h-1v-2h1v-1h1z" fill="currentColor" fillRule="evenodd" /></svg>
          </Link>
        </header>

        <div className="me-body">
          <div className="me-nums">
            <div><b>{v.posts.length}</b><span>{t("me_posts", lang)}</span></div>
            <div><b>{v.followers.length}</b><span>{t("me_followers", lang)}</span></div>
            <div><b>{v.following}</b><span>{t("me_following", lang)}</span></div>
            <div><b>{v.hearts}</b><span>{t("me_hearts", lang)}</span></div>
          </div>

          {v.followers.length > 0 && (
            <div className="me-back">
              <div className="me-sub">{t("me_mutual", lang)}</div>
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
              <div className="me-sub">{t("me_until_mutual", lang)}</div>
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
              {t("me_empty", lang)}
              <div className="me-empty-sub">{lang === "en"
                ? `Post a photo and the characters you added will see it and leave hearts. ${맞팔_하트} hearts from one character and they follow you back.`
                : <>사진을 올리면 추가한 캐릭터들이 보고 하트를 줘요.<br />한 캐릭터에게 하트 {맞팔_하트}개를 받으면 맞팔해 줍니다.</>}</div>
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
.me-empty { margin:28px 4px; display:flex; flex-direction:column; gap:12px; }
.me-empty > b { font-size:17px; color:#111; }
.me-empty ul { margin:0; padding-left:18px; display:flex; flex-direction:column; gap:6px; font-size:14px; color:#5c6570; }
.me-empty small { font-size:12px; color:#8a8f98; line-height:1.6; }

* { box-sizing:border-box; }
.me-root { min-height:100dvh; background:#0b0f14; display:flex; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.me-phone { width:100%; max-width:430px; min-height:100dvh; background:#fff; color:#141414; display:flex; flex-direction:column; }
.me-head { display:flex; align-items:center; padding:14px 16px 10px; }
.me-title { font-size:20px; font-weight:700; letter-spacing:-.3px; }
/* 09-29 UI 점검: 누를 자리를 44px 로(아이콘은 그대로 24px). */
.me-gear { margin-left:auto; margin-right:-10px; width:44px; height:44px; color:#5c6570; display:flex; align-items:center; justify-content:center; }
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

/**
 * 계정이 없을 때의 내 창. **숫자를 0 으로 보여 주지 않는다** — 0 은 "없다" 로 읽히는데
 * 사실은 "아직 안 모은다" 다. 무엇이 여기 모이는지 적고, 만들 길을 하나 준다.
 */
function MeEmpty({ lang }: { lang: Lang }) {
  return (
    <div className="me-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="me-phone">
        <header className="me-head">
          <div className="me-title">{t("tab_me", lang)}</div>
          <Link href="/dot/settings" className="me-gear" aria-label={t("settings_aria", lang)}>
            <svg width="24" height="24" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden><path d="M3 0h2v1h1v1h1v2h-1v1h-1v1h-2v-1h-1v-1h-1v-2h1v-1h1z" fill="currentColor" fillRule="evenodd" /></svg>
          </Link>
        </header>
        <div className="me-body">
          <div className="me-empty">
            <b>{t("me_signup_title", lang)}</b>
            <ul>
              <li>{t("me_signup_1", lang)}</li>
              <li>{t("me_signup_2", lang)}</li>
              <li>{t("me_signup_3", lang)}</li>
            </ul>
            <small>{t("st_device_sub", lang)}</small>
            <MeSignIn lang={lang} />
          </div>
        </div>
        <DotTabs on="me" />
      </div>
    </div>
  );
}
