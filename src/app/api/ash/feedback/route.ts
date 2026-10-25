import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * **잿빛 테스터 의견을 받는다** (10-26).
 *
 * 까닭: 프로덕션 신청이 반려돼 비공개 테스트 14일을 다시 채운다. 지난 신청에서 제일 약했던 칸이
 * "테스터 의견이 많지 않았다" 였다 — 모을 길이 아예 없었기 때문이다. 2주 동안 여기로 쌓는다.
 *
 * 로그인은 **안 받는다.** 테스터가 계정을 만들어야 한다면 아무도 안 쓴다 —
 * 지난 14일 동안 의견이 0건이었던 것도 결국 "길이 멀어서" 다.
 * 대신 누가 보냈는지는 모르므로, 막는 쪽은 **길이와 속도**로만 한다.
 */

/** 같은 곳에서 쏟아붓는 것만 막는다. 서버가 갈리면 비는데, 그래도 없는 것보단 낫다. */
const 최근 = new Map<string, number[]>();
const 창 = 60_000, 한도 = 5;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    글?: string; 층?: number; 최고층?: number; 말?: string;
  };
  const 글 = String(body.글 ?? "").trim();

  if (!글) return NextResponse.json({ error: "빈 의견" }, { status: 400 });
  /* 2000자를 넘기면 자른다 — 거절하면 길게 쓴 사람의 글이 통째로 날아간다 */
  const 다듬은 = 글.slice(0, 2000);

  const 누구 = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const 이제 = Date.now();
  const 지난것 = (최근.get(누구) ?? []).filter((t) => 이제 - t < 창);
  if (지난것.length >= 한도) return NextResponse.json({ error: "너무 자주" }, { status: 429 });
  최근.set(누구, [...지난것, 이제]);

  try {
    const db = createServiceClient();
    const { error } = await db.from("ash_feedback").insert({
      body: 다듬은,
      floor: Number.isFinite(body.층) ? Number(body.층) : null,
      best_floor: Number.isFinite(body.최고층) ? Number(body.최고층) : null,
      lang: body.말 === "en" ? "en" : "ko",
      ua: (request.headers.get("user-agent") ?? "").slice(0, 200),
    });
    /* 저장이 실패해도 **로그에는 남긴다.** 테스터가 쓴 글을 잃는 것이 제일 나쁘다. */
    if (error) {
      console.error("[ash/feedback] 못 저장함", error.message, "| 글:", 다듬은.slice(0, 300));
      return NextResponse.json({ error: "저장 실패" }, { status: 500 });
    }
  } catch (e) {
    console.error("[ash/feedback] 터짐", e instanceof Error ? e.message : e, "| 글:", 다듬은.slice(0, 300));
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
