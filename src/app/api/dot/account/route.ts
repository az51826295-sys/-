import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 계정 삭제 — 스토어 필수(38회차). **즉시, 전부, 되돌릴 수 없게.**
 *
 * 대화·기억·친밀도·사용 기록·알림 주소는 auth.users 에 `on delete cascade` 로 묶여 있어서
 * 사용자를 지우면 같이 사라진다. 그래도 지우기 전에 몇 개였는지 세어 돌려준다 — 사람이 "정말 지워졌나" 물으면
 * 숫자로 답할 수 있어야 한다.
 */
export async function DELETE(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  let body: { confirm?: unknown } = {};
  try { body = (await request.json()) as typeof body; } catch { /* 몸통 없음 */ }
  if (body.confirm !== "삭제") return Response.json({ error: "확인 문구가 필요해요." }, { status: 400 });

  const db = createServiceClient();
  const [{ count: messages }, { count: bonds }, { count: subs }] = await Promise.all([
    db.from("dot_messages").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("dot_bonds").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("dot_push_subs").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  console.log(`[dot] 계정 삭제 ${userId.slice(0, 8)} · 대화 ${messages ?? 0} · 사이 ${bonds ?? 0} · 구독 ${subs ?? 0}`);
  return Response.json({ ok: true, removed: { messages: messages ?? 0, bonds: bonds ?? 0, subs: subs ?? 0 } });
}
