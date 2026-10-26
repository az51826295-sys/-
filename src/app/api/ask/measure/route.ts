import { NextResponse } from "next/server";
import { judgeCharacter, judgeMesh, JudgeUnavailable } from "@/lib/providers/judge";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * **폴더에 떨군 것을 잰다** (10-26).
 *
 * 사장님: "그 사람이 쓰던 AI 도 붙을 수 있었으면 좋겠어."
 * API 도 MCP 도 없는 도구(웹에서만 되는 그림 AI·블렌더·손그림)는 **파일로만** 나온다.
 * 그래서 폴더가 가장 넓은 콘센트다 — 무엇으로 만들었든 떨구면 여기로 와서 **같은 자**로 재진다.
 *
 * 로키 DB 를 안 쓴다. 판정 서비스(`JUDGE_URL`)만 부른다 — 그래서 DB 가 멈춰 있어도 돈다.
 * 기준은 그 서비스의 `/api/judge/thresholds` 에 **숫자로** 박혀 있고, 근거는
 * "사장님이 가리킨 레퍼런스 화면 실측" 이다. 모델 취향이 아니라 계약이다.
 */

/** 한 번에 받는 양. 큰 파일을 여러 장 받으면 서버가 멈춘 것처럼 보인다. */
const 최대바이트 = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: "character" | "mesh";
    images?: string[];
    glbBase64?: string;
    bible?: string;
  };

  const 무게 = (body.images ?? []).reduce((a, b) => a + b.length, 0) + (body.glbBase64?.length ?? 0);
  if (무게 > 최대바이트) {
    return NextResponse.json({ error: "파일이 너무 커요 (12MB 까지)" }, { status: 413 });
  }

  try {
    if (body.kind === "mesh") {
      if (!body.glbBase64) return NextResponse.json({ error: "메시가 없어요" }, { status: 400 });
      const verdict = await judgeMesh({ glbBase64: body.glbBase64 });
      return NextResponse.json({ ok: true, kind: "mesh", verdict });
    }
    const images = (body.images ?? []).filter(Boolean);
    if (!images.length) return NextResponse.json({ error: "그림이 없어요" }, { status: 400 });
    const verdict = await judgeCharacter(images, body.bible ? { bible: body.bible } : {});
    return NextResponse.json({ ok: true, kind: "character", verdict });
  } catch (e) {
    /* **닿지 못한 것과 어긋난 것을 가른다.** 판정 서비스가 죽은 것을 "어긋남" 으로 적으면
       멀쩡한 자산을 고치러 들어간다(09-30 에 그래서 세 바퀴를 헛돌았다). */
    if (e instanceof JudgeUnavailable) {
      return NextResponse.json({ error: "판정 서비스에 못 닿았어요 — 못 잰 것이지 어긋난 게 아니에요" }, { status: 503 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 200) : "못 쟀어요" }, { status: 500 });
  }
}
