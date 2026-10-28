/**
 * **앱 안에서 사는 길 — Play Billing** (10-28 사장님 "플레이스토어 결제하는 거 해놔").
 *
 * 지금까지 이 자리는 **0줄이었다.** `/api/dot/buy` 는 구매 토큰을 받아 구글에 확인할
 * 준비가 돼 있었는데, 그 토큰을 **만드는 쪽이 없었다** — 그래서 결제 단추는 눌러도
 * 영원히 503 이었다. 토큰을 만드는 것은 브라우저가 아니라 **앱 껍데기**가 하는 일이다.
 *
 * ## 되는 조건
 *
 * TWA(앱 껍데기)가 Play Billing 을 켜고 빌드돼 있어야 `getDigitalGoodsService` 가 생긴다.
 * 웹 브라우저에서 열면 그 함수가 **없다** — 그때는 이 모듈이 `가능: false` 를 돌려주고
 * 화면은 웹 결제 쪽을 보여 준다. 구글 정책상 **앱 안에서는 Play 결제를 써야 하고**
 * 앱 밖(브라우저)에서는 다른 길이 되므로, 이 가름이 정책 가름이기도 하다.
 *
 * ## Digital Goods API v2 를 쓴다
 *
 * v1 에 있던 `acknowledge()` 는 v2 에서 **없어졌다.** 구독 승인은 서버가
 * Play Developer API 로 한다(`playVerify.구독승인`). 그래서 이 파일은 승인을 하지 않는다 —
 * 하려고 하면 없는 함수를 부른다. `consume()` 은 소모품용이라 구독에는 안 쓴다.
 *
 * ## 안 하는 것
 *
 * **결과를 이 파일이 믿지 않는다.** `PaymentRequest` 가 성공을 돌려줘도 그건 화면의 말이다.
 * 구독이 켜지는 것은 서버가 구글에 직접 물어본 뒤다([[rookery-is-the-socket]] 의 같은 규칙:
 * 화면이 보낸 값을 믿으면 아무나 지어낸다).
 */

export const PLAY_METHOD = "https://play.google.com/billing";

type DigitalGoodsService = {
  getDetails(itemIds: string[]): Promise<{ itemId: string; title: string; price: { currency: string; value: string } }[]>;
  listPurchases(): Promise<{ itemId: string; purchaseToken: string }[]>;
};

declare global {
  interface Window {
    getDigitalGoodsService?: (method: string) => Promise<DigitalGoodsService>;
  }
}

/** 앱 안인가 — **있다고 넘겨짚지 않는다.** 함수가 있어도 서비스를 못 받으면 아닌 것이다. */
export async function playService(): Promise<DigitalGoodsService | null> {
  if (typeof window === "undefined") return null;
  if (!window.getDigitalGoodsService || typeof PaymentRequest === "undefined") return null;
  try {
    return await window.getDigitalGoodsService(PLAY_METHOD);
  } catch {
    /* TWA 가 Play Billing 없이 빌드됐을 때 여기로 온다. 앱인데도 못 사는 상태라
       화면은 웹 쪽으로 흘려보내면 된다 — 사람에게는 어느 쪽이든 "사는" 하나의 일이다. */
    return null;
  }
}

export type 앱결제결과 =
  | { ok: true; purchaseToken: string }
  | { ok: false; 까닭: "앱아님" | "상품없음" | "취소" | "실패"; 글?: string };

/**
 * 산다. **구매 토큰만 들고 나온다** — 그 토큰이 진짜인지는 서버가 구글에 묻는다.
 *
 * `complete()` 를 부르기 **전에** 서버 확인을 끝낸다(`서버확인`). 먼저 성공이라고
 * 닫아 버리면, 서버가 거절했을 때 사람 화면엔 "샀다" 가 떠 있고 구독은 안 켜진다.
 */
export async function 앱에서사기(
  itemId: string,
  서버확인: (purchaseToken: string) => Promise<boolean>,
): Promise<앱결제결과> {
  const svc = await playService();
  if (!svc) return { ok: false, 까닭: "앱아님" };

  let 값 = { currency: "KRW", value: "0" };
  let 이름 = "멘헤라 모드";
  try {
    const [d] = await svc.getDetails([itemId]);
    if (!d) return { ok: false, 까닭: "상품없음", 글: `Play Console 에 ${itemId} 가 없다` };
    값 = d.price; 이름 = d.title || 이름;
  } catch (e) {
    return { ok: false, 까닭: "상품없음", 글: e instanceof Error ? e.message : String(e) };
  }

  let res: PaymentResponse;
  try {
    const req = new PaymentRequest(
      [{ supportedMethods: PLAY_METHOD, data: { sku: itemId } }],
      { total: { label: 이름, amount: { currency: 값.currency, value: 값.value } } },
    );
    res = await req.show();
  } catch (e) {
    /* 사람이 창을 닫은 것과 진짜 고장을 **가른다** — 닫은 사람에게 오류를 보여 주면
       자기가 뭘 잘못한 줄 안다. */
    const name = (e as { name?: string })?.name ?? "";
    if (name === "AbortError" || name === "NotAllowedError") return { ok: false, 까닭: "취소" };
    return { ok: false, 까닭: "실패", 글: e instanceof Error ? e.message : String(e) };
  }

  const token = (res.details as { purchaseToken?: string })?.purchaseToken ?? "";
  if (!token) {
    await res.complete("fail").catch(() => {});
    return { ok: false, 까닭: "실패", 글: "구매 토큰이 안 왔다" };
  }

  const 좋음 = await 서버확인(token).catch(() => false);
  await res.complete(좋음 ? "success" : "fail").catch(() => {});
  return 좋음 ? { ok: true, purchaseToken: token } : { ok: false, 까닭: "실패", 글: "서버가 확인하지 못했다" };
}

/**
 * **못 받은 결제를 찾아 온다.**
 *
 * 결제는 됐는데 그 직후에 앱이 죽거나 인터넷이 끊기면, 구글에는 구매가 있고 우리 쪽은
 * 모르는 상태가 된다. 그 사람은 돈을 내고 아무것도 못 받는다. 앱이 열릴 때 한 번 훑어서
 * 서버에 다시 내민다 — 서버의 `ref` 가 중복을 막으므로 여러 번 불러도 안전하다.
 */
export async function 못받은것찾기(서버확인: (purchaseToken: string) => Promise<boolean>): Promise<number> {
  const svc = await playService();
  if (!svc) return 0;
  let 산것: { itemId: string; purchaseToken: string }[] = [];
  try { 산것 = await svc.listPurchases(); } catch { return 0; }
  let 센것 = 0;
  for (const p of 산것) {
    if (await 서버확인(p.purchaseToken).catch(() => false)) 센것++;
  }
  return 센것;
}
