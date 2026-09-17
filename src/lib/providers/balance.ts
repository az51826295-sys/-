/**
 * 싼 자리 지갑을 들여다보는 눈.
 *
 * ## 왜 필요한가
 *
 * 09-09: DeepSeek 잔액이 09-07 저녁에 0이 됐고, 그 뒤 사흘간 `conversation`·`routine`
 * 등급 일이 **전부 gpt-5 로 갔다.** $17.9. 라우터가 위로 넘겨서 **살려 놓기 때문에**
 * 실행에는 오류가 안 적히고, 답도 안 나빠지고, 화면도 멀쩡하다. 남는 곳은 원장 하나다.
 *
 * 원장은 **이미 쓴 뒤에** 알려 준다. 그래서 쓰기 전에 보는 눈이 따로 필요하다.
 *
 * ## 왜 자동 충전으로 못 막는가
 *
 * 09-09 사장님: "오? 딥시크 자동 충전이 없네." DeepSeek 은 선불이고 자동 충전이
 * 없다 — 즉 **잔액이 0이 되는 것은 사고가 아니라 예정된 일**이다. 사람이 넣어 줄
 * 때까지 계속 새므로, 새기 시작한 순간을 우리가 알아야 한다.
 */

export type Wallet = { vendor: string; usd: number | null; available: boolean; note: string };

/** 이 아래로 떨어지면 곧 0 이 된다고 본다(도트 채팅 하루치 언저리). */
export const LOW_USD = 3;

export async function deepSeekWallet(): Promise<Wallet> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { vendor: "deepseek", usd: null, available: false, note: "열쇠가 없다" };
  try {
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { vendor: "deepseek", usd: null, available: false, note: `조회 실패 ${res.status}` };
    const body = (await res.json()) as {
      is_available?: boolean;
      balance_infos?: { currency: string; total_balance: string }[];
    };
    const usd = body.balance_infos?.find((b) => b.currency === "USD");
    const amount = usd ? Number(usd.total_balance) : null;
    return {
      vendor: "deepseek",
      usd: Number.isFinite(amount) ? (amount as number) : null,
      available: body.is_available === true,
      // 값을 판정으로 바꾸지 않는다 — 부르는 쪽이 자기 문턱으로 판단한다.
      note: amount === null ? "USD 잔액 칸이 없다" : `$${amount.toFixed(2)}`,
    };
  } catch (e) {
    // 조회가 실패한 것과 잔액이 0인 것은 **다르다.** 못 봤으면 못 봤다고 한다.
    return { vendor: "deepseek", usd: null, available: false, note: `조회 못 함: ${e instanceof Error ? e.message : String(e)}` };
  }
}
