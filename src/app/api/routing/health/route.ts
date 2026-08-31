import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 판단이 **계획한 자리에서 돌았는가** — 화면이 물어보는 쪽.
 *
 * 이 눈이 없어서 사흘을 몰랐다. 08-28 오후에 Anthropic 잔액이 떨어졌고, 그때부터
 * 판단 등급이 전부 옆 벤더로 넘어갔다. 옆자리는 품질을 안 깎으니 화면은 멀쩡했고,
 * 넘어간 사실은 로그에만 남았다 — 그 로그는 아무도 안 본다. 결산하다 우연히 봤다.
 *
 * 이번에는 옆자리가 살아 있어서 괜찮았다. 그쪽까지 떨어지면 회사가 통째로 멈추고,
 * **그것도 멈춘 다음에야 안다.** 그래서 넘어가는 동안 보이게 한다.
 *
 * 원인은 말하지 않는다. 원장에 있는 것은 "계획 밖에서 돌았다"와 실제로 돈 모델뿐이고,
 * 왜 원래 벤더가 안 받았는지는 안 적힌다. 짐작해서 "잔액 없음"이라고 쓰면 다음번에
 * 다른 이유로 넘어갔을 때 화면이 거짓말을 한다.
 */

export const dynamic = "force-dynamic";

const WINDOW_HOURS = 24;

/** 계획 밖. `up` 은 싼 자리가 죽어 비싼 쪽이 대신한 것, `sideways` 는 옆 벤더. */
const OFF_PLAN = new Set(["up", "sideways"]);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ measurable: false }, { status: 401 });

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!company) return NextResponse.json({ measurable: true, labelled: 0 });

  const db = createServiceClient();
  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

  const { data, error } = await db
    .from("model_usage")
    .select("model, tier, routing, cost_usd")
    .eq("company_id", company.id)
    .gte("created_at", since);

  // 칸이 아직 없는 데이터베이스에서 "이상 없음"이라고 말하지 않는다. 못 재는 것과
  // 이상이 없는 것은 다르고, 둘을 같게 읽으면 못 잴수록 잘 통과한다.
  if (error) {
    return NextResponse.json({ measurable: false, why: error.message });
  }

  // 등급이 안 적힌 옛 줄은 세지 않는다. 지금 와서 짐작으로 채우면 그건 기록이
  // 아니라 추측이고, 추측으로 채운 원장은 틀려도 합계가 계속 나온다.
  const labelled = (data ?? []).filter((r) => r.routing);
  const offPlan = labelled.filter((r) => OFF_PLAN.has(String(r.routing)));

  return NextResponse.json({
    measurable: true,
    windowHours: WINDOW_HOURS,
    labelled: labelled.length,
    sideways: offPlan.filter((r) => r.routing === "sideways").length,
    up: offPlan.filter((r) => r.routing === "up").length,
    usd: offPlan.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0),
    // 실제로 일한 모델. 어디로 넘어갔는지는 이것으로만 알 수 있다.
    models: [...new Set(offPlan.map((r) => String(r.model)))],
  });
}
