import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, makeT, pickLocale, type Dict, type Locale, type T } from "./core";

/** 서버 컴포넌트·레이아웃에서: 쿠키 → Accept-Language → 영어. */
export async function getLocale(): Promise<Locale> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLocale(h.get("accept-language"), c.get(LOCALE_COOKIE)?.value);
}

export async function getT(dict: Dict): Promise<T> {
  return makeT(dict, await getLocale());
}

/** API 라우트에서: 요청 하나로 고른다(안드로이드 앱의 Bearer 요청도 Accept-Language 를 싣는다). */
export function localeFromRequest(request: Request): Locale {
  const cookie = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return pickLocale(request.headers.get("accept-language"), cookie ? decodeURIComponent(cookie) : null);
}
