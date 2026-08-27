import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { judgeCharacter, JudgeUnavailable } from "@/lib/providers/judge";

/**
 * 유니티가 만든 그림을 판정한다.
 *
 * 유니티에도 생성기가 있다. 거기서 뽑은 것을 그대로 게임에 넣으면, 로키를 거쳐
 * 들어온 자산과 **다른 자로 잰 것**이 한 화면에 섞인다. 그 게임의 자산이
 * 제각각이던 이유가 정확히 그거였다 — 저마다 다른 경로로 들어왔고 아무도 같은
 * 자로 재지 않았다.
 *
 * 그래서 어디서 만들었든 판정은 한 곳에서 한다. **계측기가 두 벌이면 언젠가
 * 서로 다른 답을 내고, 그때부터는 어느 쪽이 맞는지 가릴 방법이 없다.**
 *
 * 여기서도 고르지 않는다. 통과·탈락과 **왜 떨어졌는지**만 돌려준다.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const images = (body as { images?: unknown })?.images;
  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json({ error: "그림이 없습니다." }, { status: 400 });
  }
  const bible = (body as { bible?: unknown })?.bible;

  try {
    const verdict = await judgeCharacter(images as string[], {
      bible: typeof bible === "string" ? bible : undefined,
    });
    return NextResponse.json({
      company: company.name,
      ...verdict,
      note: "기계는 걸렀을 뿐 고르지 않았습니다.",
    });
  } catch (error) {
    if (error instanceof JudgeUnavailable) {
      // 판정기에 못 닿았을 때 **통과로 처리하지 않는다.** 미측정은 실패도
      // 성공도 아니고, 그 구분이 사라지면 판정이 있으나 마나가 된다.
      return NextResponse.json(
        { verdict: "UNDEFINED", why: [error.message] },
        { status: 503 },
      );
    }
    throw error;
  }
}
