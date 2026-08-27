import { NextResponse } from "next/server";
import { runEverydayTurn } from "@/lib/chat/everydayService";

/** 일상 모드 대화. 회사가 없어도 돈다. */
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
  const result = await runEverydayTurn({
    messages: messages.slice(-20) as { role: "user" | "assistant"; content: string }[],
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
