import { NextResponse } from "next/server";
import { runEverydayTurn } from "@/lib/chat/everydayService";

/**
 * 일상 모드 대화. **로그인 없이도 돈다.**
 *
 * 익명은 `visitor` 를 들고 온다 — 브라우저가 만든 값이고 사람을 식별하지
 * 않는다. 지우면 초기화되므로 그것만으로는 방어가 아니고, 진짜 벽은 서비스
 * 안의 일일 총액이다.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "No messages." }, { status: 400 });
  }
  const visitor = (body as { visitor?: unknown })?.visitor;
  const result = await runEverydayTurn({
    messages: messages.slice(-20) as { role: "user" | "assistant"; content: string }[],
    visitor: typeof visitor === "string" ? visitor : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
