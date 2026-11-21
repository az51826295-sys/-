"use client";
import { useEffect } from "react";
import { FROM_COOKIE, cleanFrom } from "@/lib/dot/from";

/**
 * **어디서 왔나** (11-22 사장님 "두근도트 사람 모으기 — 홍보 제대로").
 *
 * 홍보 링크마다 `?from=x` 같은 꼬리표를 단다. 처음 들어온 순간의 꼬리표 **하나만** 쿠키에 남긴다
 * (나중에 다른 링크로 또 와도 덮지 않는다 — 처음 데려온 곳이 공을 가진다).
 * 손님 계정이 만들어질 때(`/api/dot/guest`) 이 쿠키를 계정 정보에 같이 적는다 → 표를 새로 안 만든다.
 * 세는 자: `engine/tools/dot_from_count.mts`.
 */
export default function FromTag() {
  useEffect(() => {
    try {
      const v = cleanFrom(new URLSearchParams(window.location.search).get("from"));
      if (!v || document.cookie.split("; ").some((c) => c.startsWith(`${FROM_COOKIE}=`))) return;
      document.cookie = `${FROM_COOKIE}=${v}; max-age=${60 * 60 * 24 * 30}; path=/; samesite=lax`;
    } catch { /* 쿠키를 막은 브라우저 — 세지 못할 뿐 앱은 그대로 */ }
  }, []);
  return null;
}
