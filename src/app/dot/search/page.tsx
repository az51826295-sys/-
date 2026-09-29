import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import DotTabs from "../DotTabs";
import { publicCharacters } from "@/lib/dot/load";
import SearchList, { type SearchItem } from "./SearchList";

/**
 * 검색 탭 (227회차 09-29, 사장님 *"트위터나 인스타를 모방해서 검색이랑 피드있고"*).
 *
 * 옛 **친구** 탭(`/dot/pick`)을 대신한다. 둘의 차이는 한 줄이다:
 *   · 친구 탭은 **다 보여 주고 고르라**고 했다 — 사람이 늘면 그냥 명단이 된다.
 *   · 검색 탭은 **찾아서 추가**하게 한다 — 사람이 늘수록 쓸모가 커진다.
 *
 * 설정(톱니)이 친구 탭 오른쪽 위에 있었는데([[kakao-placement-rule]]), 친구 탭이 없어지므로
 * 여기로 데려온다. **같은 목적지 단추는 하나**라는 규칙은 그대로 — 다른 탭엔 안 단다.
 */
export const metadata = { title: "두근도트 — 검색" };
export const viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#ffffff",
};

export default async function DotSearch() {
  const characters = await publicCharacters();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let follows = new Set<string>();
  if (user) {
    const { data: f } = await createServiceClient().from("dot_follows").select("character_id").eq("user_id", user.id);
    follows = new Set(((f ?? []) as { character_id: string }[]).map((x) => x.character_id));
  }
  const items: SearchItem[] = characters.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    tagline: c.tagline ?? "",
    greeting: c.greeting ?? "",
    avatar: c.photos?.[0]?.url ?? c.faces?.neutral ?? c.sprites?.neutral ?? "",
    following: follows.has(c.id),
  }));

  return (
    <div className="sc-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="sc-phone">
        <header className="sc-head">
          <div className="sc-title">검색</div>
          <Link href="/dot/settings" className="sc-gear" aria-label="설정">
            <svg width="24" height="24" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden><path d="M3 0h2v1h1v1h1v2h-1v1h-1v1h-2v-1h-1v-1h-1v-2h1v-1h1zM3 3v2h2v-2z" fill="currentColor" fillRule="evenodd" /></svg>
          </Link>
        </header>
        <div className="sc-body">
          <SearchList items={items} />
        </div>
        <DotTabs on="search" />
      </div>
    </div>
  );
}

const CSS = `
* { box-sizing:border-box; }
.sc-root { min-height:100dvh; background:#0b0f14; display:flex; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.sc-phone { width:100%; max-width:430px; min-height:100dvh; background:#fff; color:#141414; display:flex; flex-direction:column; }
.sc-head { display:flex; align-items:center; padding:14px 16px 10px; }
.sc-title { font-size:20px; font-weight:700; letter-spacing:-.3px; }
/* 227회차 09-29 UI 점검: 아이콘이 24x24 라 손가락이 못 맞혔다. 누를 자리를 44px 로 키운다(보이는 그림은 그대로). */
.sc-gear { margin-left:auto; margin-right:-10px; width:44px; height:44px; color:#5c6570; display:flex; align-items:center; justify-content:center; }
.sc-body { flex:1; min-height:0; overflow-y:auto; padding-bottom:12px; }
`;
