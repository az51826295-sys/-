import { userIdFrom, clientAs } from "@/lib/dot/auth";
import { createDotCheckout, payState } from "@/lib/dot/pay";

/**
 * 결제창을 연다 (10-28).
 *
 * `GET`  지금 살 수 있나 · 못 사면 **무엇이 막는지**. 화면이 "곧 열려요" 한 마디 대신
 *        막는 것을 그대로 보여 주게 한다 — 사람이 고칠 수 있는 것(계정 연결)과
 *        우리가 고칠 것(열쇠·상품)이 섞이면 아무도 아무것도 안 한다.
 * `POST` Dodo 결제 링크를 만들어 돌려준다. **누가 샀는지는 서버가 넣는다.**
 */

export async function GET(request: Request) {
  const userId = await userIdFrom(request);
  return Response.json({ ...payState({ signedIn: Boolean(userId) }), 로그인: Boolean(userId) });
}

export async function POST(request: Request) {
  const { user } = await clientAs(request);
  if (!user) {
    /* 401 로 끝내지 않는다 — **계정을 만들 길**을 같이 준다. 10-28 에 로그인 화면을 없애서
       "로그인이 필요해요" 는 갈 곳 없는 말이 됐다. 화면은 이 칸을 보고 구글 연결을 띄운다. */
    return Response.json(
      { error: "계정이 있어야 결제한 걸 이어 쓸 수 있어요.", 계정필요: true },
      { status: 401 },
    );
  }
  const 상태 = payState({ signedIn: true });
  if (!상태.열림) return Response.json({ error: 상태.막는것.join(" · ") }, { status: 503 });

  const origin = new URL(request.url).origin;
  const r = await createDotCheckout({
    userId: user.id,
    email: user.email ?? null,
    returnUrl: `${origin}/dot/pay?done=1`,
  });
  if (!r.ok) return Response.json({ error: r.error }, { status: 502 });
  return Response.json({ url: r.url });
}
