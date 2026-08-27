import { NextResponse } from "next/server";
import { runCompanyChatTurn } from "@/lib/chat/companyService";

/**
 * 회사와의 대화.
 *
 * 기존 `/api/chat` 은 직원 한 명을 지정해야 한다. 이 경로는 지정하지 않는다 —
 * 매니저는 필요한 것을 말하고, 누가 할지는 회사가 정한다.
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

  const result = await runCompanyChatTurn({
    messages: messages.slice(-20) as { role: "user" | "assistant"; content: string }[],
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
