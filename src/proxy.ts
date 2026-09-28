import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * 한 서버, 두 제품.
 *
 * 09-09 사장님 계획: **채팅앱(도트) 먼저 출시, 그다음 로키.** 둘은 같은 저장소·같은
 * 서버·같은 DB 에 있고, 당분간 그대로 둔다 — 사용자가 생기기 전에 서버를 쪼개는 것은
 * 돈만 들고 배우는 게 없다.
 *
 * 대신 **문은 잠근다.** 도트 도메인으로 들어온 사람에게는 도트만 보인다. 안 그러면
 * 고객이 회사 내부 화면(`/ask`, 직원·원장·유니티 고리)을 주소만 바꿔서 열 수 있고,
 * TWA 로 감싼 앱 안에서도 열린다. 앱의 범위가 `/` 라서 막을 방법이 껍데기 쪽엔 없다.
 *
 * 어느 도메인이 도트인지는 **환경변수**로 말한다(`DOT_HOSTS`, 쉼표로 여럿).
 * 코드에 도메인을 박으면 도메인을 바꿀 때 배포를 해야 한다.
 * 비어 있으면 아무것도 안 막는다 — 지금처럼 도메인이 하나일 때 그대로 돌아간다.
 */

/** 도트 도메인에서 열어 두는 곳. 나머지는 전부 `/dot` 으로 돌려보낸다. */
// 97회차 09-13 검수: "/auth" 가 빠져 있어 구글 로그인 돌아오는 자리(/auth/callback)와 이메일 링크(/auth/confirm)가 /dot 으로 튕겼다.
const DOT_OPEN = ["/dot", "/api/dot", "/login", "/signup", "/api/auth", "/auth", "/manifest.webmanifest", "/.well-known"];

/**
 * 09-11: 한 저장소, **두 서비스, 두 DB.** 로키 게임 실험이 쌓은 3D 파일 1.9GB 가 두근도트를 같이 죽여서
 * DB 를 갈랐고, 그러니 서버도 어느 DB 를 보는지에 따라 문이 달라야 한다. `PRODUCT` 환경변수가 그 문이다:
 *   PRODUCT=dot     → 이 서비스는 두근도트만. 회사 화면(/ask 등)은 /dot 으로 돌려보낸다.
 *   PRODUCT=rookery → 이 서비스는 로키만. /dot 은 이 DB 에 표가 없으니 /ask 로 돌려보낸다.
 *   (비어 있으면 옛날처럼 하나가 다 한다 — 로컬 개발.)
 */
const PRODUCT = process.env.PRODUCT ?? "";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PRODUCT === "rookery" && (path === "/dot" || path.startsWith("/dot/") || path.startsWith("/api/dot"))) {
    const url = request.nextUrl.clone(); url.pathname = "/ask"; url.search = "";
    return NextResponse.redirect(url);
  }

  const hosts = (process.env.DOT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (hosts.length || PRODUCT === "dot") {
    const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
    if (PRODUCT === "dot" || hosts.includes(host)) {
      const allowed = DOT_OPEN.some((p) => path === p || path.startsWith(p + "/"));
      if (!allowed) {
        // 없는 곳이라고 하지 않고 **도트 첫 화면으로 보낸다.** 앱 안에서 404 를 보면
        // 사람은 앱이 고장 난 줄 안다.
        const url = request.nextUrl.clone();
        url.pathname = "/dot";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  // 도트 화면은 로그인부터(API 는 스스로 401 을 낸다). 개인정보 처리방침은 스토어 심사가 로그인 없이 봐야 하니 연다.
  // 226회차 09-28: 줄줄이 `!==` 에 네 번째를 붙이려다 목록으로 바꾼다 — 다음에 또 는다.
  // `/dot/beta` 는 인스타 모집 글이 보내는 곳이다. 아직 계정이 없는 사람이 오므로 로그인을 물으면 안 된다.
  const 로그인없이열림 = new Set(["/dot/privacy", "/dot/delete-account", "/dot/child-safety", "/dot/beta"]);
  const isDotPage = (path === "/dot" || path.startsWith("/dot/")) && !로그인없이열림.has(path);
  const res = await updateSession(request, { requireLogin: isDotPage && PRODUCT !== "rookery" });

  // 100회차: 안드로이드 앱(TWA)으로 들어왔는지 표시한다. 구글 플레이 정책상 앱 안에서는 디지털 상품을 우리 결제로 못 판다 →
  // 이 표시가 있으면 충전 단추를 안 보인다(/api/billing 의 inApp). TWA 는 첫 요청에 Referer `android-app://<패키지>/` 를 싣는다.
  const referer = request.headers.get("referer") ?? "";
  if (referer.startsWith("android-app://com.rookery.ai") || request.nextUrl.searchParams.get("app") === "android") {
    res.cookies.set("rk_app", "android", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: true });
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
