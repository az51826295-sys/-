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

/** Supabase 가 "이 프로젝트는 막혔다" 로 거절한 것인가 (요금·한도) */
export function 막힌것인가(e: { message?: string; code?: string } | null | undefined): boolean {
  const m = (e?.message ?? "").toLowerCase();
  return m.includes("restricted") || m.includes("exceed_egress") || m.includes("quota")
    || m.includes("payment required") || e?.code === "402";
}

export const 멈춤말 = {
  제목: "잠시 멈춰 있어요",
  본문: "서버가 이번 달 쓸 수 있는 양을 다 썼어요. 곧 고쳐 둘게요.",
  단추: "다시 해 보기",
} as const;

/** API 가 돌려줄 몸통 — 503 과 함께 쓴다(500 은 "우리도 모른다" 는 뜻이라 거짓말이 된다) */
export const 멈춤응답 = () =>
  Response.json({ error: `${멈춤말.제목} — ${멈춤말.본문}`, outage: true }, { status: 503 });
