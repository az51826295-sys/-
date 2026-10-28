import { createClient } from "@/lib/supabase/server";

/**
 * **로그인 없이 쓰는 사람에게 자리를 하나 준다** (10-28 사장님 "버튼이 안 눌려").
 *
 * 두근도트는 로그인 없이 쓰는 앱이라고 화면마다 적혀 있는데(*"대화는 이 기기에 저장돼요"*),
 * **익명 세션을 만드는 코드가 어디에도 없었다.** 그래서 사람이 없고, 사람이 없으니
 * 입력칸이 꺼지고, 선물·스티커·보내기가 전부 말없이 아무 일도 안 했다.
 *
 * 구글 연결도 같은 이유로 막혀 있었다 — `/api/dot/google` 은 `linkIdentity` 를 쓰는데
 * 그건 **붙일 계정이 이미 있어야** 한다. 아무 세션도 없으면 401 "로그인 정보가 없어요" 다.
 * 그래서 이 자리가 먼저다: 익명 계정이 생겨야 거기에 구글을 붙일 수 있다.
 *
 * ## 왜 서버인가
 *
 * 세션은 쿠키에 담겨야 서버가 그리는 화면이 그 사람을 안다. 브라우저에서 만들면 쿠키가
 * 안 생기는 길이 있어서, 화면은 로그인 안 된 것으로 그려진다 — 지금 그 모양이다.
 *
 * ## 이미 있으면 안 만든다
 *
 * 부를 때마다 새 계정을 만들면 **대화와 친밀도가 매번 사라진다.** 있으면 그대로 돌려준다.
 */
export async function POST() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (user) return Response.json({ ok: true, 새로만듦: false });

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    /* **오류를 그대로 전한다.** 10-28 에 이 설정이 꺼져 있어서(`anonymous_provider_disabled`)
       앱 전체가 말없이 죽어 있었다 — 삼키면 다음에도 못 찾는다. */
    return Response.json({ ok: false, error: error?.message ?? "자리를 못 만들었어요." }, { status: 503 });
  }
  return Response.json({ ok: true, 새로만듦: true });
}
