/**
 * 프로토타입을 **사람이 봤다**고 적는다.
 *
 * 09-01 순서: 설계 → 프로토타입 → **사람이 본다 → 승인** → 그림을 넣는다.
 * 그 "승인" 이 여태 아무 데도 안 남았다. 사장님이 켜 보고 좋다고 하셔도 그
 * 말이 기록되지 않으니, 다음 단계가 무엇을 근거로 열리는지 말할 수 없었다.
 *
 * **이것은 "합격" 이 아니다.** 여기 적히는 것은 사람이 무엇이라 했는지뿐이고,
 * 기계가 잰 것(컴파일·PlayMode·기준 표)은 따로 산다. 둘을 한 칸에 넣으면
 * "승인했으니 다 됐다" 가 되고, 그러면 못 잰 것이 사람의 도장 뒤로 숨는다.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: { sessionId?: unknown; verdict?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const verdict = body.verdict;
  if (!sessionId || (verdict !== "approved" && verdict !== "rejected")) {
    return NextResponse.json(
      { error: "어느 판을, 승인인지 반려인지 알려 주십시오." },
      { status: 400 },
    );
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

  // 회사를 이 사람의 세션으로 찾는다. 열쇠가 아니라 로그인으로 여는 문이라,
  // 남의 회사 판에 도장을 찍을 수 없다.
  const { data: company } = await db
    .from("companies")
    .select("id")
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!company) {
    return NextResponse.json({ error: "회사를 찾지 못했습니다." }, { status: 403 });
  }

  // **칸을 새로 만들지 않는다.**
  //
  // 처음에는 `human_verdict`·`human_note`·`human_at` 세 칸을 더하려 했는데,
  // 그러려면 마이그레이션을 하나 더 들고 다녀야 한다. 북극성이 "깨끗한 기계에
  // 로키를 깔아서" 인 이상, **새 기계에서 사람이 해야 할 일이 하나 느는 것**은
  // 그 자체로 값이다.
  //
  // 있는 칸으로 된다. `status` 는 이 판이 어떻게 끝났는지이고, 사람이 보고
  // 내린 판정도 그중 하나다. `ended_why` 는 "왜 그렇게 끝났는지" 라서 반려
  // 사유가 그대로 들어간다 — 뜻을 비트는 것이 아니라 원래 그 자리다.
  const { data: updated, error } = await db
    .from("unity_sessions")
    .update({
      status: verdict,
      ended_why: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("company_id", company.id)
    // 아직 도는 판에는 도장을 못 찍는다. 다 되기 전에 승인하면 그 뒤에 바뀐
    // 것은 아무도 안 본 것이 된다.
    .in("status", ["compiled", "approved", "rejected"])
    .select("id, status, ended_why, updated_at");

  if (error) {
    // 저장이 안 됐는데 된 척하지 않는다 — 화면이 도장을 찍었다고 말하는데
    // 아무것도 안 남으면, 다음에 그 도장을 근거로 여는 문이 근거 없이 열린다.
    return NextResponse.json(
      { error: "승인을 저장하지 못했습니다: " + error.message },
      { status: 500 },
    );
  }
  if (!updated?.length) {
    return NextResponse.json(
      { error: "그런 판이 없거나, 아직 도는 중이라 도장을 찍을 수 없습니다." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, session: updated[0] });
}
