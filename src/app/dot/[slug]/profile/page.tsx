import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { characterBySlug, spriteDataUrls } from "@/lib/dot/load";
import { toNextStage } from "@/lib/dot/bond";
import FollowButton from "../../FollowButton";

/**
 * 프로필 화면 — 카톡 프로필처럼: 배경 크게, 캐릭터, 이름·상태·사이, "대화하기" (09-11 사장님 "배경 프로필 화면도 만들자").
 *
 * 배경은 캐릭터마다 어울리는 도트 그림 하나(코드에 둔다 — 넷뿐이고, 늘면 표로 옮긴다).
 * 이 화면은 **자랑하는 자리**다: 512px 도트가 42px 칸에 갇혀 있을 이유가 없다.
 */
const PROFILE_WALL: Record<string, string> = { yuna: "/wallpapers/sakura.png", seoha: "/wallpapers/store.png", rin: "/wallpapers/room.png", doyun: "/wallpapers/rain.png" };
const STAGE_WORD = ["", "처음 보는 사이", "아는 사이", "친한 사이", "가까운 사이", "아주 가까운 사이"];
const EMO_KO: Record<string, string> = { neutral: "평소", happy: "기쁨", shy: "부끄", sad: "시무룩", angry: "툴툴", surprised: "깜짝" };

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#0b0f14" };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${(await characterBySlug(slug))?.name ?? "두근도트"} — 프로필` };
}

export default async function DotProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const [{ data: { user } }, found, inline] = await Promise.all([supabase.auth.getUser(), characterBySlug(slug), spriteDataUrls(slug)]);
  if (!found) notFound();
  const sprites: Record<string, string> = { ...found.sprites };
  for (const [k, v] of Object.entries(inline)) if (!k.startsWith("face:")) sprites[k] = v;

  let stage = 0, points = 0, streak = 0, talks = 0, following = false;
  if (user) {
    const db = createServiceClient();
    const [{ data: b }, { count }, { data: fl }] = await Promise.all([
      db.from("dot_bonds").select("points, stage, streak_days").eq("user_id", user.id).eq("character_id", found.id).maybeSingle(),
      db.from("dot_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("character_id", found.id).eq("role", "user"),
      db.from("dot_follows").select("character_id").eq("user_id", user.id).eq("character_id", found.id).maybeSingle(),
    ]);
    following = !!fl;
    stage = (b?.stage as number) ?? 0; points = (b?.points as number) ?? 0; streak = (b?.streak_days as number) ?? 0; talks = count ?? 0;
  }
  const next = stage ? toNextStage(points) : null;
  const wall = PROFILE_WALL[slug] ?? "/wallpapers/night.png";
  const photos = Array.isArray(found.photos) ? found.photos : [];

  return (
    <div className="pf-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="pf-phone">
        <div className="pf-hero">
          <img className="pf-wall" src={wall} alt="" aria-hidden />
          <div className="pf-shade" />
          <Link href={`/dot/${slug}`} className="pf-back" aria-label="뒤로">‹</Link>
          {/* 사진이 있으면 첫 장이 프로필 사진(전체), 없으면 흉상. 감정은 여기 없다(09-11 사장님). */}
          {photos.length ? <img className="pf-photo" src={photos[0].url} alt={found.name} /> : <div className="pf-portrait"><img src={sprites.happy ?? sprites.neutral} alt={found.name} /></div>}
        </div>

        <div className="pf-body">
          <div className="pf-name">{found.name}</div>
          <div className="pf-tag">“{found.tagline}”</div>
          {user && <div className="pf-follow"><FollowButton characterId={found.id} following={following} name={found.name} /></div>}

          {stage > 0 ? (
            <div className="pf-bond">
              <div className="pf-hearts">{"♥".repeat(stage)}{"♡".repeat(Math.max(0, 5 - stage))}</div>
              <div className="pf-stage">{STAGE_WORD[stage]}</div>
              <div className="pf-bar"><div style={{ width: next ? `${Math.round((1 - next.need / next.total) * 100)}%` : "100%" }} /></div>
              <div className="pf-meta">
                {next ? `다음 단계까지 ${next.need}` : "마지막 단계"} · 나눈 말 {talks}{streak >= 2 ? ` · ${streak}일 연속` : ""}
              </div>
            </div>
          ) : (
            <div className="pf-bond muted">아직 이야기한 적이 없어요</div>
          )}

          {photos.length > 0 ? (
            <div className="pf-gallery">
              {photos.map((p, i) => (
                <figure key={i} className="pf-shot"><img src={p.url} alt="" /></figure>
              ))}
            </div>
          ) : (
            <div className="pf-faces">
              {Object.entries(sprites).map(([e, url]) => (
                <div key={e} className="pf-face"><img src={url} alt={e} /><span>{EMO_KO[e] ?? e}</span></div>
              ))}
            </div>
          )}

          <Link href={`/dot/${slug}`} className="pf-go">채팅하기</Link>
          <Link href="/dot/feed" className="pf-list">피드로</Link>
        </div>
      </div>
    </div>
  );
}

