import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 화면 하나를 그리는 데 **네트워크를 몇 번 왕복하는가.**
 *
 * 09-09 사장님: "서버가 너무 느린 것 같음." 재 보니 첫 바이트까지 0.6~1.0초인데
 * 그중 연결은 0.05초뿐이었다 — 나머지는 전부 서버가 DB 를 기다린 시간이다.
 * 서버는 **암스테르담**, Supabase 는 **싱가포르**라 한 번 물을 때마다 지구를
 * 반 바퀴 돈다(왕복 약 180 ms). 방 화면은 그걸 세 번 했다:
 *   1) 누구인지(auth)  2) 이 캐릭터가 누구인지  3) 사이·오늘 쓴 횟수·지난 대화
 *
 * 여기서 두 가지를 고친다.
 *   - **1 과 2 를 나란히** 묻는다. 서로 필요 없는 정보다.
 *   - 캐릭터는 **캐시한다.** 하루에 한 번 바뀔까 말까 한 것을 사람마다 매번 묻고 있었다.
 * 남는 왕복은 둘. 지역을 맞추면(서버도 싱가포르) 이 둘이 각각 180 ms → 5 ms 가 된다.
 */

export type PublicCharacter = {
  id: string; slug: string; name: string; tagline: string; greeting: string; sprites: Record<string, string>;
  /** 첫 화면에서 누를 수 있는 말 몇 마디. 빈 입력창 앞에서 뭘 말할지 모르는 첫 순간을 없앤다. */
  chips: string[];
  /** 프로필용 얼굴 크롭(96px). 흉상을 CSS 로 확대해 자르던 것을 그림 쪽에서 잘라 준 것(68회차). */
  faces: Record<string, string>;
  /** 개인 스냅사진(카톡 프로필 사진). 여행·카페·취미. 프로필·목록이 쓴다. 표정 얼굴은 말풍선 옆에서만. */
  photos: { url: string; caption: string }[];
};

/**
 * 내보내는 캐릭터 목록. 60초 캐시.
 *
 * 새 캐릭터를 냈을 때 최대 1분 늦게 보인다 — 그 1분이 모든 화면에서 왕복 하나를 없앤다.
 */
export const publicCharacters = unstable_cache(
  async (): Promise<PublicCharacter[]> => {
    const db = createServiceClient();
    const { data } = await db
      .from("dot_characters")
      .select("id, slug, name, tagline, greeting, sprites, chips, faces, photos")
      .eq("is_public", true)
      .order("created_at", { ascending: true });
    return (data ?? []) as unknown as PublicCharacter[];
  },
  ["dot-public-characters"],
  { revalidate: 60, tags: ["dot-characters"] },
);

export async function characterBySlug(slug: string): Promise<PublicCharacter | null> {
  return (await publicCharacters()).find((c) => c.slug === slug) ?? null;
}

/**
 * 프로필 그림 여섯 장을 **HTML 에 같이 실어 보낸다.**
 *
 * 09-10 사장님 "왜 이렇게 느려?": 그림 한 장(10KB)이 한국에서 싱가포르 저장소까지 **0.6초**였다.
 * 말풍선마다 표정이 다르니 방 하나에 최대 여섯 번 그 왕복을 한다. 여섯 장을 합쳐도 60KB —
 * 페이지에 박아 보내면 왕복이 0이 된다. 서버에서 한 번 받아 60초 캐시한다.
 */
export const spriteDataUrls = unstable_cache(
  async (slug: string): Promise<Record<string, string>> => {
    const c = (await publicCharacters()).find((x) => x.slug === slug);
    if (!c) return {};
    const out: Record<string, string> = {};
    const all: [string, string][] = [...Object.entries(c.sprites), ...Object.entries(c.faces ?? {}).map(([e, u]) => [`face:${e}`, u] as [string, string])];
    await Promise.all(all.map(async ([emotion, url]) => {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) { out[emotion] = url; return; }
        const b = Buffer.from(await res.arrayBuffer());
        out[emotion] = `data:image/png;base64,${b.toString("base64")}`;
      } catch {
        out[emotion] = url;   // 못 받으면 주소 그대로 — 그림이 아예 안 뜨는 것보다 느린 게 낫다
      }
    }));
    return out;
  },
  ["dot-sprite-data-urls"],
  { revalidate: 60, tags: ["dot-characters"] },
);
