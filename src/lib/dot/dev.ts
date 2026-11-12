import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * **개발자 링크 — 하트를 안 센다** (11-13 사장님 "개발자 링크 따로 만들어 하트 제한 없는 거").
 *
 * 주소 하나를 열면 그 브라우저만 **하트 한도를 안 본다.** 시험할 때마다 출석하고
 * 광고 보고 앉아 있을 수가 없어서다. 켜는 길은 `/api/dot/dev?key=…`, 끄는 길은
 * `?off=1` — 끄는 길을 같이 두는 까닭은 [[feature-removal-leaves-dead-ends]] 와 같다.
 *
 * ## 열쇠는 어디서 오나 — **새 환경변수를 만들지 않는다**
 *
 * Railway 변수 칸은 내가 못 건드린다([[railway-vars-only-via-console]], 자동 모드가 거부).
 * 그래서 변수를 하나 더 만들면 **사장님 손가락이 또 필요해진다.** 대신 이미 서버에만
 * 있는 비밀(`SUPABASE_SECRET_KEY`)에서 **따서 쓴다** — HMAC 이라 열쇠에서 원본을
 * 되돌릴 수 없고, 배포하는 순간 바로 산다.
 *
 * `DOT_DEV_KEY` 를 넣으면 그쪽이 이긴다 — 나중에 링크를 갈아 끼우고 싶을 때의 문이다.
 * 비밀이 바뀌면 링크도 바뀐다(그래서 `dot_dev_link.mts` 가 지금 값을 다시 찍어 준다).
 *
 * ## 막아 둔 것
 *
 *  · 서버만 본다 — 화면이 "나 개발자야" 라고 말하는 길은 없다(쿠키를 **서버가** 확인한다).
 *  · 쿠키는 `HttpOnly` 라 페이지 코드가 못 읽는다.
 *  · 비교는 `timingSafeEqual` — 길이가 다르면 바로 false.
 *  · 이 길은 **하트만** 넘긴다. 결제·광고·남의 자료는 그대로다.
 */

export const DEV_COOKIE = "dot_dev";

/** 지금 이 서버의 개발자 열쇠. 비밀이 없으면 `null` — 그러면 개발자 모드가 **아예 없다**. */
export function devKey(): string | null {
  const 손으로넣은 = (process.env.DOT_DEV_KEY ?? "").trim();
  if (손으로넣은) return 손으로넣은;
  const seed = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  if (!seed) return null;
  return createHmac("sha256", seed).update("dot-dev-link-v1").digest("hex").slice(0, 24);
}

function 같나(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function devKeyOk(given: string | null | undefined): boolean {
  const k = devKey();
  if (!k || !given) return false;
  return 같나(given.trim(), k);
}

/**
 * 길 손잡이(route handler)에서 부른다.
 *
 * 쿠키와 헤더를 **둘 다** 본다: 웹은 쿠키로 오지만 안드로이드 앱은 쿠키를 안 쓴다
 * (`auth.ts` 가 Bearer 를 받는 것과 같은 까닭). 앱에서 시험할 때는 `x-dot-dev` 헤더다.
 */
export function devFromRequest(request: Request): boolean {
  if (devKeyOk(request.headers.get("x-dot-dev"))) return true;
  const raw = request.headers.get("cookie") ?? "";
  const m = new RegExp(`(?:^|;\\s*)${DEV_COOKIE}=([^;]*)`).exec(raw);
  return devKeyOk(m ? decodeURIComponent(m[1]) : null);
}

/** 서버 컴포넌트에서 부른다(쿠키만). 읽다 실패하면 **꺼진 것으로 친다**. */
export async function devFromCookies(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    const c = await cookies();
    return devKeyOk(c.get(DEV_COOKIE)?.value ?? null);
  } catch {
    return false;
  }
}
