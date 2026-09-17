/**
 * 판정 자 (98회차 09-13, 사장님 "승인") — 실서버. 모델 없음.
 *   가짜 회사·직원·업무·결과물·대화를 심고, 예측 한 건을 서비스로 넣은 뒤, 사용자 세션으로 판정한다.
 *   (1) 수정 요청인데 이유 없음 → 400   (2) 승인 → 200, deliverable_reviews 1건, deliverables.status=approved
 *   (3) 같은 업무 두 번째 판정 → 409     (4) **work_prediction_scores 에 1행(approved=1)** — Genesis 조인이 닫힌다
 *   (5) 남의 대화 판정 → 404            끝에 사용자를 지운다(cascade 로 전부).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rookery_review_test.mts [BASE]
 */
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const BASE = process.argv[2] ?? "https://rookery-web-production.up.railway.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createServiceClient();
const email = `review-${Date.now()}@rookery.local`, password = "review-pass-0913!";
const lines: [boolean, string][] = [];
let uid = "", uid2 = "";
try {
  const { data: made, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error; uid = made.user.id;
  const { data: made2 } = await svc.auth.admin.createUser({ email: `other-${Date.now()}@rookery.local`, password, email_confirm: true }); uid2 = made2!.user!.id;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s } = await c.auth.signInWithPassword({ email, password });
  const ref = new URL(url).hostname.split(".")[0];
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s!.session)).toString("base64url")}`;

  // 심기 — 회사 → 직원(있는 것 하나) → 업무 → 실행 → 예측 → 결과물 → 대화 + 결과 턴
  const co = (await svc.from("companies").insert({ owner_id: uid, name: "판정 자 회사" }).select("id").single()).data!;
  const found = (await svc.from("employees").select("id").limit(1).maybeSingle()).data as { id: string } | null;
  const empId = found?.id ?? (await svc.from("employees").insert({ name: "자", role: "tester", description: "판정 자", salary: "0", status: "available" }).select("id").single()).data!.id;
  const ce = (await svc.from("company_employees").insert({ company_id: co.id, employee_id: empId }).select("id").single()).data!;
  const as = (await svc.from("assignments").insert({ company_id: co.id, company_employee_id: ce.id, title: "판정 자 업무", description: "자", status: "submitted" }).select("id").single()).data!;
  const ex = (await svc.from("work_executions").insert({ company_id: co.id, assignment_id: as.id, company_employee_id: ce.id, status: "completed" }).select("id").single()).data!;
  const pr = await svc.from("work_predictions").insert({ company_id: co.id, assignment_id: as.id, work_execution_id: ex.id, company_employee_id: ce.id, skill_id: "analysis", p_approved: 0.7, basis: { features: ["skill=analysis"] } });
  lines.push([!pr.error, `예측 심기 ${pr.error ? "실패: " + pr.error.message : "됨"}`]);
  const dl = (await svc.from("deliverables").insert({ company_id: co.id, assignment_id: as.id, company_employee_id: ce.id, title: "판정 자 결과", deliverable_type: "analysis", content_markdown: "# 자" }).select("id").single()).data!;
  const cv = (await svc.from("conversations").insert({ owner_id: uid, title: "판정 자 대화" }).select("id").single()).data!;
  await svc.from("conversation_messages").insert({ conversation_id: cv.id, role: "assistant", content: "결과가 왔어요", attachments: { returned: { deliverableId: dl.id, assignmentId: as.id } } });
  const cv2 = (await svc.from("conversations").insert({ owner_id: uid2, title: "남의 대화" }).select("id").single()).data!;

  const post = (conv: string, body: unknown, ck = cookie) => fetch(`${BASE}/api/conversations/${conv}/review`, { method: "POST", headers: { cookie: ck, "content-type": "application/json" }, body: JSON.stringify(body) });

  const r1 = await post(cv.id, { deliverableId: dl.id, decision: "needs_changes", feedback: "짧음" });
  lines.push([r1.status === 400, `이유 없는 수정 요청 → ${r1.status} (400)`]);

  const r5 = await post(cv2.id, { deliverableId: dl.id, decision: "approved" });
  lines.push([r5.status === 404, `남의 대화로 판정 → ${r5.status} (404)`]);

  const r2 = await post(cv.id, { deliverableId: dl.id, decision: "approved" });
  const j2 = (await r2.json().catch(() => ({}))) as { decision?: string };
  const { count: reviews } = await svc.from("deliverable_reviews").select("*", { count: "exact", head: true }).eq("deliverable_id", dl.id);
  const { data: d2 } = await svc.from("deliverables").select("status, approved_at").eq("id", dl.id).maybeSingle();
  lines.push([r2.status === 200 && j2.decision === "approved" && reviews === 1 && d2?.status === "approved" && !!d2?.approved_at,
    `승인 → ${r2.status} · 판정 ${reviews}건 · 결과물 상태 ${d2?.status}`]);

  const r3 = await post(cv.id, { deliverableId: dl.id, decision: "needs_changes", feedback: "두 번째 판정은 막혀야 한다" });
  lines.push([r3.status === 409, `같은 업무 두 번째 판정 → ${r3.status} (409)`]);

  const { data: sc } = await svc.from("work_prediction_scores").select("approved, brier").eq("company_id", co.id);
  const row = (sc ?? [])[0] as { approved: number; brier: number } | undefined;
  lines.push([!!row && row.approved === 1 && Math.abs(row.brier - 0.09) < 1e-6, `Genesis 조인: work_prediction_scores ${sc?.length ?? 0}행 · approved=${row?.approved} · brier=${row?.brier} (0.7 예측·승인 → 0.09)`]);

  const panel = await fetch(`${BASE}/api/conversations/${cv.id}/panel`, { headers: { cookie } });
  const pj = (await panel.json().catch(() => ({}))) as { current?: { review?: { decision?: string } | null } };
  lines.push([panel.status === 200 && pj.current?.review?.decision === "approved", `미리보기 판이 판정을 보여 줌: ${pj.current?.review?.decision ?? "없음"}`]);
} finally {
  if (uid) await svc.auth.admin.deleteUser(uid).catch(() => {});
  if (uid2) await svc.auth.admin.deleteUser(uid2).catch(() => {});
}
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
