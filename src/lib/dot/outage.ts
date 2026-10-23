/**
 * **DB 가 막혔을 때 사람에게 보이는 것** (10-19).
 *
 * 10-19 에 Supabase 두 개가 `exceed_egress_quota` 로 막혔다(402). 두근도트는 그 순간
 * 캐릭터 목록이 **맨 500** 이었다 — 하필 구글 공개 심사 중이었다. 처음 온 사람도,
 * 심사하는 사람도 "고장난 앱" 으로 본다.
 *
 * 고장을 숨기자는 게 아니다. **왜 안 되는지 한국어로 말하고, 다시 해 볼 길을 준다.**
 * 쓰는 사람에게 `exceed_egress_quota` 는 아무 뜻도 없다.
 */

/**
 * Supabase 가 "이 프로젝트는 막혔다" 로 거절한 것인가 (요금·한도)
 *
 * 10-23: 처음엔 **오류 글자만** 봤는데 로그인 화면 띠가 안 떴다. 까닭은
 * `select(..., { head: true })` 가 **본문을 안 받아** `error.message` 가 **빈 글자**였던 것.
 * 글이 비었다고 멀쩡한 게 아니다 — 진짜 신호는 **상태 402** 인데 그걸 안 보고 있었다.
 * (빈 값을 "문제 없음" 으로 읽는 것은 09-27 에 적어 둔 사고와 같은 모양이다.)
 */
export function 막힌것인가(
  e: { message?: string; code?: string } | null | undefined,
  status?: number,
): boolean {
  if (status === 402) return true;
  const m = (e?.message ?? "").toLowerCase();
  return m.includes("restricted") || m.includes("exceed_egress") || m.includes("quota")
    || m.includes("payment required") || e?.code === "402";
}

/**
 * **언제 돌아오는지 말한다** (10-23).
 *
 * 10-23 에 앱이 스토어에 올라갔는데 서버는 아직 막혀 있었다. "곧 고쳐 둘게요" 만 보면
 * 새로 깐 사람은 **그냥 지운다** — 언제 와 봐야 하는지를 모르니까.
 * 날짜를 적으면 지우는 대신 기다린다. (Supabase 결제 주기가 27일에 돈다)
 */
export const 돌아오는날 = "10월 27일";

export const 멈춤말 = {
  제목: "잠시 멈춰 있어요",
  본문: `서버가 이번 달 쓸 수 있는 양을 다 썼어요. ${돌아오는날}에 다시 열려요.`,
  짧게: `${돌아오는날}에 다시 열려요`,
  단추: "다시 해 보기",
} as const;

/** API 가 돌려줄 몸통 — 503 과 함께 쓴다(500 은 "우리도 모른다" 는 뜻이라 거짓말이 된다) */
export const 멈춤응답 = () =>
  Response.json({ error: `${멈춤말.제목} — ${멈춤말.본문}`, outage: true }, { status: 503 });
