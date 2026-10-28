/**
 * **구글에 "이 구독 진짜 샀니?" 물어본다** (10-25).
 *
 * 왜 있어야 하나: 10-24 에 `/api/dot/buy` 는 `BILLING_OPEN=1` 만 켜면 **아무나 그 주소로 POST 해서
 * 크레딧을 받아 가는** 자리였다. 구매 토큰 확인이 TODO 로 남아 있었기 때문이다.
 * 스위치 하나가 지갑을 여는 구조는 안 된다 — 그래서 **확인이 없으면 안 준다.**
 *
 * 열쇠: Google Cloud 서비스 계정 JSON 을 `PLAY_VERIFY_KEY` 에 통째로 넣는다(한 줄 JSON).
 * 그 계정을 Play Console → 사용자 및 권한에서 **재무 데이터 보기** 권한으로 초대해야 한다.
 * 열쇠가 없으면 이 모듈은 `{ ok:false, 까닭:"열쇠없음" }` 을 돌려주고, 부르는 쪽이 막는다.
 */

export type 확인결과 =
  | { ok: true; 만료: string; 자동갱신: boolean; 주문: string | null; 승인됨: boolean }
  | { ok: false; 까닭: "열쇠없음" | "못물어봄" | "거절" | "안삼"; 글?: string };

type 열쇠 = { client_email: string; private_key: string };

function 열쇠읽기(): 열쇠 | null {
  const raw = process.env.PLAY_VERIFY_KEY;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as 열쇠;
    return j.client_email && j.private_key ? j : null;
  } catch { return null; }
}

/** 서비스 계정으로 구글 토큰을 받는다 — 서명은 Node 기본 crypto 로 한다(라이브러리 안 쓴다) */
async function 구글토큰(k: 열쇠): Promise<string | null> {
  const { createSign } = await import("node:crypto");
  const 이제 = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const 머리 = b64({ alg: "RS256", typ: "JWT" });
  const 몸 = b64({
    iss: k.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: 이제,
    exp: 이제 + 3600,
  });
  const sig = createSign("RSA-SHA256").update(`${머리}.${몸}`).sign(k.private_key.replace(/\\n/g, "\n"), "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${머리}.${몸}.${sig}` }),
  });
  if (!r.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { access_token?: string };
  return j.access_token ?? null;
}

/**
 * 구독 하나를 확인한다.
 * `안삼` 과 `거절` 을 **가른다** — 안 산 것은 사람에게 조용히 알리고, 거절은 장부에 남겨야 한다.
 */
export async function 구독확인(패키지: string, 상품: string, 토큰: string): Promise<확인결과> {
  const k = 열쇠읽기();
  if (!k) return { ok: false, 까닭: "열쇠없음" };

  const at = await 구글토큰(k);
  if (!at) return { ok: false, 까닭: "못물어봄", 글: "서비스 계정 토큰을 못 받았다" };

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(패키지)}`
    + `/purchases/subscriptions/${encodeURIComponent(상품)}/tokens/${encodeURIComponent(토큰)}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${at}` } });

  /* 404·410 은 "그런 구매가 없다" — 가짜 토큰이거나 이미 지워진 것이다 */
  if (r.status === 404 || r.status === 410) return { ok: false, 까닭: "안삼" };
  if (!r.ok) return { ok: false, 까닭: "못물어봄", 글: `HTTP ${r.status}` };

  const j = (await r.json().catch(() => ({}))) as {
    expiryTimeMillis?: string; autoRenewing?: boolean; orderId?: string; paymentState?: number;
    acknowledgementState?: number;
  };
  const 만료ms = Number(j.expiryTimeMillis ?? 0);
  if (!만료ms) return { ok: false, 까닭: "거절", 글: "만료 시각이 없다" };

  /* paymentState 0 = 결제 대기(무료 체험·보류). 그건 아직 돈이 안 들어온 것이라 안 열어 준다. */
  if (j.paymentState === 0) return { ok: false, 까닭: "거절", 글: "결제 대기 중" };

  /* 이미 지난 구독이면 안 열어 준다 — 옛 토큰을 다시 내밀어도 소용없게 */
  if (만료ms < Date.now()) return { ok: false, 까닭: "거절", 글: "이미 끝난 구독" };

  return {
    ok: true,
    만료: new Date(만료ms).toISOString().slice(0, 10),
    자동갱신: !!j.autoRenewing,
    주문: j.orderId ?? null,
    /* 1 = 이미 승인됨. 0 이면 **우리가 승인해야 한다** — 아래 `구독승인` 참고. */
    승인됨: j.acknowledgementState === 1,
  };
}

/**
 * **구독을 승인한다** (10-28 에 빠져 있던 것을 채움).
 *
 * 구글은 산 지 **3일 안에 승인하지 않으면 자동으로 환불하고 구독을 거둬 간다.**
 * 즉 승인을 안 하면 사람은 돈을 냈다가 사흘 뒤에 돌려받고 구독이 꺼지는데,
 * 우리 쪽 `menhera_until` 은 30일로 남아 있다 — **돈은 안 받고 혜택만 주는** 상태가 된다.
 * 확인만 하고 승인을 안 하는 것은 결제를 반만 붙인 것이다.
 *
 * 실패해도 준 것을 거두지 않는다. 사람 탓이 아니고, 구글이 3일 동안 다시 받아 준다 —
 * 그 사이에 우리가 다시 부를 수 있다. 대신 **장부에 남긴다**(안 남기면 아무도 모른다).
 */
export async function 구독승인(패키지: string, 상품: string, 토큰: string): Promise<{ ok: boolean; 글?: string }> {
  const k = 열쇠읽기();
  if (!k) return { ok: false, 글: "열쇠없음" };
  const at = await 구글토큰(k);
  if (!at) return { ok: false, 글: "서비스 계정 토큰을 못 받았다" };
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(패키지)}`
    + `/purchases/subscriptions/${encodeURIComponent(상품)}/tokens/${encodeURIComponent(토큰)}:acknowledge`;
  const r = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${at}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  /* 이미 승인된 것을 또 승인하면 400 이 온다. 그건 **성공이다**(09-27 의 23505 와 같은 집안). */
  if (r.ok) return { ok: true };
  const t = await r.text().catch(() => "");
  if (r.status === 400 && /alread/i.test(t)) return { ok: true };
  return { ok: false, 글: `HTTP ${r.status} ${t.slice(0, 120)}` };
}

/** 열쇠가 꽂혀 있나 — 화면·문이 "결제를 열어도 되나" 를 이걸로 묻는다 */
export const 확인할수있나 = () => 열쇠읽기() !== null;
