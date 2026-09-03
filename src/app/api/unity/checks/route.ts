/**
 * 그 판의 합격 기준을 **눌러 볼 수 있는 표**로 바꿔 준다.
 *
 * 설계가 판마다 기준을 열몇 줄 쓰는데(`unity_sessions.criteria`), 지금까지
 * 아무도 그것을 눌러 보지 않았다. 돌고 있는 시험 넷은 내가 쓴 **일반** 기준이라
 * "어떤 게임이든 이건 돼야 한다" 만 재고, 그 게임이 이번에 약속한 것은 못 잰다.
 *
 * 여기서 모델은 **코드를 쓰지 않는다.** 시험기는 고정이고(`RookeryCriteria.cs`),
 * 모델은 그 시험기가 알아듣는 낱말로 표만 채운다. 그래서 "통과하게 쓴 시험"이
 * 나올 자리가 없다 — 통과라는 말을 쓸 수가 없기 때문이다.
 *
 * 자세한 이유는 `src/lib/unity/criteria.ts` 머리말에 있다.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";
import { planCriteriaChecks } from "@/lib/unity/criteria";
import type { Dimension } from "@/lib/unity/plan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    .select("id")
    .eq("unity_key", key)
    .maybeSingle();
  if (!company) {
    return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });
  }
  const companyId = company.id as string;

  if (await blockedBySpendLimit(db, companyId)) {
    return NextResponse.json(
      { error: "이번 기간 지출 한도에 걸려 있습니다." },
      { status: 402 },
    );
  }

  let body: { sessionId?: unknown; names?: unknown; components?: unknown;
              dimension?: unknown; inputHandler?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "어느 판의 기준인지(sessionId) 알려 주십시오." },
      { status: 400 },
    );
  }

  const { data: session } = await db
    .from("unity_sessions")
    .select("id, criteria")
    .eq("id", sessionId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "그런 판이 없습니다." }, { status: 404 });
  }

  const criteria = (session.criteria ?? []) as { when: string; then: string }[];
  if (!criteria.length) {
    // 기준이 없는 판을 "다 통과" 로 돌려주지 않는다. 잴 것이 없는 것과
    // 재서 통과한 것은 다르다.
    return NextResponse.json({
      checks: [],
      humanOnly: [],
      criteriaCount: 0,
      note: "이 판에는 합격 기준이 없습니다. 잴 것이 없습니다.",
    });
  }

  const names = Array.isArray(body.names)
    ? (body.names as unknown[]).filter((n): n is string => typeof n === "string")
    : [];
  if (!names.length) {
    // 씬 목록 없이 만든 표는 이름을 짐작한 표가 된다. 짐작한 이름은 틀려도
    // 그럴듯해 보이고, 그 표로 잰 판정은 아무 뜻이 없다.
    return NextResponse.json(
      { error: "씬에 무엇이 있는지(names) 같이 보내 주십시오. 짐작해서 표를 만들지 않습니다." },
      { status: 400 },
    );
  }
  const components = Array.isArray(body.components)
    ? (body.components as unknown[]).filter((c): c is string => typeof c === "string")
    : [];

  const dimension: Dimension = body.dimension === "3d" ? "3d" : "2d";
  const inputHandler =
    body.inputHandler === "new" || body.inputHandler === "legacy" ||
    body.inputHandler === "both" ? body.inputHandler : null;

  const providers = meterProviders(defaultProviders(), db, { companyId });

  const plan = await planCriteriaChecks({
    providers,
    criteria,
    scene: { names, components },
    dimension,
    inputHandler,
  });

  return NextResponse.json({
    checks: plan.checks,
    humanOnly: plan.humanOnly,
    criteriaCount: criteria.length,
  });
}
