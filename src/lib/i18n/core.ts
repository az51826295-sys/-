/**
 * 다국어 핵심 (10-13, 사장님 "전세계화해줘 내앱" — 영어·일본어부터).
 *
 * **주소는 그대로 둔다.** Next 문서는 `/en/...` 처럼 주소에 언어를 넣으라고 하지만, 그러면 안드로이드 TWA
 * 시작 주소·로그인 돌아오는 자리·이미 퍼진 링크가 전부 바뀐다. 대신 언어는 이 순서로 고른다:
 *   1. `lang` 쿠키 — 사람이 설정에서 고른 것
 *   2. 브라우저 언어(Accept-Language) — TWA 도 폰 언어를 싣는다
 *   3. 셋 다 아니면 영어 (스페인어 폰이면 한국어보다 영어가 읽힌다)
 *
 * **사전은 한국어 원문이 열쇠다.** `t("대화방")` 처럼 원래 글자를 그대로 감싸면 된다. 이름 짓는 단계를
 * 없애야 화면 1,600줄을 옮기면서 열쇠와 글이 어긋나지 않는다. 번역이 빠지면 **한국어가 그대로 나오고**,
 * `engine/tools/i18n_check.mts` 가 빠진 것을 센다(조용히 넘어가지 않게).
 *
 * 이 파일은 서버·클라이언트 둘 다 쓴다 — 서버 전용 import 를 두지 않는다.
 */

export const LOCALES = ["ko", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

export const LOCALE_NAMES: Record<Locale, string> = { ko: "한국어", en: "English", ja: "日本語" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** 쿠키가 있으면 그것, 없으면 Accept-Language 에서 처음 맞는 것, 그것도 없으면 영어. */
export function pickLocale(acceptLanguage: string | null | undefined, cookie: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { base: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter((x) => x.base && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const w of wanted) if (isLocale(w.base)) return w.base;
  return DEFAULT_LOCALE;
}

/** 한국어 원문 → 영어·일본어. */
export type Dict = Record<string, { en: string; ja: string }>;

/** `{이름}` 자리를 채운다. 원문과 번역 모두 같은 자리 이름을 쓴다. */
function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{([^{}]+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(dict: Dict, locale: Locale, ko: string, vars?: Record<string, string | number>): string {
  if (locale === "ko") return fill(ko, vars);
  const hit = dict[ko]?.[locale];
  return fill(hit || ko, vars);
}

export type T = (ko: string, vars?: Record<string, string | number>) => string;

export function makeT(dict: Dict, locale: Locale): T {
  return (ko, vars) => translate(dict, locale, ko, vars);
}

/** 모델에게 "이 언어로 말하라" 고 할 때 쓰는 이름. */
export const LANGUAGE_FOR_MODEL: Record<Locale, string> = { ko: "한국어", en: "English", ja: "日本語" };
