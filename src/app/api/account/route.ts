import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 계정 삭제 (로키, 97회차 09-13) — 구글 플레이 등록 필수. **즉시, 전부, 되돌릴 수 없게.**
 *
 * `companies.owner_id`, `conversations.owner_id` 가 `auth.users` 에 `on delete cascade` 로
 * 묶여 있어서(직원·업무·산출물·대화 전부 그 아래) 사용자를 지우면 같이 사라진다.
 * 지우기 전에 몇 개였는지 세어 돌려준다 — 두근도트 계정 삭제(`api/dot/account`)와 같은 자리.
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  let body: { confirm?: unknown } = {};
  try { body = (await request.json()) as typeof body; } catch { /* 몸통 없음 */ }
  if (body.confirm !== "삭제") return Response.json({ error: "확인 문구가 필요해요." }, { status: 400 });

  const db = createServiceClient();
  const [{ count: conversations }, { count: companies }] = await Promise.all([
    db.from("conversations").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    db.from("companies").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
  ]);
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  console.log(`[account] 계정 삭제 ${user.id.slice(0, 8)} · 대화 ${conversations ?? 0} · 회사 ${companies ?? 0}`);
  return Response.json({ ok: true, removed: { conversations: conversations ?? 0, companies: companies ?? 0 } });
}
