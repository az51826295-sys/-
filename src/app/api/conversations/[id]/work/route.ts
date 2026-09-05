import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { collectUnityChecks, collectWorkReturns } from "@/lib/chat/workReturns";

/**
 * 이 대화에서 시킨 일 중 끝난 것을 대화에 붙이고, 아직 안 끝난 것의 수를 준다.
 *
 * 화면이 열려 있는 동안 몇 초마다 부른다. 대화의 주인만 부를 수 있다 — 남의
 * 대화 id 를 넣으면 행이 안 보여서(RLS) 빈 답이 간다.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: owned } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const since = new URL(request.url).searchParams.get("since");
  const returns = await collectWorkReturns(supabase, id);
  // 유니티 창이 그 사이에 붙인 결과(사진 포함)도 같이. since 가 없으면 안 본다.
  const checks = since ? await collectUnityChecks(supabase, id, since) : [];
  return NextResponse.json({ ...returns, posted: [...returns.posted, ...checks] });
}
