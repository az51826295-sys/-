import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { defaultProviders } from "@/lib/execution/shared";
import { nextStep, stepLine } from "@/lib/hand/eye";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 손 v2 가 걸음마다 묻는 문 (162회차): 화면 한 장 + 목표 + 지난 걸음 → 다음 한 걸음.
 * 열쇠는 손 v0/v1 과 같다(`companies.unity_key`). 화면은 저장하지 않는다 — 판단만 돌려준다(걸음 기록은 손이 남긴다).
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-rookery-key");
  if (!key) return NextResponse.json({ error: "x-rookery-key 헤더가 필요합니다." }, { status: 401 });
  const db = createServiceClient();
  const { data: company } = await db.from("companies").select("id").eq("unity_key", key).maybeSingle();
  if (!company) return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });

  let body: { goal?: string; png?: string; width?: number; height?: number; history?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON 이 아닙니다." }, { status: 400 }); }
  if (!body.goal || !body.png || !body.width || !body.height) return NextResponse.json({ error: "goal·png·width·height 가 필요합니다." }, { status: 400 });
  if (body.png.length > 6_000_000) return NextResponse.json({ error: "그림이 너무 크다(4MB 넘음) — 손이 줄여서 보내야 한다." }, { status: 413 });

  try {
    const { step, model } = await nextStep(defaultProviders().ai, { goal: body.goal, png: body.png, width: body.width, height: body.height, history: body.history ?? [] });
    return NextResponse.json({ ok: true, model, step, line: stepLine(step) });
  } catch (e) {
    return NextResponse.json({ error: `눈이 못 봤다: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
