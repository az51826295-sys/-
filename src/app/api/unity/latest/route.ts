import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { currentBuildForCompany } from "@/lib/chat/versions";

export const dynamic = "force-dynamic";

/**
 * 유니티 감시자가 1분마다 묻는 가벼운 문: "최신 게임 판이 뭐냐."
 *
 * 효율 회차(09-06 22:10): Dev 판이 돌아온 뒤 유니티 검사를 **사람(나)이 손으로** 걸었다.
 * 판마다 몇 분씩 기다리다 놓치고, 놓치면 그 시간이 통째로 샌다. 사장님 PC 의 감시자
 * (`engine/tools/unity_watch.ps1`)가 이 문을 보고 새 판이면 스스로 검사를 돌린다.
 * `/api/unity/assets` 는 파일 131개를 서명하므로 1분마다 부르기엔 무겁다.
 */
export async function GET(request: Request) {
  const key = request.headers.get("x-rookery-key");
  if (!key) return NextResponse.json({ error: "x-rookery-key 헤더가 필요합니다." }, { status: 401 });
  const db = createServiceClient();
  const { data: company } = await db.from("companies").select("id").eq("unity_key", key).maybeSingle();
  if (!company) return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });

  // 대화의 현재 버전(복원 포함). 검사했는지는 그 산출물의 unityChecks 로.
  const cur = await currentBuildForCompany(db, company.id as string);
  let latest: { id: string; title: string; created_at: string; checked: string | null } | undefined;
  if (cur) {
    const { data: d } = await db.from("deliverables").select("checked:content_json->unityChecks->>at").eq("id", cur.id).maybeSingle();
    latest = { ...cur, checked: ((d as { checked?: string | null } | null)?.checked) ?? null };
  }
  return NextResponse.json(latest ? { id: latest.id, title: latest.title, at: latest.created_at, checked: latest.checked } : { id: null });
}
