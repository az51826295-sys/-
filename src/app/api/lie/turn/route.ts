/**
 * **거짓말의 온도 — 한 턴 받는 길** (228회차 10-01).
 *   POST /api/lie/turn  { 용의자: "A", 말: "...", 상태?, 기록? }
 *
 * ## 상태를 어디에 두나
 * v0 은 **화면이 들고 있다가 그대로 보낸다**(서버는 기억하지 않는다). 그래서 DB 표가 없어도 돌고,
 * 사장님이 바로 해 볼 수 있다. 대신 화면을 고치면 수치를 속일 수 있다 — 혼자 해 보는 판이라 지금은 괜찮다.
 * 남에게 내놓을 때는 상태를 서버(또는 DB)로 옮겨야 한다. **그때 옮긴다고 여기 적어 둔다.**
 *
 * ## 진실이 새지 않게
 * 답으로 내보내는 것은 **말·태도·수치·까닭**뿐이다. 사건의 진실이나 용의자가 숨긴 것은
 * 절대 응답에 싣지 않는다 — 화면에 안 그려도 브라우저 개발자 도구로 다 보인다.
 */
import { NextResponse } from "next/server";
import { 사건1, 용의자찾기 } from "@/lib/lie/case";
import { 심문하기, 처음상태 } from "@/lib/lie/turn";
import type { 심문상태 } from "@/lib/lie/stress";
import { defaultProviders } from "@/lib/execution/shared";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let 몸: { 용의자?: string; 말?: string; 상태?: 심문상태; 기록?: { 누구: "형사" | "용의자"; 말: string }[] };
  try { 몸 = await req.json(); } catch { return NextResponse.json({ 잘못: "본문을 못 읽었다" }, { status: 400 }); }

  const 말 = (몸.말 ?? "").trim();
  if (!말) return NextResponse.json({ 잘못: "할 말이 비었다" }, { status: 400 });
  if (말.length > 400) return NextResponse.json({ 잘못: "너무 길다(400자까지)" }, { status: 400 });

  const 용의자 = 용의자찾기(사건1, 몸.용의자 ?? "A");
  if (!용의자) return NextResponse.json({ 잘못: "그런 용의자가 없다" }, { status: 404 });

  try {
    const { ai } = defaultProviders(null);
    const r = await 심문하기({
      ai, 사건: 사건1, 용의자,
      상태: 몸.상태 ?? 처음상태(),
      말,
      기록: (몸.기록 ?? []).slice(-16),
    });
    return NextResponse.json({
      말: r.말,
      태도: r.태도,
      상태: r.상태,
      자백: r.자백,
      // **까닭은 보여 준다.** 수치가 왜 움직였는지 모르면 플레이어가 배울 수가 없다.
      까닭: r.셈.까닭,
      깨짐: r.셈.이번에깨짐.map((w) => w.깨지는진술),
      헛다리: r.셈.헛다리,
      방금무너짐: r.셈.방금무너짐,
    });
  } catch (e) {
    console.error("[거짓말] 턴 실패:", e);
    return NextResponse.json({ 잘못: "지금은 답을 못 받았어요. 잠시 뒤 다시." }, { status: 502 });
  }
}
