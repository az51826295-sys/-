import { NextResponse } from "next/server";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { saveOnboardingAnswer } from "@/lib/onboarding/service";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owned = await getOwnedCompanyEmployee(id);

  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);

  if (!body?.questionId) {
    return NextResponse.json({ error: "questionId is required." }, { status: 400 });
  }

  const result = await saveOnboardingAnswer(owned, {
    questionId: body.questionId,
    answer: body.answer,
    currentQuestionId: body.currentQuestionId,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
