import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 푸시 구독 — 브라우저가 준 주소를 이 사람 이름으로 적어 둔다.
 *
 * 공개키는 GET 으로 준다. 브라우저는 이 키로 구독을 만들고, 서버는 짝인 비밀키로
 * 보낸다. 키가 없으면(설정 전) 화면은 알림 단추를 아예 안 그린다.
 */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY ?? "";
  return Response.json({ publicKey: key, enabled: !!key });
}

export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try { body = (await request.json()) as typeof body; } catch { return Response.json({ error: "요청을 읽지 못했어요." }, { status: 400 }); }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth) return Response.json({ error: "구독 모양이 아니에요." }, { status: 400 });

  const db = createServiceClient();
  // 같은 주소가 다시 오면 산 것으로 되돌린다(앱을 지웠다 다시 깔면 주소가 같을 수 있다).
  const { error } = await db.from("dot_push_subs").upsert(
    { user_id: userId, endpoint, p256dh, auth, dead_at: null },
    { onConflict: "endpoint" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
  const db = createServiceClient();
  await db.from("dot_push_subs").delete().eq("user_id", userId).eq("endpoint", endpoint);
  return Response.json({ ok: true });
}
