"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncLangCookie } from "@/lib/dot/lang";

/**
 * **이 기기의 언어를 서버에 알린다** (10-28).
 *
 * 화면 대부분을 서버가 그리는데, 서버는 `localStorage` 를 못 본다. 그래서 언어를 쿠키에도
 * 적어 두는데, **처음 온 사람은 아직 아무것도 고르지 않았다** — 쿠키가 없다. 그 사람의
 * 브라우저가 영어라면 영어를 보여 줘야 하는데 서버는 한국어로 그린 뒤다.
 *
 * 그래서 붙자마자 쿠키를 맞추고, **바뀌었을 때만** 한 번 다시 그린다.
 * `syncLangCookie` 가 바뀜 여부를 돌려주므로 매번 다시 그리지 않는다 — 늘 다시 그리면
 * 화면이 영원히 깜빡인다.
 */
export default function LangSync() {
  const router = useRouter();
  useEffect(() => {
    if (syncLangCookie()) router.refresh();
  }, [router]);
  return null;
}
