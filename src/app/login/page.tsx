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
  // 두근도트 서비스에서는 도트 화면. 로키 화면이 앱 안에 뜨면 딴 회사 페이지가 된다.
  if (process.env.PRODUCT === "dot") {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
    return <DotAuth mode="login" error={error} message={message} action={login} google={process.env.GOOGLE_LOGIN === "1" ? googleLogin : undefined} origin={origin} />;
  }

  // 99회차: 로키도 한국어·검은 화면. 폰에서 처음 여는 사람에게 QR 이어하기를 먼저 알린다.
  return <RookeryAuth mode="login" action={login} error={error} message={message} />;
}
