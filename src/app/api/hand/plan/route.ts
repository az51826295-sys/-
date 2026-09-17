import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { defaultProviders } from "@/lib/execution/shared";
import { loadSpecs, judgeMachine, judgmentLines, engineFacts } from "@/lib/hand/spec";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 손이 묻는 문: **"이 기계에 뭘 깔까"** (160회차 2026-09-17, 손 v1).
 *
 * 손이 방금 보낸 사양(가장 최근 것)에 하려는 일을 붙여 로키가 판단한다. 돌려주는 것 둘:
 *   · 사람이 읽는 말(되겠나·필요·설정·틀린다면)
 *   · 손이 바로 실행할 **주소**(`actions`: 엔진·판) — 사장님 09-17 "우린 딱히 보안 없잖아": 단추 없이 바로 깐다.
 * 판단 한 번에 돈이 든다(판단 자리). 손은 이 문을 깔 때만 부른다, 1분마다 부르지 않는다.
 */
export async function GET(request: Request) {
  const key = request.headers.get("x-rookery-key");
  if (!key) return NextResponse.json({ error: "x-rookery-key 헤더가 필요합니다." }, { status: 401 });
  const db = createServiceClient();
  const { data: company } = await db.from("companies").select("id").eq("unity_key", key).maybeSingle();
  if (!company) return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });

  const url = new URL(request.url);
  const host = url.searchParams.get("host") ?? "";
  const job = url.searchParams.get("job") ?? "로키가 만드는 Godot 2D 게임을 이 기계에서 만들고 바로 실행해 본다.";
  const specs = await loadSpecs(db, company.id as string);
  const spec = (host && specs.find((s) => s.host === host)) || specs[0];
  if (!spec) return NextResponse.json({ error: "이 회사의 기계 사양이 없다 — 손을 먼저 -Post 로 돌려라." }, { status: 404 });

  try {
    const facts = await engineFacts();
    const { judgment, model } = await judgeMachine(defaultProviders().ai, { spec, job, facts });
    return NextResponse.json({ ok: true, host: spec.host, model, lines: judgmentLines(judgment), actions: judgment.actions, facts });
  } catch (e) {
    return NextResponse.json({ error: `판단을 못 했다: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
