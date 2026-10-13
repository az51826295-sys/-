"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, makeT, type Dict, type Locale, type T } from "./core";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** 루트 레이아웃이 서버에서 고른 언어를 내려 준다. 클라이언트가 따로 고르면 처음 그림과 어긋난다. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(dict: Dict): T {
  const locale = useLocale();
  return useMemo(() => makeT(dict, locale), [dict, locale]);
}

/** 설정에서 언어를 바꾼다. 1년 쿠키 + 새로고침(서버가 그린 글자까지 바뀌게). */
export function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  location.reload();
}
