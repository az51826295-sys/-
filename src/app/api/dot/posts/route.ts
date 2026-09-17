import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";

/** 좋아요 — 한 번만. 그 캐릭터와의 사이 +1. */
export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { postId?: number };
  const postId = Number(body.postId);
  if (!postId) return Response.json({ error: "postId 가 필요해요." }, { status: 400 });
  const db = createServiceClient();
  const { data, error } = await db.rpc("dot_like_post", { p_user: userId, p_post: postId });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (Number(data) < 0) return Response.json({ ok: true, already: true });
  return Response.json({ ok: true, likes: Number(data) });
}
