import { NextResponse } from "next/server";
import { runChatTurn } from "@/lib/chat/service";

/**
 * 직원과의 대화 한 턴. 인증은 세션 쿠키 — 소유 확인과 지출 한도는
 * 서비스가 한다.
 */
export async function POST(request: Request) {
  let body: {
    companyEmployeeId?: string;
    messages?: { role: "user" | "assistant"; content: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const companyEmployeeId = body.companyEmployeeId ?? "";
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!companyEmployeeId || messages.length === 0) {
    return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
  }

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || !last.content.trim()) {
    return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
  }

  const result = await runChatTurn({ companyEmployeeId, messages });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
