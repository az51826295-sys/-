import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { signedUrlFor } from "@/lib/deliverables/files";
import { readFileSync } from "node:fs";
import path from "node:path";

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
    // content_json 전체를 100행 끌면 MB 단위 행이 딸려와 DB 가 시간 초과를 낸다(09-06 13:55,
    // 고양이 판의 파일 기록이 두 개 빠졌다). 필요한 칸만.
    .select("id, title, deliverable_type, created_at, assignment_id, verdict:content_json->verdict->>verdict, wantRig:content_json->brief->wantRig, assignments!inner(status)")
    .eq("company_id", companyId)
    .eq("assignments.status", "completed")
    .order("created_at", { ascending: false })
    .limit(100);

  type Row = {
    id: string;
    title: string;
    deliverable_type: string;
    verdict: string | null;
    wantRig: boolean | null;
    created_at: string;
  };
  const deliverables = (rows ?? []) as unknown as Row[];
  if (deliverables.length === 0) {
    return NextResponse.json({ company: company.name, count: 0, files: [], scripts: [], tests: [] });
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
    // 유니티가 찍은 사진(unity-*.png)과 코드 산출물의 그림은 자산이 아니다 — 프로젝트에
    // 폴더만 늘린다(09-06 11:17 폴더 12개가 사진 하나씩 들고 있었다).
    if (d.deliverable_type === "app_build" || /\/unity-[a-z]+\.png$/.test(f.storage_path)) continue;
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
      verdict: d.verdict ?? "UNDEFINED",
      wantRig: !!d.wantRig,
      createdAt: d.created_at,
      url,
    });
  }

  // Dev 가 낸 글 파일. C# 과 유니티가 읽는 글 자산(.inputactions·.asmdef·.json·.txt)만.
  // 09-05 Dev 가 .inputactions 를 냈는데 .cs 만 보내서 씬 빌더가 못 찾을 뻔했다.
  const TEXT_OK = [".cs", ".inputactions", ".asmdef", ".json", ".txt", ".shader", ".md"];
  // **최신 판 하나만.** 19:15 에 옛 판의 씬 빌더가 새 판 스크립트와 섞여 컴파일 오류
  // 셋이 났고, 그 상태로 시험을 걸자 유니티가 죽었다. 두 판이 같은 파일 이름을 쓰면
  // 어느 것이 이기는지는 순서 문제일 뿐이다. 옛 판이 필요하면 대화에서 다시 시킨다.
  const latestBuild = deliverables.find((d) => d.deliverable_type === "app_build");
  let scripts: { deliverableId: string; subject: string; path: string; contents: string; createdAt: string }[] = [];
  if (latestBuild) {
    // 코드 파일은 최신 판 한 행만 따로 읽는다.
    const { data: one } = await db.from("deliverables").select("content_json").eq("id", latestBuild.id).maybeSingle();
    const made = ((one?.content_json as { files?: { path: string; contents: string }[] } | null)?.files ?? []);
    scripts = made
      .filter((f) => TEXT_OK.some((ext) => f.path.endsWith(ext)))
      .map((f) => ({ deliverableId: latestBuild.id, subject: latestBuild.title, path: f.path, contents: f.contents, createdAt: latestBuild.created_at }));
  }

  // 합격 시험지. 사람이 쓰고 한 번 쓰고 안 바꾸는 자 — 창이 프로젝트의
  // Assets/RookeryTests/PlayMode/ 에 넣는다. 저장소의 unity/Tests 가 원본이다.
  const tests = ["Rookery.Tests.PlayMode.asmdef", "RookeryAcceptance.cs", "RookeryCriteria.cs"].flatMap((name) => {
    try {
      return [{ path: `Assets/RookeryTests/PlayMode/${name}`, contents: readFileSync(path.join(process.cwd(), "unity", "Tests", name), "utf8") }];
    } catch {
      return [];
    }
  });

  return NextResponse.json({
    company: company.name,
    count: files.length + scripts.length,
    files,
    scripts,
    tests,
    note:
      "대화로 돌아온 것이 전부 나갑니다 — 떨어진 것도 판정과 함께. 고르는 것은 유니티 앞의 사람입니다.",
  });
}
