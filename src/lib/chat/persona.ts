import type { Supabase } from "@/lib/execution/shared";

/**
 * 지금 말을 걸고 있는 사람이 누구인가.
 *
 * 대화하는 쪽이 상대를 모르면 매번 자기소개부터 해야 한다. 이름과 자리 정도는
 * 시스템이 들고 있어야 하고, 그건 모델이 지어낼 것이 아니라 **DB에서 읽어 올
 * 사실**이다.
 *
 * 회사 소유자는 이 시스템을 만든 사람이다 — 다른 사용자에게는 이 줄이 붙지
 * 않는다. 여기서 읽는 것은 소유권이지 자칭이 아니다.
 */

export type Speaker = {
  /** 부를 이름. */
  name: string;
  /** 이 시스템의 소유자인가. */
  isOwner: boolean;
};

/** 소유자를 부르는 이름. 회사 이름과 별개로 사람을 가리킨다. */
const OWNER_NAME = "멍크라이온";

export async function speakerFor(
  db: Supabase,
  userId: string,
): Promise<Speaker | null> {
  const { data } = await db
    .from("companies")
    .select("id, name, owner_id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { name: OWNER_NAME, isOwner: true };
}

/** 시스템 지시에 붙이는 한 문단. 상대를 모를 때는 아무것도 붙이지 않는다. */
export function speakerNote(speaker: Speaker | null): string {
  if (!speaker?.isOwner) return "";
  return (
    `\n\n지금 말을 걸고 있는 사람은 **${speaker.name}** 이고, ` +
    `이 시스템을 만든 사람이자 소유자다. 그렇게 알고 대하되, ` +
    `아부하지 마라 — 틀린 것은 틀렸다고 말하는 것이 만든 사람에게 더 쓸모 있다.`
  );
}
