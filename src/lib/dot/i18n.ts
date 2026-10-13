import type { Locale } from "@/lib/i18n/core";

/**
 * 10-13 캐릭터·게시물의 다국어 칸(supabase/schema_dot_i18n.sql).
 *
 * 이름·소개·첫인사는 DB 에만 있어서 사전(dict)으로 못 옮긴다. `i18n` 칸에서 그 언어 것을 꺼내
 * **덮어씌운다.** 칸이 없거나 비면 한국어 원래 글 그대로 — 화면이 깨지지 않는 쪽이 먼저다.
 */
export type CharacterI18n = Partial<Record<Exclude<Locale, "ko">, {
  name?: string;
  tagline?: string;
  greeting?: string;
  chips?: string[];
  /** 사진 설명, 원래 photos 와 같은 순서. */
  photos?: string[];
}>>;

export function charI18n(row: { i18n?: unknown } | null | undefined): CharacterI18n {
  const v = row?.i18n;
  return v && typeof v === "object" ? (v as CharacterI18n) : {};
}

/** 그 언어로 덮어쓴 사본. 원래 객체는 안 건드린다(캐시가 같은 객체를 돌려준다). */
export function localizeCharacter<C extends { name: string; tagline?: string; greeting?: string; chips?: string[]; photos?: { url: string; caption: string }[]; i18n?: unknown }>(c: C, locale: Locale): C {
  if (locale === "ko") return c;
  const t = charI18n(c)[locale];
  if (!t) return c;
  const nonEmpty = (s: unknown): s is string => typeof s === "string" && s.trim() !== "";
  return {
    ...c,
    name: nonEmpty(t.name) ? t.name : c.name,
    ...(c.tagline !== undefined && nonEmpty(t.tagline) ? { tagline: t.tagline } : {}),
    ...(c.greeting !== undefined && nonEmpty(t.greeting) ? { greeting: t.greeting } : {}),
    ...(c.chips && Array.isArray(t.chips) && t.chips.length ? { chips: t.chips.filter(nonEmpty) } : {}),
    ...(c.photos && Array.isArray(t.photos) ? { photos: c.photos.map((p, i) => (nonEmpty(t.photos![i]) ? { ...p, caption: t.photos![i] } : p)) } : {}),
  };
}

/** 이름만(목록·알림처럼 이름 하나가 필요한 곳). */
export function nameIn(row: { name: string; i18n?: unknown }, locale: Locale): string {
  if (locale === "ko") return row.name;
  const n = charI18n(row)[locale]?.name;
  return typeof n === "string" && n.trim() ? n : row.name;
}

/** 게시물 한 줄. */
export function captionIn(row: { caption: string; i18n?: unknown }, locale: Locale): string {
  if (locale === "ko") return row.caption;
  const v = row.i18n && typeof row.i18n === "object" ? (row.i18n as Record<string, unknown>)[locale] : undefined;
  return typeof v === "string" && v.trim() ? v : row.caption;
}
