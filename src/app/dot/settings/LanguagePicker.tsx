"use client";

import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n/core";
import { setLocaleCookie, useLocale } from "@/lib/i18n/client";

/** 10-13 다국어: 폰 언어와 다르게 쓰고 싶은 사람을 위해. 고르면 쿠키에 남기고 새로 그린다. */
export default function LanguagePicker({ label }: { label: string }) {
  const locale = useLocale();
  return (
    <label className="st-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span>{label}</span>
      <select
        value={locale}
        onChange={(e) => setLocaleCookie(e.target.value as Locale)}
        style={{ font: "inherit", padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,.15)", background: "#fff" }}
      >
        {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
      </select>
    </label>
  );
}
