import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/http/origin";
import { openHandoff } from "@/lib/auth/handoff";

export const dynamic = "force-dynamic";

/**
 * 폰에서 QR 을 찍으면 오는 자리 (99회차). 봉투를 열고(2분·위조 확인), 안의 매직 링크를 세션으로 바꾼다.
 * 폰 카메라가 이 주소를 크롬으로 열든 로키 앱(TWA)으로 열든 같다 — TWA 는 크롬의 쿠키를 같이 쓴다.
 */
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const sealed = new URL(request.url).searchParams.get("t") ?? "";
  const opened = openHandoff(sealed);
  if (!opened.ok) {
    const why = opened.why === "expired" ? "QR 이 만료됐어요(2분). 컴퓨터에서 다시 띄워 주세요." : "QR 을 읽지 못했어요. 컴퓨터에서 다시 띄워 주세요.";
    return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent(why), origin));
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: opened.tokenHash });
  if (error) return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("이미 쓴 QR 이에요. 컴퓨터에서 다시 띄워 주세요."), origin));
  return NextResponse.redirect(new URL(opened.next, origin));
}
