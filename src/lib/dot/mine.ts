/**
 * **내 창** — 내가 올린 것, 캐릭터가 준 하트, 그리고 맞팔 (227회차 09-29).
 *
 * 사장님: *"자신의 창도 있어야지 그리고 하트5 개 받으면 맞팔해주는걸로해."*
 *
 * 인스타에서 프로필 탭이 하는 일은 **내가 쌓은 것을 보는 것**이다. 그런데 지금까지 두근도트에서
 * 사람은 **보기만** 했다 — 캐릭터가 올리고 사람은 하트를 눌렀다. 그래서 프로필을 만들려면
 * 먼저 사람이 **올릴 수 있어야** 한다. 그게 이 파일이 있는 이유다.
 *
 * ## 하트는 어떻게 오나 (모델 0 · 값 0)
 * 게시물을 올리면 **내가 추가한 캐릭터들**이 각자 하트를 줄지 정한다. 친할수록 잘 준다.
 * 다만 **한꺼번에 다 오면 가짜로 보인다** — 사람은 그걸 바로 안다. 그래서 하트마다 시각을
 * 앞으로 몇 분~몇 시간 뒤로 잡아 두고, 화면은 **그 시각이 지난 것만** 센다. 시간이 지나며 늘어난다.
 *
 * ## 맞팔
 * 한 캐릭터가 내게 준 하트가 **누적 {@link 맞팔_하트} 개**가 되면 그 캐릭터가 나를 맞팔한다.
 * 게시물 하나가 아니라 **그 캐릭터가 나에게 준 것 전부**를 센다 — 한 장 잘 찍은 것보다
 * 꾸준히 보는 쪽이 사이가 가까워지는 것에 가깝다.
 *
 * 판정은 **읽을 때** 한다(조회 시 upsert). 하트가 시간을 두고 도착하므로 "올린 순간"에는
 * 셀 수가 없다 — 셀 수 없는 때에 세면 늘 0 이다([[unmeasurable-test-is-not-a-failure]]).
 */
import { createServiceClient } from "@/lib/supabase/service";

/** 맞팔이 되는 하트 수. 사장님이 정한 값. */
export const 맞팔_하트 = 5;

export type MyPost = { id: number; image: string; caption: string; at: string; likes: number };

/** 게시물 한 장에 캐릭터가 하트를 줄 확률. 친밀도가 높을수록 잘 준다(0.30 ~ 0.90). */
function 하트확률(stage: number): number {
  return Math.min(0.9, 0.3 + 0.15 * Math.max(0, stage));
}

/**
 * 올린 직후 하트를 **예약**한다. 줄은 지금 만들고 시각만 앞으로 둔다.
 * 실패해도 게시는 성공이다 — 하트가 안 오는 것보다 글이 안 올라가는 것이 나쁘다.
 */
export async function 하트예약(userId: string, postId: number): Promise<number> {
  try {
    const db = createServiceClient();
    const [{ data: fs }, { data: bs }] = await Promise.all([
      db.from("dot_follows").select("character_id").eq("user_id", userId),
      db.from("dot_bonds").select("character_id, stage").eq("user_id", userId),
    ]);
    const stage = new Map<string, number>();
    for (const b of (bs ?? []) as { character_id: string; stage: number }[]) stage.set(b.character_id, b.stage ?? 0);
    const 줄: { post_id: number; character_id: string; created_at: string }[] = [];
    for (const f of (fs ?? []) as { character_id: string }[]) {
      if (Math.random() > 하트확률(stage.get(f.character_id) ?? 0)) continue;
      // 1분 ~ 3시간 뒤. 사람마다 보는 때가 다르니 한 줄로 몰리지 않는다.
      const 뒤 = 60_000 + Math.random() * 3 * 3600_000;
      줄.push({ post_id: postId, character_id: f.character_id, created_at: new Date(Date.now() + 뒤).toISOString() });
    }
    if (!줄.length) return 0;
    const { error } = await db.from("dot_user_post_likes").upsert(줄, { onConflict: "post_id,character_id" });
    if (error) return 0;
    return 줄.length;
  } catch {
    return 0;
  }
}

