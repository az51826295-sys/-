import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 아직 안 끝난 유니티 일이 있는가.
 *
 * 대화창에서 "이거 만들어 줘" 라고 하면 설계까지는 서버가 한다. 하지만 코드를
 * 쓰고 유니티를 켜는 것은 사장님 PC에서만 할 수 있다 — 서버가 남의 기계를 여는
 * 통로를 만드는 것은 이 제품이 하지 않는 일이라, 반대로 **PC 쪽이 물어보러
 * 온다.**
 *
 * 그래서 이 경로가 있다. 심부름꾼이 주기적으로 여기에 들러 "제 일 있습니까"
 * 하고 묻고, 있으면 그 세션을 이어서 돌린다. 서버는 문을 열지 않고, 답만 한다.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = request.headers.get("x-rookery-key");
  if (!key) {
    return NextResponse.json(
      { error: "x-rookery-key 헤더가 필요합니다." },
      { status: 401 },
    );
  }

  const db = createServiceClient();
  const { data: company } = await db
    .from("companies")
    .select("id")
    .eq("unity_key", key)
    .maybeSingle();
  if (!company) {
    return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });
  }

  // 다녀갔다는 것만 남긴다. 이 한 줄이 화면의 "12초 전 다녀감" 이 된다 —
  // 없으면 심부름꾼이 도는지 안 도는지 화면에서 알 길이 없고, 그럴 때 사람은
  // 서버를 의심하며 앉아 있게 된다. 실패해도 답은 그대로 나간다: 일을 물으러
  // 온 심부름꾼을 기록이 안 됐다는 이유로 돌려보낼 이유가 없다.
  await db
    .from("companies")
    .update({ unity_runner_seen_at: new Date().toISOString() })
    .eq("id", company.id);

  // 가장 오래된 것부터. 새로 온 일이 먼저 끼어들면 처음 시킨 일이 영영 안 된다.
  const { data } = await db
    .from("unity_sessions")
    .select("id, want, scope, round, created_at")
    .eq("company_id", company.id)
    .eq("status", "running")
    .order("created_at", { ascending: true })
    .limit(1);

  const session = (data ?? [])[0];
  if (!session) return NextResponse.json({ session: null });

  return NextResponse.json({
    session: {
      id: session.id,
      want: session.want,
      scope: session.scope,
      round: session.round,
    },
  });
}
