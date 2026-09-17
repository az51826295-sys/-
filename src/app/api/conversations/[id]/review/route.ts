import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listVersions } from "@/lib/chat/versions";

export const dynamic = "force-dynamic";

/**
 * 매니저 판정 — 승인 / 수정 요청 (98회차 09-13, 사장님 "승인").
 *
 * 09-05에 대시보드를 지울 때 판정 화면도 같이 나갔다. 그 뒤로 `deliverable_reviews`에
 * 쓰는 코드가 저장소 어디에도 없었다 — 예측(`work_predictions`)은 149건 쌓였는데 판정은
 * 0건이라 Genesis 가 배울 재료가 하나도 없었다. 이 문이 그 채점자다.
 *
 * 규칙:
 * - 대화의 주인만, 그 대화의 판(`listVersions`)에 대해서만.
 * - **한 업무에 첫 판정 하나.** `work_prediction_scores` 뷰가 첫 판정만 세므로(수정 뒤 다시
 *   승인은 "한 번에 통과"가 아니다) 두 번째 판정은 409 로 막는다. 고친 것은 새 판이다.
 * - 수정 요청은 이유 10자 이상 — DB 제약(`deliverable_reviews_feedback_required`)과 같은 문턱을
 *   앞에서 한 번 더 세워 사람에게 한국어로 말한다.
 * - 사용자 세션으로 쓴다. RLS(`deliverable_reviews_insert_own`)가 회사 주인만 허락한다 — 서비스
 *   클라이언트로 우회하지 않는다. 판정은 사람이 누른 것이어야 한다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const { data: owned } = await supabase.from("conversations").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!owned) return NextResponse.json({ error: "없는 대화예요." }, { status: 404 });

  let body: { deliverableId?: unknown; decision?: unknown; feedback?: unknown } = {};
  try { body = await request.json(); } catch { /* 아래에서 거른다 */ }
  const deliverableId = typeof body.deliverableId === "string" ? body.deliverableId : null;
  const decision = body.decision === "approved" || body.decision === "needs_changes" ? body.decision : null;
  const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
  if (!deliverableId || !decision) return NextResponse.json({ error: "deliverableId 와 decision(approved | needs_changes) 이 필요해요." }, { status: 400 });
  if (decision === "needs_changes" && feedback.length < 10) {
    return NextResponse.json({ error: "무엇을 고칠지 10자 이상 적어 주세요. 이유 없는 수정 요청은 직원이 배울 수 없어요." }, { status: 400 });
  }

  const versions = await listVersions(supabase, id);
  const target = versions.find((v) => v.deliverableId === deliverableId);
  if (!target) return NextResponse.json({ error: "이 대화의 판이 아니에요." }, { status: 404 });

  const { data: d } = await supabase.from("deliverables").select("id, company_id, assignment_id").eq("id", deliverableId).maybeSingle();
  if (!d) return NextResponse.json({ error: "지워진 결과물이에요." }, { status: 404 });

  // 한 업무에 첫 판정 하나 — 이 업무의 어느 판에든 판정이 있으면 끝난 업무다.
  const { data: siblings } = await supabase.from("deliverables").select("id").eq("assignment_id", d.assignment_id);
  const ids = ((siblings ?? []) as { id: string }[]).map((s) => s.id);
  const { data: prior } = await supabase
    .from("deliverable_reviews").select("decision, created_at").in("deliverable_id", ids)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (prior) return NextResponse.json({ error: "이 업무는 이미 판정했어요. 고친 것은 새 판으로 올라와요.", decision: prior.decision, at: prior.created_at }, { status: 409 });

  const { data: review, error } = await supabase
    .from("deliverable_reviews")
    .insert({ company_id: d.company_id, deliverable_id: deliverableId, reviewer_user_id: user.id, decision, feedback: decision === "needs_changes" ? feedback : null })
    .select("id, decision, created_at").single();
  if (error || !review) return NextResponse.json({ error: error?.message ?? "판정을 남기지 못했어요." }, { status: 500 });

  // 결과물 상태도 같이 — 판정 표가 진실이고 이건 화면용 요약이다. 실패해도 판정은 남는다.
  const now = new Date().toISOString();
  await supabase.from("deliverables")
    .update({ status: decision, reviewed_at: now, ...(decision === "approved" ? { approved_at: now } : {}), updated_at: now })
    .eq("id", deliverableId);

  return NextResponse.json({ ok: true, decision: review.decision, at: review.created_at });
}
