/**
 * **두근도트 계정을 구글에 붙인다** (226회차 2026-09-28, 사장님 "구글로그인으로 바꿔 회원가입빼고").
 *
 * 지금까지는 익명 계정에 **이메일+비밀번호**를 붙였다(`/api/dot/link`). 그걸 구글로 바꾼다.
 * 같은 user id 에 신원만 하나 더 붙으므로(`linkIdentity`) **대화와 친밀도는 그대로**다.
 *
 * **켜져 있는지 먼저 묻는 문도 같이 둔다(GET).** 09-28 현재 두근도트 Supabase 에 구글
 * provider 가 **꺼져 있다**(authorize 가 HTTP 400). 그걸 모르고 화면만 구글로 바꾸면
 * **아무도 로그인 못 한다** — 게다가 이미 이메일로 붙은 사람이 13명이다.
 * 그래서 화면은 이 문에 물어보고 **켜져 있을 때만** 구글을 내민다.
 *
 * 켜는 것은 사장님 손이다(Supabase 대시보드 + 구글 클라우드 OAuth 클라이언트).
 */
import { createClient } from "@/lib/supabase/server";
import { 구글켜졌나 } from "@/lib/auth/googleEnabled";

/**
 * 구글이 켜져 있나. 화면이 이걸 보고 무엇을 내밀지 정한다.
 * 10-24: 묻는 법을 `lib/auth/googleEnabled` **한 곳**으로 옮겼다 — 로그인 화면도 같은 것을 본다.
 * 둘이 따로 물으면 한쪽만 고쳐 놓고 다른 쪽에서 생 JSON 이 뜬다(실제로 그랬다).
 */
export async function GET() {
  const { 켜짐, 까닭 } = await 구글켜졌나();
  return Response.json({ google: 켜짐, why: 까닭 });
}

/** 지금 계정에 구글을 붙인다. 이미 붙은 사람은 그대로 둔다. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인 정보가 없어요." }, { status: 401 });
  const already = (user.identities ?? []).some((i) => i.provider === "google");
  if (already) return Response.json({ error: "이미 구글에 연결돼 있어요." }, { status: 400 });

  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: `${origin}/dot/settings` },
  });
  // **오류를 그대로 전한다.** 구글이 꺼져 있으면 여기서 그 말이 나온다 — 삼키면 화면이 말없이 아무 일도 안 한다.
  if (error || !data?.url) {
    return Response.json({ error: error?.message ?? "구글 연결 주소를 못 받았어요." }, { status: 400 });
  }
  return Response.json({ url: data.url });
}
