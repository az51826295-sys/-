import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { signedUrlFor } from "@/lib/deliverables/files";

export const dynamic = "force-dynamic";

/**
 * 유니티 창(Window → Rookery)이 가져갈 것.
 *
 * 09-05 사장님: "엔진에 넣어야지, 유니티로." 로키가 만든 자산(Vox 의 메시)과
 * 코드(Dev 의 C#)는 이 문으로 유니티 프로젝트에 들어간다. 열쇠는 회사당 하나
 * (`companies.unity_key`, 읽기 전용) — 에디터는 브라우저 쿠키가 없어서 헤더로 받는다.
 *
 * 무엇이 나가나: **대화로 돌아온 것**(업무가 completed). 대화에 붙는 순간이 승인이다
 * (업무 화면은 없다). 판정(PASS/FAIL/UNDEFINED)을 파일마다 같이 보낸다 — 떨어진 것도
 * 나간다. 고르는 것은 유니티 앞의 사람이다; 여기서 걸러 버리면 그 사람은 떨어진
 * 이유를 영영 못 본다.
 *
 * 서명 링크는 한 시간 산다. 창은 받자마자 저장한다.
 */
export async function GET(request: Request) {
  const key = request.headers.get("x-rookery-key");
  if (!key) {
    return NextResponse.json({ error: "x-rookery-key 헤더가 필요합니다." }, { status: 401 });
  }
  const db = createServiceClient();
  const { data: company } = await db
    .from("companies")
    .select("id, name")
    .eq("unity_key", key)
    .maybeSingle();
  if (!company) {
    return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });
  }
  const companyId = company.id as string;

  // 대화로 돌아온 산출물만. assignments.status = completed 가 그 표시다.
  const { data: rows } = await db
    .from("deliverables")
    .select("id, title, deliverable_type, content_json, created_at, assignment_id, assignments!inner(status)")
    .eq("company_id", companyId)
    .eq("assignments.status", "completed")
    .order("created_at", { ascending: false })
    .limit(100);

  type Row = {
    id: string;
    title: string;
    deliverable_type: string;
    content_json: { verdict?: { verdict?: string }; brief?: { wantRig?: boolean }; files?: { path: string; contents: string; language?: string }[] } | null;
    created_at: string;
  };
  const deliverables = (rows ?? []) as unknown as Row[];
  if (deliverables.length === 0) {
    return NextResponse.json({ company: company.name, count: 0, files: [], scripts: [] });
  }

  const ids = deliverables.map((d) => d.id);
  const { data: stored } = await db
    .from("deliverable_files")
    .select("id, deliverable_id, title, storage_path, mime_type, size_bytes")
    .in("deliverable_id", ids)
    .order("created_at", { ascending: true });

  const byId = new Map(deliverables.map((d) => [d.id, d]));
  const files = [];
  for (const f of (stored ?? []) as { id: string; deliverable_id: string; title: string; storage_path: string; mime_type: string; size_bytes: number }[]) {
    const d = byId.get(f.deliverable_id);
    if (!d) continue;
    const url = await signedUrlFor(db, f.storage_path);
    if (!url) continue;
    files.push({
      id: f.id,
      deliverableId: d.id,
      subject: d.title,
      kind: d.deliverable_type,
      filename: f.storage_path.split("/").pop() ?? f.title,
      mime: f.mime_type,
      size: f.size_bytes,
      verdict: d.content_json?.verdict?.verdict ?? "UNDEFINED",
      wantRig: !!d.content_json?.brief?.wantRig,
      createdAt: d.created_at,
      url,
    });
  }

  // Dev 가 낸 글 파일 중 C# 만. 유니티 프로젝트에 그대로 들어간다.
  const scripts = deliverables
    .filter((d) => d.deliverable_type === "app_build")
    .flatMap((d) =>
      (d.content_json?.files ?? [])
        .filter((f) => f.path.endsWith(".cs"))
        .map((f) => ({ deliverableId: d.id, subject: d.title, path: f.path, contents: f.contents, createdAt: d.created_at })),
    );

  return NextResponse.json({
    company: company.name,
    count: files.length + scripts.length,
    files,
    scripts,
    note:
      "대화로 돌아온 것이 전부 나갑니다 — 떨어진 것도 판정과 함께. 고르는 것은 유니티 앞의 사람입니다.",
  });
}
