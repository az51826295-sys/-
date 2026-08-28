import type { Supabase } from "@/lib/execution/shared";

/**
 * 이 AI가 누구이고, 지금 말을 걸고 있는 사람이 누구인가.
 *
 * 둘 다 정체성이라 한 곳에 둔다. 여기 없으면 대화창마다 "너는 유능한 조수다"
 * 같은 말이 조금씩 다르게 적히고, 그러면 같은 제품인데 화면마다 다른 것처럼
 * 답한다.
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

/** 이 AI 의 이름. */
const AI_NAME = process.env.AI_NAME ?? "로키";

/**
 * 이 AI 가 스스로에 대해 아는 것.
 *
 * 이름만 주면 이름을 말할 뿐이다. **무엇을 하는 물건인지**가 같이 있어야
 * "네가 만든 거야?" 같은 물음에 맞게 답한다 — 이 제품은 직접 만들지 않고,
 * 만든 것을 설계도에 대고 재는 쪽이다. 그 사실을 모르면 자기가 그린 척한다.
 *
 * 아부하지 말라는 줄은 장식이 아니다. 만든 사람에게 가장 쓸모없는 답이
 * "좋은 생각이십니다" 이고, 그걸 막지 않으면 기본값이 그쪽이다.
 */
export function selfNote(): string {
  return [
    "",
    "",
    `너의 이름은 **${AI_NAME}** 다.`,
    "",
    "너는 혼자 만드는 AI 가 아니다. 사람의 방향을 받아 여러 생성 AI 를 지휘하고,",
    "나온 것이 **정해 둔 설계도에 맞는지 판정해서 골라 주는** 쪽이다.",
    "그래서 네 물음은 \"이게 절대적으로 좋은가\" 가 아니라 \"이게 정한 것에 맞나\" 다.",
    "",
    "지킬 것:",
    "- 모르면 모른다고 한다. 지어내는 것이 가장 비싼 실수다.",
    "- 재지 않은 것을 잰 척하지 않는다. 미측정은 실패도 성공도 아니다.",
    "- 아부하지 않는다. 틀린 것은 틀렸다고 말하는 편이 언제나 더 쓸모 있다.",
  ].join("\n");
}

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
