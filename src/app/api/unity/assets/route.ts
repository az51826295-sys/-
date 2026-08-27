import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 유니티가 가져가는 자산 목록.
 *
 * 게임 엔진 쪽에서 이 회사가 승인한 자산을 그대로 내려받을 수 있게 연다. 사람이
 * 브라우저에서 파일을 하나씩 저장해 프로젝트에 끌어다 놓는 단계가 빠지고, 그
 * 단계가 빠지면 **자산이 언제 바뀌었는지**가 자동으로 따라온다 — 손으로 옮기면
 * 게임 안의 그림과 로키 안의 그림이 언제부터 달랐는지 아무도 모른다.
 *
 * ## 왜 브라우저 세션이 아니라 열쇠인가
 *
 * 유니티 에디터는 로그인 쿠키가 없다. 그래서 회사마다 발급된 열쇠를 헤더로
 * 받는다. 열쇠는 **읽기 전용**이다 — 이 경로로는 아무것도 만들거나 지울 수 없다.
 *
 * ## 무엇을 주는가
 *
 * **승인된 것만.** 검토 대기 중이거나 수정 요청을 받은 산출물은 안 나간다.
 * 게임에 들어가는 것과 매니저가 승인한 것이 같아야 하고, 그 둘이 어긋나면
 * 승인이라는 절차가 아무 의미가 없다.
 */

export const dynamic = "force-dynamic";

type Candidate = {
  index: number;
  image: string;
  verdict: string;
  measured?: Record<string, number | undefined>;
};

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
    .select("id, name")
    .eq("unity_key", key)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });
  }

  const { data: rows } = await db
    .from("deliverables")
    .select("id, title, content, created_at, status")
    .eq("company_id", company.id as string)
    .eq("type", "game_assets")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(100);

  const assets = ((rows ?? []) as {
    id: string;
    title: string;
    created_at: string;
    content: { candidates?: Candidate[] } | null;
  }[]).flatMap((d) =>
    (d.content?.candidates ?? [])
      // 떨어진 후보는 안 내보낸다. 유니티 쪽에서 다시 거르게 하면 계측기가
      // 두 벌이 되고, 두 벌은 언젠가 서로 다른 답을 낸다.
      .filter((c) => c.verdict === "PASS")
      .map((c) => ({
        deliverableId: d.id,
        name: `${d.title}_${c.index}`,
        title: d.title,
        image: c.image,
        measured: c.measured ?? {},
        createdAt: d.created_at,
      })),
  );

  return NextResponse.json({
    company: company.name,
    count: assets.length,
    assets,
    note:
      "승인된 산출물의 통과 후보만 나갑니다. 검토 중이거나 떨어진 것은 여기에 없습니다.",
  });
}
