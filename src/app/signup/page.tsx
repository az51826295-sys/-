import RookeryAuth from "../login/RookeryAuth";
import { signup } from "./actions";
import DotAuth from "../login/DotAuth";
import { googleLogin } from "../login/actions";
import { headers } from "next/headers";

// 두근도트 서비스에서는 탭 제목도 두근도트. 루트 레이아웃의 "Rookery" 가 앱 안에 뜨면 딴 회사 페이지가 된다.
export const metadata = process.env.PRODUCT === "dot" ? { title: "두근도트 — 가입" } : { title: "로키 — 가입" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (process.env.PRODUCT === "dot") {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
    return <DotAuth mode="signup" error={error} action={signup} google={process.env.GOOGLE_LOGIN === "1" ? googleLogin : undefined} origin={origin} />;
  }

  return <RookeryAuth mode="signup" action={signup} error={error} />;
}
