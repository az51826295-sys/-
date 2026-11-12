/**
 * **구글에 "이 하트 묶음 진짜 샀니?" 물어본다** (11-12).
 *
 * 11-06 에 구독을 없애면서 이 파일을 지웠다(`99a7664`). 그런데 **파는 쪽은 남아 있었다** —
 * `/dot/pay` 가 1,200/2,900/3,900원을 그려 놓고 `/api/dot/buy` 로 보내는데, 그 길이
 * **없었다**(11-12 01:4x 확인). 받는 쪽 없이 파는 쪽을 열면 단추가 404 로 떨어진다
 * ([[judge-needs-a-receiver]] 와 같은 결: 받는 쪽이 있어야 보내는 쪽이 뜻을 가진다).
 *
 * 그래서 되살리되 **구독이 아니라 소모품**으로 다시 쓴다. 구독과 다른 점이 셋이다:
 *
 *  · 주소가 다르다 — `purchases/products/{sku}/tokens/{token}` (구독은 `purchases/subscriptions/...`)
 *  · 볼 칸이 다르다 — `purchaseState`(0=샀다, 1=취소, 2=보류) · `consumptionState` · `acknowledgementState`
 *  · **승인을 우리가 한다** — Digital Goods API v2 에서 `acknowledge()` 가 없어졌다.
 *    사흘 안에 승인 안 하면 **구글이 돈을 돌려주고 조용히 거둬 간다** — 오류도 안 난다.
 *
 * 열쇠는 `PLAY_VERIFY_KEY`(서비스 계정 JSON 한 줄). 없으면 `열쇠없음` 을 돌려주고 부르는
 * 쪽이 막는다 — **스위치 하나가 지갑을 여는 구조는 안 된다**(10-24 에 그랬다).
 *
 * ## 목(mock)
 *
 * 실 API 전에 목으로 먼저 돈다는 상시 규칙([[ai-workforce-verification-order]]) 때문에
 * `PLAY_VERIFY_MOCK=1` 이면 구글에 안 묻고 **토큰 모양으로만** 판정한다:
 * `mock-ok-…` 은 통과, `mock-no-…` 는 안삼, 그 밖은 거절. 운영에는 이 변수를 두지 않는다.
 *
 * 이름은 ASCII 로 둔다 — 자(`.mts`)가 이 모듈을 불러 쓰고, tsx 는 한글 export 를 조용히 흘린다.
 */

export type ProductCheck =
  | { ok: true; orderId: string | null; acknowledged: boolean; consumed: boolean }
  | { ok: false; reason: "열쇠없음" | "못물어봄" | "거절" | "안삼"; note?: string };

type Key = { client_email: string; private_key: string };

function readKey(): Key | null {
  const raw = process.env.PLAY_VERIFY_KEY;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Key;
    return j.client_email && j.private_key ? j : null;
  } catch { return null; }
}

/** 서비스 계정으로 구글 토큰을 받는다 — 서명은 Node 기본 crypto 로 한다(라이브러리 안 쓴다). */
async function googleToken(k: Key): Promise<string | null> {
  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "RS256", typ: "JWT" });
  const body = b64({
    iss: k.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const sig = createSign("RSA-SHA256")
    .update(`${head}.${body}`)
    .sign(k.private_key.replace(/\\n/g, "\n"), "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${body}.${sig}`,
    }),
  });
  if (!r.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { access_token?: string };
  return j.access_token ?? null;
}

const base = (pkg: string, sku: string, token: string) =>
  `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}`
  + `/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}`;

/** 목일 때의 판정 — 토큰 모양만 본다. 운영에서는 이 길로 오지 않는다. */
function mockCheck(token: string): ProductCheck {
  if (token.startsWith("mock-ok-")) return { ok: true, orderId: `GPA.MOCK-${token.slice(8, 16)}`, acknowledged: false, consumed: false };
  if (token.startsWith("mock-no-")) return { ok: false, reason: "안삼" };
  return { ok: false, reason: "거절", note: "목 모드인데 mock- 토큰이 아니다" };
}

/**
 * 소모품 하나를 확인한다.
 *
 * `안삼`(그런 구매가 없다)과 `거절`(있는데 못 준다)을 **가른다** — 안 산 것은 사람에게
 * 조용히 알리고, 거절은 장부에 남겨야 한다. 둘을 합쳐 세면 가짜 토큰과 진짜 사고가
 * 같은 칸에 들어간다.
 */
export async function verifyProduct(pkg: string, sku: string, token: string): Promise<ProductCheck> {
  if (process.env.PLAY_VERIFY_MOCK === "1") return mockCheck(token);

  const k = readKey();
  if (!k) return { ok: false, reason: "열쇠없음" };
  const at = await googleToken(k);
  if (!at) return { ok: false, reason: "못물어봄", note: "서비스 계정 토큰을 못 받았다" };

  const r = await fetch(base(pkg, sku, token), { headers: { authorization: `Bearer ${at}` } });
  /* 404·410 = "그런 구매가 없다". 가짜 토큰이거나 이미 지워진 것이다. */
  if (r.status === 404 || r.status === 410) return { ok: false, reason: "안삼" };
  if (!r.ok) return { ok: false, reason: "못물어봄", note: `HTTP ${r.status}` };

  const j = (await r.json().catch(() => ({}))) as {
    purchaseState?: number; consumptionState?: number; acknowledgementState?: number; orderId?: string;
  };
  /* purchaseState: 0 샀다 · 1 취소 · 2 보류(계좌이체 등 — 아직 돈이 안 들어왔다). */
  if (j.purchaseState === 1) return { ok: false, reason: "거절", note: "취소된 구매" };
  if (j.purchaseState === 2) return { ok: false, reason: "거절", note: "결제 보류 중" };
  if (j.purchaseState !== 0) return { ok: false, reason: "거절", note: `모르는 purchaseState ${j.purchaseState}` };

  return {
    ok: true,
    orderId: j.orderId ?? null,
    acknowledged: j.acknowledgementState === 1,
    /* 1 = 이미 소모됨. 같은 토큰을 다시 내민 것이라 부르는 쪽이 막는다. */
    consumed: j.consumptionState === 1,
  };
}

/**
 * 승인한다. **이걸 빼먹으면 사흘 뒤 돈이 돌아간다** — 그때 아무 오류도 안 난다.
 * 이미 승인된 것에 또 부르면 구글이 400 을 주는데, 그건 고장이 아니라 **이미 됐다**는 뜻이다.
 */
export async function acknowledgeProduct(pkg: string, sku: string, token: string): Promise<{ ok: boolean; note?: string }> {
  if (process.env.PLAY_VERIFY_MOCK === "1") return { ok: true, note: "목" };

  const k = readKey();
  if (!k) return { ok: false, note: "열쇠없음" };
  const at = await googleToken(k);
  if (!at) return { ok: false, note: "서비스 계정 토큰을 못 받았다" };

  const r = await fetch(`${base(pkg, sku, token)}:acknowledge`, {
    method: "POST",
    headers: { authorization: `Bearer ${at}`, "content-type": "application/json" },
    body: "{}",
  });
  if (r.ok) return { ok: true };
  const 글 = (await r.text().catch(() => "")).slice(0, 200);
  if (r.status === 400 && /already/i.test(글)) return { ok: true, note: "이미 승인돼 있었다" };
  return { ok: false, note: `HTTP ${r.status} ${글}` };
}
