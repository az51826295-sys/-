import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { saveSpec, type MachineSpec } from "@/lib/hand/spec";

export const dynamic = "force-dynamic";

/**
 * 손이 잰 사양을 받는 문 (159회차 2026-09-17).
 *
 * 열쇠는 옛 유니티 감시자와 같은 것(`companies.unity_key`, `x-rookery-key`) — 회사마다 하나, 사장님 PC 에만 있다.
 * 받은 것은 저장만 한다. 판단은 대화에서 일이 들어올 때 한다(`judgeMachine`) — 여기서 모델을 부르지 않는다.
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-rookery-key");
  if (!key) return NextResponse.json({ error: "x-rookery-key 헤더가 필요합니다." }, { status: 401 });
  const db = createServiceClient();
  const { data: company } = await db.from("companies").select("id").eq("unity_key", key).maybeSingle();
  if (!company) return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });

  let spec: MachineSpec;
  try { spec = (await request.json()) as MachineSpec; } catch { return NextResponse.json({ error: "JSON 이 아닙니다." }, { status: 400 }); }
  if (!spec || typeof spec.host !== "string" || !spec.os || !spec.cpu) return NextResponse.json({ error: "사양 모양이 아닙니다(host·os·cpu 필요)." }, { status: 400 });
  // 손이 보낸 시각 대신 서버 시각을 믿는다 — 노트북 시계는 틀릴 수 있다.
  spec.at = new Date().toISOString();

  try {
    const path = await saveSpec(db, company.id as string, spec);
    await db.from("companies").update({ unity_runner_seen_at: spec.at }).eq("id", company.id);
    return NextResponse.json({ ok: true, path, host: spec.host });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
