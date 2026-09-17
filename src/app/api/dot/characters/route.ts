import { createServiceClient } from "@/lib/supabase/service";

/** 고르는 화면. 다 만들어진 캐릭터만 나간다(`is_public`). */
export async function GET() {
  const db = createServiceClient();
  const { data, error } = await db
    .from("dot_characters")
    .select("id, slug, name, tagline, greeting, sprites")
    .eq("is_public", true)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ characters: data ?? [] });
}
