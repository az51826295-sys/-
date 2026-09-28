/**
 * **처음 온 사람에게는 한 명만** (227회차 09-29, 사장님 방식 바꾸기).
 *
 * 사장님: *"기본 캐릭터 하나 있고 나머지는 검색하거나 피드 보고 마음에들면 추가하는거야."*
 *
 * 지금까지는 첫 화면에 넷이 다 있었다. 그러면 고르는 재미가 없고, 사람이 늘수록 첫 화면이
 * 명단이 된다. 인스타는 처음에 아무도 없고 **찾아서 팔로우**한다 — 그 결을 따른다.
 * 다만 **완전히 빈 화면**은 처음 온 사람에게 고장으로 보인다. 그래서 딱 한 명만 먼저 넣어 둔다.
 *
 * **다시 넣지 않는 법.** 나가기로 전부 내보낸 사람에게 기본 캐릭터를 도로 넣으면
 * 그건 나가기가 아니다([[cancel-is-not-recall]] 과 같은 결 — 사람이 한 것을 시스템이 되돌리면 안 된다).
 * 그래서 **말을 한 번이라도 걸어 본 적이 있으면**(`dot_bonds` 에 줄이 있으면) 건드리지 않는다.
 * 처음 온 사람만 사이도 0, 팔로우도 0 이다.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { publicCharacters } from "@/lib/dot/load";

/** 처음 온 사람이 만나는 한 명. 바꾸려면 이 줄만 바꾸면 된다. */
export const STARTER_SLUG = "yuna";

/**
 * 처음 온 사람이면 기본 캐릭터 한 명을 넣어 준다. 이미 쓰던 사람은 아무것도 안 한다.
 * 실패해도 화면은 그려야 하므로 던지지 않는다 — **없으면 빈 피드**일 뿐이고, 그건 고장이 아니다.
 */
export async function ensureStarter(userId: string): Promise<void> {
  try {
    const db = createServiceClient();
    const [{ count: follows }, { count: bonds }] = await Promise.all([
      db.from("dot_follows").select("character_id", { count: "exact", head: true }).eq("user_id", userId),
      db.from("dot_bonds").select("character_id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    // 하나라도 있으면 **쓰던 사람**이다. 나가기로 0 이 된 사람은 bonds 가 남아 있어 여기서 걸러진다.
    if ((follows ?? 0) > 0 || (bonds ?? 0) > 0) return;
    const cs = await publicCharacters();
    const starter = cs.find((c) => c.slug === STARTER_SLUG) ?? cs[0];
    if (!starter) return;
    await db.from("dot_follows").upsert({ user_id: userId, character_id: starter.id }, { onConflict: "user_id,character_id" });
  } catch {
    // 조용히 넘긴다 — 첫 화면을 못 그리게 하는 것이 더 나쁘다.
  }
}