const CSS = `
* { box-sizing:border-box; }
.pf-root { min-height:100dvh; background:#0b0f14; display:flex; align-items:center; justify-content:center;
  font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.pf-phone { width:100%; max-width:430px; height:100dvh; max-height:940px; background:#fff; overflow-y:auto; position:relative; }
.pf-hero { position:relative; height:44%; min-height:300px; background:#1b2330; }
.pf-wall { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; image-rendering:pixelated; }
.pf-shade { position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,0) 40%, rgba(255,255,255,0) 70%, #fff 100%); }
.pf-back { position:absolute; left:8px; top:8px; width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:50%;
  background:rgba(0,0,0,.35); color:#fff; font-size:26px; line-height:1; text-decoration:none; backdrop-filter:blur(4px); }
.pf-portrait { position:absolute; left:50%; bottom:-6px; transform:translateX(-50%); width:200px; height:200px; }
/* 개인 사진이 프로필 사진 — 배경 위에 카드처럼 떠 있다(카톡 프로필의 그 느낌). */
.pf-photo { position:absolute; left:50%; bottom:-28px; transform:translateX(-50%); width:180px; height:225px; object-fit:cover; image-rendering:pixelated; border-radius:22px;
  box-shadow:0 12px 30px rgba(0,0,0,.35); border:4px solid #fff; }
.pf-gallery { display:flex; gap:10px; justify-content:center; margin-top:22px; }
.pf-shot { margin:0; width:96px; }
.pf-shot img { width:96px; height:120px; object-fit:cover; image-rendering:pixelated; border-radius:14px; box-shadow:0 2px 8px rgba(0,0,0,.12); }
.pf-portrait img { width:100%; height:100%; image-rendering:pixelated; object-fit:contain; filter:drop-shadow(0 8px 16px rgba(0,0,0,.25)); }
.pf-body { padding:36px 24px 32px; text-align:center; }
.pf-name { font-size:26px; font-weight:700; letter-spacing:-.4px; color:#111; }
.pf-tag { font-size:14px; color:#5c6570; margin-top:6px; }
.pf-follow { margin-top:12px; }
.pf-bond { margin:18px auto 0; max-width:320px; background:#f5f7fa; border-radius:18px; padding:14px 18px; }
.pf-bond.muted { color:#8a8f98; font-size:14px; }
.pf-hearts { color:#ff5c7a; font-size:18px; letter-spacing:2px; }
.pf-stage { font-size:14px; font-weight:600; margin-top:4px; color:#111; }
.pf-bar { height:8px; background:#e4e9ef; border-radius:999px; overflow:hidden; margin-top:10px; }
.pf-bar > div { height:100%; background:linear-gradient(90deg, #ff9db0, #ffc48c); border-radius:999px; }
.pf-meta { font-size:12px; color:#7b8590; margin-top:8px; }
.pf-faces { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:20px; }
.pf-face { display:flex; flex-direction:column; align-items:center; gap:4px; }
.pf-face img { width:52px; height:52px; image-rendering:pixelated; object-fit:contain; background:#f1f3f6; border-radius:16px; }
.pf-face span { font-size:11px; color:#8a8f98; }
.pf-go { display:block; margin:24px auto 0; max-width:320px; background:#fee500; color:#1f1a00; text-decoration:none; font-weight:700; font-size:16px; padding:15px; border-radius:16px; }
.pf-list { display:block; margin-top:12px; color:#8a8f98; text-decoration:none; font-size:14px; }
`;
