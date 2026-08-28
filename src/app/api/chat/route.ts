import { NextResponse } from "next/server";
import { runEverydayTurn } from "@/lib/chat/everydayService";

/**
 * 대화 하나. **모드가 없다.**
 *
 * 전에는 `/api/everyday-chat` 과 `/api/company-chat` 이 갈려 있었고, 사용자가
 * 말을 걸기 전에 자기 요청을 먼저 분류해야 했다. 이제 한 경로가 받고, 무엇을
 * 할지는 **말한 내용**이 정한다.
 */
export const maxDuration = 300;

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
  const conversationId = (body as { conversationId?: unknown })?.conversationId;
  const images = (body as { images?: unknown })?.images;
  const taskId = (body as { taskId?: unknown })?.taskId;

  const result = await runEverydayTurn({
    messages: messages.slice(-20) as { role: "user" | "assistant"; content: string }[],
    visitor: typeof visitor === "string" ? visitor : undefined,
    conversationId: typeof conversationId === "string" ? conversationId : null,
    taskId: typeof taskId === "string" ? taskId : null,
    images: Array.isArray(images)
      ? (images.filter((v) => typeof v === "string") as string[])
      : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
