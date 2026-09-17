import { clientAs } from "@/lib/dot/auth";

/**
 * 계정 연결 — 익명 계정에 이메일·비밀번호를 붙인다(76회차 09-11).
 *
 * "로그인 일단 없애" 뒤로 모두 익명 계정이다. 폰을 바꾸거나 쿠키가 지워지면 친밀도·기억이 사라진다 —
 * 그래서 **잃기 전에 붙일 문**이 있어야 한다. 같은 user id 그대로 이메일만 붙으니(Supabase updateUser) 사이는 그대로다.
 * 구글 연결은 키가 오면 `linkIdentity` 로 같은 자리에 붙는다.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  // 앱(Bearer)·웹(쿠키) 둘 다 — 82회차 통째 연기에서 Bearer 가 401 이었다.
  const { client: supabase, user } = await clientAs(request);
  if (!user) return Response.json({ error: "세션이 없어요. 앱을 다시 열어 주세요." }, { status: 401 });
  if (!user.is_anonymous) return Response.json({ error: "이미 연결된 계정이에요." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!EMAIL.test(email)) return Response.json({ error: "이메일 모양이 아니에요." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "비밀번호는 8자 이상이어야 해요." }, { status: 400 });

  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) {
    const m = error.message.toLowerCase();
    const ko = m.includes("already") || m.includes("exists") || m.includes("registered")
      ? "이미 쓰고 있는 이메일이에요. 그 계정으로 들어가려면 로그인 화면에서 해 주세요."
      : error.message;
    return Response.json({ error: ko }, { status: 400 });
  }
  return Response.json({ ok: true, email });
}
