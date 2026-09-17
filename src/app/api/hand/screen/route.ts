import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { saveFrame, latestFrame } from "@/lib/hand/screen";

export const dynamic = "force-dynamic";

/**
 * 같이 보기의 문 (163회차).
 *   POST — 손이 3초마다 보내는 화면 한 장(회사 열쇠). JSON { host, jpg(base64) }.
 *   GET  — 미리보기가 그리는 그 한 장(로그인한 회사 주인만). 20초 넘게 새 장이 없으면 204.
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-rookery-key");
  if (!key) return NextResponse.json({ error: "x-rookery-key 헤더가 필요합니다." }, { status: 401 });
  const db = createServiceClient();
  const { data: company } = await db.from("companies").select("id").eq("unity_key", key).maybeSingle();
  if (!company) return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });
  let body: { host?: string; jpg?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON 이 아닙니다." }, { status: 400 }); }
  if (!body.host || !body.jpg) return NextResponse.json({ error: "host·jpg 가 필요합니다." }, { status: 400 });
  if (body.jpg.length > 2_000_000) return NextResponse.json({ error: "한 장이 너무 크다(1.5MB 넘음)." }, { status: 413 });
  const jpg = Buffer.from(body.jpg, "base64");
  // JPEG 머리(FF D8 FF)가 아니면 안 둔다 — 이 한 장은 그대로 브라우저와 모델에 간다.
  if (jpg.length < 4 || jpg[0] !== 0xff || jpg[1] !== 0xd8 || jpg[2] !== 0xff) return NextResponse.json({ error: "JPEG 가 아닙니다." }, { status: 400 });
  saveFrame(company.id as string, body.host, jpg);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: company } = await supabase.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
  if (!company) return NextResponse.json({ error: "회사가 없어요." }, { status: 404 });
  const f = latestFrame(company.id as string);
  if (!f) return new NextResponse(null, { status: 204 });
  return new NextResponse(new Uint8Array(f.jpg), { status: 200, headers: { "content-type": "image/jpeg", "cache-control": "no-store", "x-rookery-host": f.host, "x-rookery-age-ms": String(f.ageMs) } });
}
