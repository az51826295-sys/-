import { createServiceClient } from "@/lib/supabase/service";
import { 막힌것인가, 멈춤응답 } from "@/lib/dot/outage";

/** 고르는 화면. 다 만들어진 캐릭터만 나간다(`is_public`). */
export async function GET() {
  const db = createServiceClient();
  const { data, error } = await db
    .from("dot_characters")
    .select("id, slug, name, tagline, greeting, sprites")
    .eq("is_public", true)
    .order("created_at", { ascending: true });
  /* 10-19: 여기가 맨 500 을 돌려주고 있었다. DB 가 한도로 막힌 것은 **우리가 아는 고장**이니
     500("우리도 모른다")이 아니라 503 과 한국어 안내로 돌려준다. */
  if (error && 막힌것인가(error)) return 멈춤응답();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ characters: data ?? [] });
}
