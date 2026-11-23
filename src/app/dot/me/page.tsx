import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DotTabs from "../DotTabs";
import { t, shownName, type Lang } from "@/lib/dot/lang";
import { createServiceClient } from "@/lib/supabase/service";
import { langFromCookie } from "@/lib/dot/langServer";
import Uploader from "./Uploader";
import { mineView, 맞팔_하트 } from "@/lib/dot/mine";
import MeSignIn from "./MeSignIn";
import HeartBadgeServer from "../HeartBadgeServer";

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
  const [v, 사람들] = await Promise.all([mineView(user.id), castFaces(lang)]);
  /* 11-23: 손님(익명)은 이메일이 없어 영어 화면에도 "나" 가 떴다 → 탭 이름으로. */
  const 이름 = user.email ? user.email.split("@")[0] : t("tab_me", lang);
  const 맞팔 = v.followers.map((c) => ({ ...c, name: shownName(c.slug, c.name, lang) }));

  return (
    <div className="me-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="me-phone">
        <header className="me-head">
          <div className="me-title">{이름}</div>
          <HeartBadgeServer />
          <Link href="/dot/settings" className="me-gear" aria-label={t("settings_aria", lang)}>
            <svg width="24" height="24" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden><path d="M3 0h2v1h1v1h1v2h-1v1h-1v1h-2v-1h-1v-1h-1v-2h1v-1h1z" fill="currentColor" fillRule="evenodd" /></svg>
          </Link>
        </header>

        <div className="me-body">
          <ProfileCard
            name={이름}
            sub={user.is_anonymous ? (lang === "en" ? "Guest · this device only" : "손님 · 이 기기에만") : (lang === "en" ? "Signed in" : "로그인됨")}
            faces={맞팔}
          />
          {맞팔.length === 0 && <CastRow people={사람들} lang={lang} />}
          {/* 11-22: 손님으로 쓰는 사람에게 로그인 문 — 대화·하트가 이 기기에만 있다. */}
          {user.is_anonymous && <Link href="/dot/login" className="me-login">{lang === "en" ? "Sign in to keep your chats on any device ›" : "로그인하면 대화와 하트가 어느 기기에서든 이어져요 ›"}</Link>}
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
                {맞팔.map((c) => (
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
                  <span className="me-prog-name">{shownName(c.slug, c.name, lang)}</span>
                  <span className="me-bar"><i style={{ width: `${Math.min(100, (c.hearts / 맞팔_하트) * 100)}%` }} /></span>
                  <span className="me-prog-n">{c.hearts}/{맞팔_하트}</span>
                </div>
              ))}
            </div>
          )}

          {/* 11-09: **우리 사이 카드** — 사장님이 "둘 다" 를 고르셨다(방 안 + 따로 보는 화면).
              아래 탭은 넷으로 둔다(11-06 에 다섯에서 줄였다) — 자리는 내 창 안이다. */}
          <Link href="/dot/tarot" className="me-tarot">
            <b>{lang === "en" ? "Our bond cards" : "우리 사이 카드"}</b>
            <small>{lang === "en" ? "Your chats, read as three cards" : "나눈 말을 카드 세 장으로 읽어 줘요"}</small>
          </Link>

          <Uploader lang={lang} />

          {v.posts.length === 0 ? (
            <div className="me-empty">
              {t("me_empty", lang)}
              <div className="me-empty-sub">{lang === "en"
                /* 11-06: 여기 "하트" 는 **좋아요**다. 같은 날 대화 횟수를 하트라 부르기로 해서
                   한 앱에 하트가 셋이 됐다 — 이쪽은 글자를 좋아요로 바꿔 가른다. */
                ? `Post a photo and the characters you added will see it and leave likes. ${맞팔_하트} likes from one character and they follow you back.`
                : <>사진을 올리면 추가한 캐릭터들이 보고 좋아요를 눌러요.<br />한 캐릭터에게 좋아요 {맞팔_하트}개를 받으면 맞팔해 줍니다.</>}</div>
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
.me-login { display:flex; align-items:center; min-height:44px; margin:10px 16px; padding:8px 12px; background:#f0edff; color:#3f3597; border-radius:10px; font-size:13px; text-decoration:none; }
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
/* 우리 사이 카드 — 밤빛 한 칸. 이 줄만 색이 달라야 눈에 걸린다. */
.me-tarot { display:flex; flex-direction:column; gap:3px; margin:14px 16px 0; padding:12px 14px;
  background:#1b1630; color:#ffd369; text-decoration:none; box-shadow:inset 0 0 0 2px #1c1c1c; }
.me-tarot b { font-size:14px; font-weight:400; }
.me-tarot small { font-size:11px; color:#b9b0e0; }
.me-tarot:active { transform:translate(2px,2px); }
/* 11-23 사장님 "꾸며" — 위에 프로필 카드 한 장(피드 첫 안내와 같은 보라 칸), 맞팔이 없으면 대화 상대 줄. 새 그림은 없다. */
.me-card { display:flex; gap:14px; align-items:center; margin:4px 16px 12px; padding:16px; background:#f4f1ff; border-radius:16px; }
.me-ava { flex:0 0 64px; width:64px; height:64px; background:#ff5c7a; color:#fff; display:flex; align-items:center; justify-content:center; border-radius:16px; box-shadow:0 0 0 3px #6b5bd2; }
.me-ava svg { width:40px; height:40px; }
.me-who { min-width:0; display:flex; flex-direction:column; gap:4px; }
.me-who b { font-size:18px; color:#1c1640; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.me-who small { font-size:12px; color:#6b5bd2; }
.me-faces { display:flex; margin-top:4px; }
.me-faces img { width:28px; height:28px; border-radius:50%; object-fit:cover; object-position:center top; image-rendering:pixelated; background:#fff; box-shadow:0 0 0 2px #f4f1ff; margin-left:-6px; }
.me-faces img:first-child { margin-left:0; }
.me-cast { margin:0 16px 12px; }
.me-cast-pick { font-size:13px; color:#6b5bd2; margin:0 0 8px; }
.me-cast-row { display:flex; gap:10px; overflow-x:auto; padding:3px 3px 4px; scrollbar-width:none; }
.me-cast-row::-webkit-scrollbar { display:none; }
.me-cast-one { flex:0 0 auto; width:64px; display:flex; flex-direction:column; align-items:center; gap:6px; text-decoration:none; color:#1c1640; font-size:12px; }
.me-cast-one img, .me-cast-none { width:56px; height:56px; border-radius:50%; object-fit:cover; object-position:center top; image-rendering:pixelated; background:#fff; box-shadow:0 0 0 3px #6b5bd2; }
.me-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; }
.me-tile { position:relative; aspect-ratio:1; background:#eef1f5; }
.me-tile img { width:100%; height:100%; object-fit:cover; display:block; }
.me-tile-n { position:absolute; right:5px; bottom:5px; font-size:11px; font-weight:600; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.6); }
`;

/**
 * 계정이 없을 때의 내 창. **숫자를 0 으로 보여 주지 않는다** — 0 은 "없다" 로 읽히는데
 * 사실은 "아직 안 모은다" 다. 무엇이 여기 모이는지 적고, 만들 길을 하나 준다.
 */
async function MeEmpty({ lang }: { lang: Lang }) {
  const 사람들 = await castFaces(lang);
  return (
    <div className="me-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="me-phone">
        <header className="me-head">
          <div className="me-title">{t("tab_me", lang)}</div>
          <HeartBadgeServer />
          <Link href="/dot/settings" className="me-gear" aria-label={t("settings_aria", lang)}>
            <svg width="24" height="24" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden><path d="M3 0h2v1h1v1h1v2h-1v1h-1v1h-2v-1h-1v-1h-1v-2h1v-1h1z" fill="currentColor" fillRule="evenodd" /></svg>
          </Link>
        </header>
        <div className="me-body">
          <ProfileCard name={t("tab_me", lang)} sub={lang === "en" ? "Guest" : "손님"} faces={[]} />
          <CastRow people={사람들} lang={lang} />
          <div className="me-empty">
            <b>{t("me_signup_title", lang)}</b>
            <ul>
              <li>{t("me_signup_1", lang)}</li>
              <li>{t("me_signup_2", lang)}</li>
              <li>{t("me_signup_3", lang)}</li>
            </ul>
            <small>{t("st_device_sub", lang)}</small>
            <MeSignIn lang={lang} />
            <Link href="/dot/login" className="me-login">{lang === "en" ? "I already have an account ›" : "이미 계정이 있어요 · 로그인 ›"}</Link>
          </div>
        </div>
        <DotTabs on="me" />
      </div>
    </div>
  );
}

/** 내 창 탭의 그 사람 모양(DotTabs 와 같은 8×8 도트). */
const ME_ICON = "M3 0h2v1h1v2h-1v1h-2v-1h-1v-2h1zM1 5h6v1h1v2h-8v-2h1z";

function ProfileCard({ name, sub, faces }: { name: string; sub: string; faces: { slug: string; name: string; avatar: string }[] }) {
  return (
    <section className="me-card">
      <div className="me-ava" aria-hidden>
        <svg viewBox="0 0 8 8" shapeRendering="crispEdges"><path d={ME_ICON} fill="currentColor" fillRule="evenodd" /></svg>
      </div>
      <div className="me-who">
        <b>{name}</b>
        <small>{sub}</small>
        {faces.length > 0 && (
          <div className="me-faces">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {faces.slice(0, 8).map((c) => c.avatar && <img key={c.slug} src={c.avatar} alt={c.name} title={c.name} />)}
          </div>
        )}
      </div>
    </section>
  );
}

/** 공개 캐릭터 전부 — 피드 첫 안내와 같은 줄(고르지 않는다). */
async function castFaces(lang: Lang): Promise<{ slug: string; name: string; avatar: string }[]> {
  const { data } = await createServiceClient().from("dot_characters").select("slug, name, photos").eq("is_public", true).order("created_at", { ascending: true });
  return ((data ?? []) as { slug: string; name: string; photos: { url: string }[] | null }[])
    .map((c) => ({ slug: c.slug, name: shownName(c.slug, c.name, lang), avatar: c.photos?.[0]?.url ?? "" }));
}

function CastRow({ people, lang }: { people: { slug: string; name: string; avatar: string }[]; lang: Lang }) {
  if (people.length === 0) return null;
  return (
    <section className="me-cast">
      <p className="me-cast-pick">{t("feed_intro_pick", lang)}</p>
      <div className="me-cast-row">
        {people.map((c) => (
          <Link key={c.slug} href={`/dot/${c.slug}`} className="me-cast-one">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.avatar ? <img src={c.avatar} alt="" /> : <span className="me-cast-none" />}
            <span>{c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
