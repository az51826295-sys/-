import RookeryAuth from "./RookeryAuth";
import { login, googleLogin } from "./actions";
import { headers } from "next/headers";
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
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
  const 구글 = process.env.GOOGLE_LOGIN === "1" ? googleLogin : undefined;

  // 두근도트 서비스에서는 도트 화면. 로키 화면이 앱 안에 뜨면 딴 회사 페이지가 된다.
  if (process.env.PRODUCT === "dot") {
    return <DotAuth mode="login" error={error} message={message} action={login} google={구글} origin={origin} />;
  }

  // 99회차: 로키도 한국어·검은 화면. 폰에서 처음 여는 사람에게 QR 이어하기를 먼저 알린다.
  return <RookeryAuth mode="login" action={login} error={error} message={message} google={구글} origin={origin} />;
}