export type MineView = {
  posts: MyPost[];
  /** 지금까지 **도착한** 하트 전부. */
  hearts: number;
  /** 맞팔한 캐릭터. */
  followers: { slug: string; name: string; avatar: string }[];
  /** 내가 추가한 수. */
  following: number;
  /** 캐릭터별 도착한 하트 — 맞팔까지 얼마나 남았나를 보여 준다. */
  progress: { slug: string; name: string; avatar: string; hearts: number }[];
};

/** 내 창에 쓸 것 전부. 읽으면서 맞팔 판정도 같이 한다. */
export async function mineView(userId: string): Promise<MineView> {
  const db = createServiceClient();
  const 이제 = new Date().toISOString();
  const [{ data: ps }, { data: fs }] = await Promise.all([
    db.from("dot_user_posts").select("id, image_url, caption, created_at").eq("user_id", userId).order("id", { ascending: false }).limit(60),
    db.from("dot_follows").select("character_id").eq("user_id", userId),
  ]);
  const posts0 = (ps ?? []) as { id: number; image_url: string; caption: string | null; created_at: string }[];
  const ids = posts0.map((p) => p.id);

  // **도착한 하트만** 센다. 아직 시각이 안 된 것은 없는 것과 같다.
  let likes: { post_id: number; character_id: string }[] = [];
  if (ids.length) {
    const { data } = await db.from("dot_user_post_likes").select("post_id, character_id").in("post_id", ids).lte("created_at", 이제);
    likes = (data ?? []) as { post_id: number; character_id: string }[];
  }
  const 글별 = new Map<number, number>();
  const 사람별 = new Map<string, number>();
  for (const l of likes) {
    글별.set(l.post_id, (글별.get(l.post_id) ?? 0) + 1);
    사람별.set(l.character_id, (사람별.get(l.character_id) ?? 0) + 1);
  }

  // 맞팔 판정 — 문턱을 넘은 캐릭터를 넣는다. 이미 있으면 그대로다(upsert).
  const 넘은이 = [...사람별.entries()].filter(([, n]) => n >= 맞팔_하트).map(([id]) => id);
  if (넘은이.length) {
    await db.from("dot_character_follows")
      .upsert(넘은이.map((character_id) => ({ character_id, user_id: userId })), { onConflict: "character_id,user_id" });
  }

  const { data: back } = await db.from("dot_character_follows").select("character_id").eq("user_id", userId);
  const 맞팔목록 = new Set(((back ?? []) as { character_id: string }[]).map((r) => r.character_id));

  // 이름·사진은 한 번에
  const 볼사람 = new Set<string>([...맞팔목록, ...사람별.keys(), ...((fs ?? []) as { character_id: string }[]).map((f) => f.character_id)]);
  const 정보 = new Map<string, { slug: string; name: string; avatar: string }>();
  if (볼사람.size) {
    const { data: cs } = await db.from("dot_characters").select("id, slug, name, photos").in("id", [...볼사람]);
    for (const c of (cs ?? []) as { id: string; slug: string; name: string; photos: { url: string }[] | null }[]) {
      정보.set(c.id, { slug: c.slug, name: c.name, avatar: c.photos?.[0]?.url ?? "" });
    }
  }

  return {
    posts: posts0.map((p) => ({ id: p.id, image: p.image_url, caption: p.caption ?? "", at: p.created_at, likes: 글별.get(p.id) ?? 0 })),
    hearts: likes.length,
    followers: [...맞팔목록].map((id) => 정보.get(id)).filter((x): x is { slug: string; name: string; avatar: string } => !!x),
    following: (fs ?? []).length,
    progress: [...사람별.entries()]
      .filter(([id]) => !맞팔목록.has(id) && 정보.has(id))
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ ...정보.get(id)!, hearts: n })),
  };
}
