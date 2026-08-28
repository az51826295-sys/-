import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assign, createTask, listTasks } from "@/lib/chat/tasks";

/** 내 과제 목록. 로그인 안 했으면 빈 목록 — 오류가 아니다. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ tasks: [] });
  return NextResponse.json({ tasks: await listTasks(supabase, user.id) });
}

/** 과제를 만들거나, 대화를 과제에 넣는다. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const b = body as {
    title?: unknown;
    goal?: unknown;
    conversationId?: unknown;
    taskId?: unknown;
  };

  // 대화를 과제에 넣는 요청.
  if (typeof b.conversationId === "string") {
    const ok = await assign(
      supabase,
      user.id,
      b.conversationId,
      typeof b.taskId === "string" ? b.taskId : null,
    );
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  }

  // 새 과제.
  if (typeof b.title !== "string" || !b.title.trim()) {
    return NextResponse.json({ error: "제목이 필요합니다." }, { status: 400 });
  }
  const task = await createTask(
    supabase,
    user.id,
    b.title.trim(),
    typeof b.goal === "string" && b.goal.trim() ? b.goal.trim() : null,
  );
  if (!task) {
    return NextResponse.json({ error: "만들지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ task });
}
