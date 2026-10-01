/**
 * **거짓말의 온도 — 최종 지목** (228회차 10-01).
 *   POST /api/lie/verdict  { 고른사람: "A", 가진증거: ["cctv", ...] }
 *
 * 채점은 **서버에서** 한다. 범인이 누구인지는 화면으로 안 내려가므로, 화면만 보고는 못 맞힌다.
 */
import { NextResponse } from "next/server";
import { 기본사건 } from "@/lib/lie/case";
import { 지목하기 } from "@/lib/lie/verdict";

export const runtime = "nodejs";

/** 아직 고르는 화면이 없다 — 표의 첫 사건. 사건을 더하면 여기서 몸의 `사건id` 로 집으면 된다. */
const 사건 = 기본사건();

export async function POST(req: Request) {
  let 몸: { 고른사람?: string; 가진증거?: string[] };
  try { 몸 = await req.json(); } catch { return NextResponse.json({ 잘못: "본문을 못 읽었다" }, { status: 400 }); }
  if (!몸.고른사람) return NextResponse.json({ 잘못: "누구를 지목할지 골라야 한다" }, { status: 400 });
  return NextResponse.json(지목하기(사건, 몸.고른사람, (몸.가진증거 ?? []).slice(0, 40)));
}
