import Link from "next/link";
import DotTabs from "../DotTabs";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { publicCharacters } from "@/lib/dot/load";

/**
 * 목록 — **카톡 친구목록.**
 *
 * 09-09 사장님: "일단 카톡처럼." 대화방만 카톡이고 목록이 딴 세상이면 그 순간
 * 다른 앱이 된다. 그래서 여기도 같은 규칙이다: 왼쪽에 네모난 프로필, 그 옆에
 * 이름과 상태 한 줄. 누르면 방으로 들어간다.
 *
 * 카톡과 다른 칸 하나: 하트(친밀도). 이 앱이 파는 것이라 목록에서부터 보여야
 * "얘랑은 얼마나 친해졌더라" 가 생긴다.
 */
export const metadata = { title: "두근도트" };
export const viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#a5bccd",
};

export default async function DotList() {
  // 누구인지와 캐릭터 목록은 서로 필요 없다 — 나란히. 목록은 60초 캐시라 대개 왕복이 없다.
  const supabase = await createClient();
  const [{ data: { user } }, characters] = await Promise.all([
    supabase.auth.getUser(),
    publicCharacters(),
  ]);
  const db = createServiceClient();

  const bonds = new Map<string, number>();
  /** 추가한(팔로우한) 캐릭터. 방 목록에 나오는 사람은 이 안에 있는 사람뿐이다. */
  const follows = new Set<string>();
  // 카톡 목록의 그 두 칸: **마지막 말**과 **그 시각**. 상태 한 줄 대신, 있으면 이게 뜬다.
  const last = new Map<string, { text: string; at: string; mine: boolean }>();
  const unread = new Map<string, number>();
  if (user && characters.length) {
    // 09-28: 남은 대화를 안 그리니 `dot_usage` 도 안 읽는다 — 안 쓰는 값을 부르면 왕복만 는다.
    const [{ data: bs }, { data: ms }, { data: fs }] = await Promise.all([
      db.from("dot_bonds").select("character_id, stage, last_seen_at").eq("user_id", user.id),
      db.from("dot_messages").select("character_id, role, content, created_at").eq("user_id", user.id).order("id", { ascending: false }).limit(60),
      // 227회차 09-29: 방 목록은 이제 **추가한 사람만**이다(사장님 방식 바꾸기).
      db.from("dot_follows").select("character_id").eq("user_id", user.id),
    ]);
    for (const f of (fs ?? []) as { character_id: string }[]) follows.add(f.character_id);
    const seen = new Map<string, string | null>();
    for (const b of (bs ?? []) as { character_id: string; stage: number; last_seen_at: string | null }[]) { bonds.set(b.character_id, b.stage); seen.set(b.character_id, b.last_seen_at); }
    // 카톡의 안 읽은 수(86회차): 방을 마지막으로 본 시각 뒤에 온 캐릭터 말. 최근 60줄 안에서 센다(그보다 많으면 60+).
    for (const m of (ms ?? []) as { character_id: string; role: string; created_at: string }[]) {
      if (m.role !== "character") continue;
      const at = seen.get(m.character_id);
      if (!seen.has(m.character_id)) continue;                 // 이야기해 본 적 없는 방은 안 센다
      if (!at || m.created_at > at) unread.set(m.character_id, (unread.get(m.character_id) ?? 0) + 1);
    }
    for (const m of (ms ?? []) as { character_id: string; role: string; content: string; created_at: string }[]) {
      if (!last.has(m.character_id)) last.set(m.character_id, { text: m.content.replace(/\n+/g, " "), at: m.created_at, mine: m.role === "user" });
    }
    // 09-29: 예전에는 사이가 0 이면 피드로 **보내 버렸다.** 이제는 안 보낸다 —
    // 추가한 사람이 없는 것은 고장이 아니라 **아직 안 고른 것**이고, 그 자리에는
    // "검색에서 찾아보세요" 가 있어야 한다. 말없이 다른 화면으로 튕기면 사람은 길을 잃는다.
  }

  // 추가한 사람만 방이 된다. 로그인 전에는 아무것도 안 보인다(그 화면은 로그인이 먼저 막는다).
  const 방들 = characters.filter((c) => follows.has(c.id));

  return (
    <div className="kl-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="kl-phone">
        <header className="kl-bar">
          <span className="kl-title">두근도트</span>
          {/*
            226회차 09-28, 사장님 *"오늘 남은 대화는 표시하지말고"*.
            베타 테스터를 받는 참이다. 방 목록 맨 위에 늘 붙어 있는 "오늘 남은 대화 12/15" 는
            들어오자마자 **미터기부터 보여 주는 것**이다 — 처음 온 사람에게 먼저 보일 것이 아니다.
            숫자를 아예 없애지는 않았다: 다 쓰면 그때 카드가 뜨고, 얼굴을 누르면 잔고가 보인다
            (DotChat.tsx 의 "지금 남은 대화 N번" — 그건 사람이 **눌러서** 보는 자리다).
          */}
        </header>

        <div className="kl-list">
          {방들.length === 0 && (
            <div className="kl-empty">
              아직 추가한 사람이 없어요.
              <Link href="/dot/search" className="kl-empty-go">검색에서 찾아보기</Link>
            </div>
          )}
          {[...방들]
            // 카톡처럼 최근에 이야기한 방이 위로.
            .sort((a, b) => (last.get(b.id)?.at ?? "").localeCompare(last.get(a.id)?.at ?? ""))
            .map((c) => {
            const stage = bonds.get(c.id) ?? 0;
            const l = last.get(c.id);
            return (
              <Link key={c.id} href={`/dot/${c.slug}`} className="kl-item">
                <div className="kl-face">
                  {/* 목록의 프로필 사진 = 개인 스냅사진 첫 장(없으면 얼굴). 표정은 말풍선 옆에서만. */}
                  {c.photos?.[0]?.url ? <img src={c.photos[0].url} alt={c.name} className="photo" />
                    : (c.faces?.neutral || c.sprites?.neutral) ? <img src={c.faces?.neutral ?? c.sprites.neutral} alt={c.name} className={c.faces?.neutral ? "face" : ""} /> : null}
                </div>
                <div className="kl-text">
                  <div className="kl-name">{c.name}</div>
                  <div className="kl-say">{l ? (l.mine ? "나: " : "") + l.text : c.tagline}</div>
                </div>
                <div className="kl-right">
                  {l && <div className="kl-when">{whenLabel(l.at)}</div>}
                  {(unread.get(c.id) ?? 0) > 0 ? <div className="kl-badge">{unread.get(c.id)}</div> : <div className="kl-hearts">{stage > 0 ? "♥".repeat(stage) + "♡".repeat(Math.max(0, 5 - stage)) : "처음"}</div>}
                </div>
              </Link>
            );
          })}
        </div>

        {!user && <div className="kl-warn">로그인하면 이야기를 이어서 할 수 있어요</div>}
        <DotTabs on="chats" />
      </div>
    </div>
  );
}

