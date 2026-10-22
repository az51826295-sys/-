import RookeryAuth from "./RookeryAuth";
import { login, googleLogin } from "./actions";
import { headers } from "next/headers";
import { publicOriginFromHeaders } from "@/lib/http/origin";
import DotAuth from "./DotAuth";

// 두근도트 서비스에서는 탭 제목도 두근도트. 루트 레이아웃의 "Rookery" 가 앱 안에 뜨면 딴 회사 페이지가 된다.
export const metadata = process.env.PRODUCT === "dot" ? { title: "두근도트 — 로그인" } : { title: "로키 — 로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  /**
   * **구글 로그인 돌아올 주소는 두 가지에 다 필요하다**(228회차 10-03).
   * 전에는 dot 가지 **안에서만** 만들었는데, 로키 가지에도 구글을 붙이면서 그 이름을 밖에서 썼다 →
   * 실서버에서 `ReferenceError: origin is not defined` 로 **로그인 화면이 통째로 죽었다.**
   *
   * 타입 검사가 못 잡았다: `origin` 은 브라우저 전역 이름(`window.origin`)이라 **있는 것으로 보인다.**
   * 흔한 이름을 지역 변수로 쓰면 이렇게 조용히 지나간다.
   */
  const h = await headers();
  // **x-forwarded-host 를 먼저 본다.** Railway 뒤에서 `host` 는 내부 이름이라 localhost 가 된다(97회차·10-03 두 번).
  const origin = publicOriginFromHeaders(h) ?? "";
  const 구글 = process.env.GOOGLE_LOGIN === "1" ? googleLogin : undefined;

  // 두근도트 서비스에서는 도트 화면. 로키 화면이 앱 안에 뜨면 딴 회사 페이지가 된다.
  if (process.env.PRODUCT === "dot") {
    /*
     * 10-23: 앱이 스토어에 올라간 날 서버는 아직 한도로 막혀 있었다. **새로 깐 사람이 처음 보는
     * 화면이 바로 여기**인데(피드는 로그인으로 넘긴다) 여기선 아무 말이 없었다 — 구글 단추를
     * 눌러야 그제서야 실패했다. 미리 말해 주고, **언제 열리는지**까지 적는다.
     * 한 줄짜리 가벼운 조회다(머리만 세고 줄은 안 받는다).
     */
    let 멈춤 = false;
    try {
      const { createServiceClient } = await import("@/lib/supabase/service");
      const { 막힌것인가 } = await import("@/lib/dot/outage");
      const { error: e } = await createServiceClient()
        .from("dot_characters").select("id", { count: "exact", head: true }).limit(1);
      멈춤 = !!e && 막힌것인가(e);
    } catch { /* 못 물어봤으면 조용히 넘어간다 — 안내를 띄우려다 로그인 화면을 죽이면 안 된다 */ }
    return <DotAuth mode="login" error={error} message={message} action={login} google={구글} origin={origin} 멈춤={멈춤} />;
  }

  // 99회차: 로키도 한국어·검은 화면. 폰에서 처음 여는 사람에게 QR 이어하기를 먼저 알린다.
  return <RookeryAuth mode="login" action={login} error={error} message={message} google={구글} origin={origin} />;
}
