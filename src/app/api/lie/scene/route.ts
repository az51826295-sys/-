/**
 * **거짓말의 온도 — 현장 조사** (228회차 10-01).
 *   POST /api/lie/scene  { 지점: "desk", 상태?: { 본지점, 가진증거 } }
 *
 * **답은 서버에만 있다.** 어디서 무엇이 나오는지(`보면`·`얻는증거`)는 화면 묶음에 안 들어간다 —
 * 들어가면 개발자 도구로 다 읽히고 조사가 뜻을 잃는다. 화면은 **누른 자리의 답만** 하나씩 받는다.
 */
import { NextResponse } from "next/server";
import { 기본사건 } from "@/lib/lie/case";
import { 조사하기, 보여줄지점, 들어갈수있나, 현장처음, type 현장상태 } from "@/lib/lie/scene";

export const runtime = "nodejs";

/** 아직 고르는 화면이 없다 — 표의 첫 사건. 사건을 더하면 여기서 몸의 `사건id` 로 집으면 된다. */
const 사건 = 기본사건();

export async function POST(req: Request) {
  let 몸: { 지점?: string; 상태?: 현장상태 };
  try { 몸 = await req.json(); } catch { return NextResponse.json({ 잘못: "본문을 못 읽었다" }, { status: 400 }); }
  if (!몸.지점) return NextResponse.json({ 잘못: "어디를 볼지 골라야 한다" }, { status: 400 });

  const 앞: 현장상태 = {
    본지점: (몸.상태?.본지점 ?? []).slice(0, 40),
    가진증거: (몸.상태?.가진증거 ?? 현장처음(사건).가진증거).slice(0, 40),
  };
  const r = 조사하기(사건, 앞, 몸.지점);
  if (!r.됨) return NextResponse.json({ 잘못: r.까닭 }, { status: 409 });

  return NextResponse.json({
    글: r.글,
    얻은증거: r.얻은증거,
    이미봄: r.이미봄,
    상태: r.상태,
    지점들: 보여줄지점(사건, r.상태),
    들어갈수있나: 들어갈수있나(r.상태),
  });
}