/**
 * 목록의 시각 — 카톡 규칙: 오늘이면 "오후 9:17", 어제면 "어제", 그 전은 "9월 9일".
 * 서버에서 만든다(한국 시간으로 고정). 목록은 시각이 어긋나도 화면이 죽지 않는 자리라 서버에서 해도 된다.
 */
function whenLabel(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  const now = new Date(Date.now() + 9 * 3_600_000);
  const key = (x: Date) => `${x.getUTCFullYear()}-${x.getUTCMonth()}-${x.getUTCDate()}`;
  const y = new Date(now); y.setUTCDate(now.getUTCDate() - 1);
  if (key(k) === key(now)) { const h = k.getUTCHours(); return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(k.getUTCMinutes()).padStart(2, "0")}`; }
  if (key(k) === key(y)) return "어제";
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}

const CSS = `
* { box-sizing:border-box; }
.kl-root { min-height:100dvh; background:#0b0f14; display:flex; align-items:center; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.kl-phone { width:100%; max-width:430px; height:100dvh; max-height:940px; background:#fff; display:flex; flex-direction:column; overflow:hidden; }
.kl-bar { display:flex; align-items:baseline; gap:8px; padding:18px 20px 12px; }
.kl-title { flex:1; font-size:24px; font-weight:700; letter-spacing:-.4px; color:#111; }
.kl-list { flex:1; min-height:0; overflow-y:auto; padding:4px 8px; }
.kl-item { display:flex; align-items:center; gap:14px; padding:12px 12px; border-radius:16px; text-decoration:none; color:#111; }
.kl-item:active { background:#f2f4f7; }
.kl-face { width:52px; height:52px; flex:0 0 52px; background:#f1f3f6; border-radius:18px; overflow:hidden; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,.08); }
.kl-face img { width:100%; height:100%; image-rendering:pixelated; object-fit:contain; object-position:center 18%; transform:scale(1.5); }
.kl-face img.face { object-position:center; transform:none; }
.kl-face img.photo { object-fit:cover; object-position:center top; transform:none; }
.kl-text { flex:1; min-width:0; }
.kl-name { font-size:16px; font-weight:600; margin-bottom:3px; letter-spacing:-.2px; }
.kl-say { font-size:13px; color:#7b8590; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.kl-right { display:flex; flex-direction:column; align-items:flex-end; gap:5px; }
.kl-when { font-size:11px; color:#a3aab3; white-space:nowrap; }
.kl-badge { min-width:18px; height:18px; padding:0 5px; background:#ff4a3d; color:#fff; font-size:11px; font-weight:700; line-height:1; display:flex; align-items:center; justify-content:center; border-radius:9px; clip-path:polygon(2px 0, calc(100% - 2px) 0, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 0 calc(100% - 2px), 0 2px); }
.kl-hearts { font-size:12px; color:#ff5c7a; letter-spacing:1px; white-space:nowrap; }
.kl-empty-go { display:inline-block; margin-top:12px; padding:10px 18px; background:#fee500; color:#1f1a00; text-decoration:none; border-radius:999px; font-size:14px; font-weight:600; }
.kl-empty { padding:44px 14px; font-size:14px; color:#8a8f98; text-align:center; line-height:1.7; }
.kl-warn { background:#fff8d6; color:#5a4a00; font-size:13px; padding:10px 16px; }
`;
