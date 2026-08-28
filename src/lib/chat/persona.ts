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
const OWNER_NAME = process.env.OWNER_NAME ?? "멍크라이온";

/**
 * 소유자를 가리키는 이메일. 쉼표로 여러 개.
 *
 * 처음에는 "회사를 가진 사람"으로 판별했는데 그건 약한 대리 지표였다 —
 * 회사를 아직 안 만들었거나 다른 계정으로 들어오면 못 알아본다. 사람은
 * 계정으로 알아보는 것이 맞다.
 */
const OWNER_EMAILS = (process.env.OWNER_EMAIL ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * `userId` 를 받지 않는다.
 *
 * 예전에는 그것으로 회사를 찾아 소유자를 판별했는데, 지금은 계정의 **이메일**로
 * 본다 — 회사를 아직 안 만들었거나 다른 계정으로 들어와도 알아봐야 하기
 * 때문이다. 인자를 남겨 두면 다음 사람이 그게 쓰이는 줄 알고 신경 쓴다.
 */
export async function speakerFor(db: Supabase): Promise<Speaker | null> {
  const { data } = await db.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  if (OWNER_EMAILS.length > 0 && OWNER_EMAILS.includes(email)) {
    return { name: OWNER_NAME, isOwner: true };
  }
  // 소유자가 아니면 이름만. 아는 척하지 않는다.
  return null;
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
