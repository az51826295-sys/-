import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 로키 푸시 구독 (223회차). GET: 공개 키 · POST: 이 기기 구독 저장 · DELETE: 끄기.
 * 로그인한 사람 자신의 구독만. 표는 dot_push_subs(로키 프로젝트에 남아 있던 것 — send.ts 참고).
 */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY ?? "";
  return Response.json({ publicKey: key, enabled: !!key });
}

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(request: Request) {
  const userId = await me();
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try { body = (await request.json()) as typeof body; } catch { return Response.json({ error: "요청을 읽지 못했어요." }, { status: 400 }); }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth) return Response.json({ error: "구독 모양이 아니에요." }, { status: 400 });
  const { error } = await createServiceClient().from("dot_push_subs").upsert({ user_id: userId, endpoint, p256dh, auth, dead_at: null }, { onConflict: "endpoint" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await me();
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
  await createServiceClient().from("dot_push_subs").delete().eq("user_id", userId).eq("endpoint", endpoint);
  return Response.json({ ok: true });
}
