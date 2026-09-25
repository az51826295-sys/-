import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listVersions } from "@/lib/chat/versions";
import { kindOf, proofOf, type ProofFile } from "@/lib/work/kinds";
import { defaultMeshProvider } from "@/lib/providers/meshy";
import { billingOpen } from "@/lib/billing/plans";
import { creditBalance } from "@/lib/billing/ledger";
import { latestFrame } from "@/lib/hand/screen";

export const dynamic = "force-dynamic";

/**
 * 오른쪽 칸 "미리보기" 가 그릴 것 (UI B, 09-06 사장님 승인).
 *
 * 버전 기록(v1 v2 …), 현재 버전의 화면(증거 사진)·검사 결과·파일, 이번 달 사용액. 종류(게임·3D·영상…)는
 * `work/kinds.ts` 가 안다 — 이 문은 게임을 모른다. 대화의 주인만 부른다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const { data: owned } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "없는 대화예요." }, { status: 404 });

  const versions = await listVersions(supabase, id);
  const ids = versions.map((v) => v.deliverableId);

  type Row = {
    id: string;
    title: string;
    deliverable_type: string;
    created_at: string;
    verdict: string | null;
    checks: { cases?: { name: string; result: string; message?: string }[]; at?: string } | null;
    judge: { firstGlance?: string; wouldStop?: string; awkward?: string; soulless?: string; oneChange?: string } | null;
    company_employees: { employees: { name: string } | null } | null;
  };
  const { data: rows } = ids.length
    ? await supabase
        .from("deliverables")
        .select(
          "id, title, deliverable_type, created_at, verdict:content_json->verdict->>verdict, checks:content_json->unityChecks, " +
            "judge:content_json->judge, " +
            "company_employees!deliverables_company_employee_id_fkey(employees(name))",
        )
        .in("id", ids)
    : { data: [] };
  const byId = new Map(((rows ?? []) as unknown as Row[]).map((r) => [r.id, r]));

  const current = versions.find((v) => v.current) ?? null;
  const cur = current ? byId.get(current.deliverableId) : null;

  const { data: files } = current
    ? await supabase
        .from("deliverable_files")
        .select("id, title, storage_path, mime_type")
        .eq("deliverable_id", current.deliverableId)
        .order("created_at", { ascending: true })
    : { data: [] };
  const { photos, rest } = proofOf(cur?.deliverable_type, (files ?? []) as ProofFile[]);
  // 185회차: 웹 게임(HTML 한 파일)은 미리보기 안에서 바로 돈다 — content_json.files 에 html 이 있으면 play 문을 준다.
  let play: string | null = null;
  if (current) {
    const { data: cj } = await supabase.from("deliverables").select("paths:content_json->files").eq("id", current.deliverableId).maybeSingle();
    const paths = ((cj?.paths as { path?: string; contents?: string }[] | null) ?? []);
    if (paths.some((f) => typeof f.path === "string" && /\.html?$/i.test(f.path) && typeof f.contents === "string")) play = `/api/deliverables/${current.deliverableId}/play/`;
  }
  // 157회차: 딱지를 뗐다 — 통과/실패가 아니라 **맞음/어긋남/못 잼**. 잰 값이지 판정이 아니다(판정은 심판자와 사장님).
  const RESULT: Record<string, string> = { Passed: "맞음", Failed: "어긋남", Inconclusive: "못 잼" };

  const { data: company } = await supabase.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
  // 100회차: 충전식 회사에게는 달러·Meshy 잔액(우리 내부 거래처 잔고) 대신 자기 크레딧을 보여 준다.
  let credits: number | null = null;
  if (company && billingOpen()) {
    const { data: bm } = await supabase.from("companies").select("billing_mode, credits_started_at").eq("id", company.id).maybeSingle();
    if (bm?.billing_mode === "prepaid") {
      const b = await creditBalance(supabase, company.id as string, (bm.credits_started_at as string | null) ?? null);
      credits = b.readable ? b.credits : null;
    }
  }
  let monthUsd = 0;
  // 220회차 09-25 사장님 "지출 볼 수 있어야 해" — 한도도 같이 보인다(한 달 3만원 ≈ $21/30일).
  let limit: { usd: number; days: number } | null = null;
  if (company) {
    const { data: lim } = await supabase.from("companies").select("spend_limit_usd, spend_window_days").eq("id", company.id).maybeSingle();
    if (lim?.spend_limit_usd != null) limit = { usd: Number(lim.spend_limit_usd), days: Number(lim.spend_window_days ?? 30) };
    const from = new Date();
    from.setUTCDate(1); from.setUTCHours(0, 0, 0, 0);
    const { data: usage } = await supabase
      .from("model_usage")
      .select("cost_usd")
      .eq("company_id", company.id)
      .gte("created_at", from.toISOString());
    monthUsd = ((usage ?? []) as { cost_usd: number | string }[]).reduce((s, u) => s + Number(u.cost_usd ?? 0), 0);
  }

  // 매니저 판정(98회차): 현재 판의 **업무**에 대한 첫 판정. 판정은 업무 단위다 — 고친 판이 같은 업무면 같은 판정 아래 있다.
  let review: { decision: string; at: string; feedback: string | null } | null = null;
  if (current) {
    const { data: sib } = await supabase.from("deliverables").select("id").eq("assignment_id", current.assignmentId);
    const sibIds = ((sib ?? []) as { id: string }[]).map((s) => s.id);
    const { data: rv } = sibIds.length
      ? await supabase.from("deliverable_reviews").select("decision, created_at, feedback").in("deliverable_id", sibIds).order("created_at", { ascending: true }).limit(1).maybeSingle()
      : { data: null };
    if (rv) review = { decision: rv.decision as string, at: rv.created_at as string, feedback: (rv.feedback as string | null) ?? null };
  }

  // Meshy 잔액. 못 읽으면 null — 화면은 "—" 로.
  let meshyCredits: number | null = null;
  const prepaid = billingOpen() && credits !== null;
  if (!prepaid) { try { meshyCredits = await defaultMeshProvider().balance(); } catch { /* 없으면 없는 대로 */ } }

  // 163회차 같이 보기: 손이 20초 안에 보낸 화면이 있으면 미리보기 맨 위에 띄운다. 그림 자체는 /api/hand/screen 이 준다.
  let screen: { host: string; at: string } | null = null;
  if (company) { const f = latestFrame(company.id as string); if (f) screen = { host: f.host, at: f.at }; }

  return NextResponse.json({
    screen,
    versions: versions.map((v) => {
      const r = byId.get(v.deliverableId);
      return { ...v, title: r?.title ?? "(지워진 결과물)", kind: kindOf(r?.deliverable_type).label, who: r?.company_employees?.employees?.name ?? null };
    }),
    current: cur && current
      ? {
          n: current.n,
          deliverableId: current.deliverableId,
          title: cur.title,
          kind: kindOf(cur.deliverable_type).label,
          ruler: kindOf(cur.deliverable_type).ruler,
          who: cur.company_employees?.employees?.name ?? null,
          at: cur.created_at,
          verdict: cur.verdict,
          checks: (cur.checks?.cases ?? []).map((c) => ({ name: c.name.replace(/_/g, " "), result: RESULT[c.result] ?? c.result, message: c.message ?? "" })),
          checkedAt: cur.checks?.at ?? null,
          // 150회차: **심판자의 말**. 문이 아니라 말하는 자리다 — 아무것도 막지 않고, 사람이 읽고 정한다.
          // 여기 없으면 심판자는 결과물 본문 안에만 있고, 사장님은 열어 보지 않는 한 못 본다(=지금까지의 상태).
          judge: cur.judge?.oneChange
            ? {
                firstGlance: cur.judge.firstGlance ?? "", wouldStop: cur.judge.wouldStop ?? "",
                awkward: cur.judge.awkward ?? "", soulless: cur.judge.soulless ?? "", oneChange: cur.judge.oneChange,
              }
            : null,
          photos: photos.map((f) => ({ title: f.title, href: `/api/files/${f.id}` })),
          files: rest.map((f) => ({ name: f.storage_path.split("/").pop() ?? f.title, href: `/api/files/${f.id}` })),
          play,
          review,
        }
      : null,
    spend: { monthUsd: Math.round(monthUsd * 100) / 100, limitUsd: limit?.usd ?? null, limitDays: limit?.days ?? null, meshyCredits, credits: prepaid ? credits : null, note: "글 모델 + 그림 + Meshy(09-07 부터). 공표 단가 기준, 청구서와 대조 전" },
  });
}
