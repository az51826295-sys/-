import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listVersions } from "@/lib/chat/versions";
import { kindOf, proofOf, type ProofFile } from "@/lib/work/kinds";

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
    company_employees: { employees: { name: string } | null } | null;
  };
  const { data: rows } = ids.length
    ? await supabase
        .from("deliverables")
        .select(
          "id, title, deliverable_type, created_at, verdict:content_json->verdict->>verdict, checks:content_json->unityChecks, " +
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
  const RESULT: Record<string, string> = { Passed: "통과", Failed: "실패", Inconclusive: "해당 없음" };

  const { data: company } = await supabase.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
  let monthUsd = 0;
  if (company) {
    const from = new Date();
    from.setUTCDate(1); from.setUTCHours(0, 0, 0, 0);
    const { data: usage } = await supabase
      .from("model_usage")
      .select("cost_usd")
      .eq("company_id", company.id)
      .gte("created_at", from.toISOString());
    monthUsd = ((usage ?? []) as { cost_usd: number | string }[]).reduce((s, u) => s + Number(u.cost_usd ?? 0), 0);
  }

  return NextResponse.json({
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
          photos: photos.map((f) => ({ title: f.title, href: `/api/files/${f.id}` })),
          files: rest.map((f) => ({ name: f.storage_path.split("/").pop() ?? f.title, href: `/api/files/${f.id}` })),
        }
      : null,
    spend: { monthUsd: Math.round(monthUsd * 100) / 100, note: "글 모델만 — 그림·Meshy 는 아직 장부 밖" },
  });
}
