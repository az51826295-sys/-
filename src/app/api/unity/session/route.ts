/**
 * 유니티 판을 **지운다.**
 *
 * 09-03 사장님: "하고 있는 작업 삭제는 왜 안돼." 못 하게 막아 둔 것이 아니라
 * 만든 적이 없었다.
 *
 * ## 무엇이 지워지고 무엇이 안 지워지는가
 *
 * 지워지는 것: 판 한 줄과 그 판의 기록(`unity_rounds` 는 딸려 지워진다).
 *
 * **안 지워지는 것: 사장님 PC 에 쓰인 파일.** 서버는 남의 기계를 못 연다 —
 * 이 제품이 안 하기로 한 일이다. 그래서 지웠다고 말할 때 **파일은 남아
 * 있다는 것도 같이 말한다.** 안 그러면 "지웠는데 왜 남아 있냐" 가 되고,
 * 그때는 무엇을 믿어야 할지 알 수 없게 된다.
 *
 * 되돌리는 길은 심부름꾼에 이미 있다:
 *
 *     python tools/unity_runner.py --undo <판 id> --project "<프로젝트>"
 *
 * 그래서 응답에 그 명령을 실어 보낸다. 화면이 그것을 그대로 보여 준다.
 *
 * ## 도는 판도 지운다
 *
 * 막지 않는다. 사장님이 지우겠다고 하시면 그건 "이 일은 그만" 이라는 뜻이고,
 * 도는 중이라고 못 지우게 하면 그만두는 길이 없어진다. 다만 **먼저 멈춘 것으로
 * 표시하고 지운다** — 심부름꾼이 다음 판을 물으러 왔을 때 없는 판을 붙들고
 * 헤매지 않게.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("id") ?? "";
  if (!sessionId) {
    return NextResponse.json({ error: "어느 판인지 알려 주십시오." }, { status: 400 });
  }

  const { data: company } = await db
    .from("companies")
    .select("id")
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!company) {
    return NextResponse.json({ error: "회사를 찾지 못했습니다." }, { status: 403 });
  }

  // `unity_sessions` 는 RLS 가 켜져 있고 정책이 없다. 소유권은 위에서 확인했고
  // 아래 `company_id` 조건이 한 번 더 쓴다 — 서비스 키가 여는 것은 RLS 이지
  // 검사 자체가 아니다.
  const admin = createServiceClient();

  const { data: found } = await admin
    .from("unity_sessions")
    .select("id, scope, status")
    .eq("id", sessionId)
    .eq("company_id", company.id)
    .maybeSingle();
  if (!found) {
    return NextResponse.json({ error: "그런 판이 없습니다." }, { status: 404 });
  }

  // 도는 판이면 먼저 멈춘 것으로 적는다. 지우기 전에 이 줄을 남기는 이유는,
  // 심부름꾼이 그 사이에 물으러 오면 "멈췄다" 를 받고 나가게 하기 위해서다.
  if (found.status === "running") {
    await admin
      .from("unity_sessions")
      .update({ status: "stopped", ended_why: "사장님이 지우셨습니다." })
      .eq("id", sessionId);
  }

  const { error } = await admin
    .from("unity_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("company_id", company.id);

  if (error) {
    // 지워졌다고 말해 놓고 안 지워지면, 화면에서 사라진 것이 서버에는 남는다.
    return NextResponse.json(
      { error: "지우지 못했습니다: " + error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    // 화면이 이 두 줄을 그대로 보여 준다. 지운 범위를 사람이 알아야 한다.
    filesRemain: true,
    undo: `python tools/unity_runner.py --undo ${sessionId} --project "<프로젝트 폴더>"`,
    scope: found.scope,
  });
}
