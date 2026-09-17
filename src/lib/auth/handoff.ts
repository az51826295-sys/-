import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * 폰으로 이어하기 (99회차 09-13, 사장님 "폰에서 깔고 컴퓨터 쉽게 연결하려면").
 *
 * 컴퓨터 화면의 QR 에는 **로그인 열쇠 자체**가 들어간다. 그래서 두 겹으로 싼다:
 * 1. Supabase 매직 링크의 token_hash 는 한 번 쓰면 끝이다(서버가 소모한다).
 * 2. 그런데 매직 링크는 한 시간쯤 산다 — 화면을 누가 찍어 가면 한 시간 동안 쓸 수 있다.
 *    그래서 token_hash 를 **암호화해서** 2분 유효기간과 함께 싼다. 봉투를 뜯어야 token_hash 가
 *    보이고, 봉투는 2분이 지나면 서버가 안 연다. 찍어 간 사람이 봉투에서 token_hash 를 꺼내
 *    `/auth/confirm` 으로 우회할 수 없다.
 * 열쇠는 서버 비밀(SUPABASE_SECRET_KEY)에서 용도 문자열로 파생한다 — 새 비밀을 늘리지 않되,
 * 다른 용도와 섞이지 않게.
 */
export const HANDOFF_TTL_MS = 120_000;

/** 이어서 열 곳. 대화 화면이나 특정 대화만 — 봉투가 아무 주소로나 보내는 문이 되면 안 된다. */
const NEXT_OK = /^\/ask(\?c=[0-9a-f-]{36})?$/;

function key(): Buffer {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY 가 없다");
  return createHash("sha256").update("rookery-handoff-v1:" + secret).digest();
}

export function safeNext(next: string | null | undefined): string {
  return next && NEXT_OK.test(next) ? next : "/ask";
}

export function sealHandoff(tokenHash: string, next: string, now: number = Date.now()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plain = Buffer.from(JSON.stringify({ th: tokenHash, next: safeNext(next), exp: now + HANDOFF_TTL_MS }), "utf8");
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}

export function openHandoff(
  sealed: string,
  now: number = Date.now(),
): { ok: true; tokenHash: string; next: string } | { ok: false; why: "broken" | "expired" } {
  try {
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length < 29) return { ok: false, why: "broken" };
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const p = JSON.parse(plain) as { th?: unknown; next?: unknown; exp?: unknown };
    if (typeof p.th !== "string" || typeof p.exp !== "number") return { ok: false, why: "broken" };
    if (now > p.exp) return { ok: false, why: "expired" };
    return { ok: true, tokenHash: p.th, next: safeNext(typeof p.next === "string" ? p.next : null) };
  } catch {
    // 봉투를 고치면 GCM 태그가 안 맞아 여기로 온다.
    return { ok: false, why: "broken" };
  }
}
