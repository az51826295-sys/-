/**
 * **내가 올리는 게시물** (227회차 09-29, 사장님 "자신의 창도 있어야지").
 *
 * 지금까지 올리는 쪽은 캐릭터뿐이었다(`dot_posts`). 사람이 올리는 것은 표가 따로다
 * (`dot_user_posts`) — 같은 표에 섞으면 "누가 올렸나" 가 캐릭터 id 하나로 갈라지지 않는다.
 *
 * 올리자마자 **하트를 예약**한다([[mine.ts]]). 하트가 시간을 두고 도착해야 살아 있어 보인다.
 */
import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { 하트예약 } from "@/lib/dot/mine";

/** 통이 받는 것만 받는다. 통 설정과 같은 목록 — 한쪽만 고치면 통에서 막히고 이유를 모른다. */
const 되는형식: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const 최대 = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: "사진을 못 읽었어요." }, { status: 400 }); }

  const file = form.get("image");
  const caption = String(form.get("caption") ?? "").slice(0, 600);
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "사진을 골라 주세요." }, { status: 400 });
  const 확장 = 되는형식[file.type];
  if (!확장) return Response.json({ error: "png · jpg · webp 만 올릴 수 있어요." }, { status: 400 });
  if (file.size > 최대) return Response.json({ error: "사진이 4MB 를 넘어요." }, { status: 400 });

  const db = createServiceClient();
  const path = `${userId}/${Date.now().toString(36)}.${확장}`;
  const { error: ue } = await db.storage.from("dot-user-posts")
    .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  // **오류를 그대로 전한다.** 삼키면 화면이 말없이 아무 일도 안 한다.
  if (ue) return Response.json({ error: `사진을 못 올렸어요: ${ue.message}` }, { status: 500 });

  const image_url = db.storage.from("dot-user-posts").getPublicUrl(path).data.publicUrl;
  const { data, error } = await db.from("dot_user_posts")
    .insert({ user_id: userId, image_url, caption }).select("id").single();
  if (error || !data) {
    // 줄을 못 만들었으면 올린 사진도 지운다 — 아무도 못 보는 파일이 통에 쌓이면 용량만 먹는다.
    await db.storage.from("dot-user-posts").remove([path]);
    return Response.json({ error: `게시물을 못 만들었어요: ${error?.message ?? ""}` }, { status: 500 });
  }
  const 예약 = await 하트예약(userId, data.id as number);
  return Response.json({ ok: true, id: data.id, 예약 });
}

/** 내 게시물 지우기. 사진도 같이 지운다. */
export async function DELETE(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isFinite(id)) return Response.json({ error: "id 가 필요해요." }, { status: 400 });
  const db = createServiceClient();
  // **남의 것을 못 지우게** user_id 를 같이 건다.
  const { data, error } = await db.from("dot_user_posts").delete().eq("id", id).eq("user_id", userId).select("image_url").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "그 게시물이 없어요." }, { status: 404 });
  const url = String((data as { image_url: string }).image_url);
  const at = url.indexOf("/dot-user-posts/");
  if (at >= 0) await db.storage.from("dot-user-posts").remove([url.slice(at + "/dot-user-posts/".length)]);
  return Response.json({ ok: true });
}
