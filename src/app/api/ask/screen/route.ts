/**
 * **로키가 화면을 본다** (228회차 10-02, 사장님 "로키가 사장님 컴퓨터 화면을 본다 — 보고 있다가 말을 건다").
 *   POST /api/ask/screen  { 그림: "<base64, data: 접두사 없이>", 앞말?: string[], 마지막말?: string }
 *
 * ## 제일 중요한 규칙: **대부분은 입을 다문다**
 * 화면을 본다고 매번 말을 걸면 그건 돕는 게 아니라 **참견**이다. 20초마다 한마디씩 하는 것은
 * 켜 두자마자 끄게 된다. 그래서 이 길은 "무슨 말을 할까" 가 아니라 **"말을 걸 만한가"** 를 먼저 묻고,
 * 아닌 쪽을 기본값으로 둔다. 애매하면 조용히 있는다.
 *
 * ## 내 화면은 안 남긴다
 * 받은 그림은 **판정에만 쓰고 저장하지 않는다.** 사장님 화면에는 비밀번호도 메일도 다 지나간다 —
 * 남겨 둘 까닭이 없다. 장부에 남는 것은 호출 한 줄(값)뿐이다.
 *
 * ## 값
 * 그림이 든 호출이라 라우터가 볼 수 있는 자리로 올린다. 한 번 볼 때마다 돈이 나가므로
 * **화면이 바뀌었을 때만** 보내는 것은 화면 쪽(`화면보기.tsx`)이 맡는다 — 여기는 오는 대로 본다.
 */
import { NextResponse } from "next/server";
import { defaultProviders } from "@/lib/execution/shared";
import { 화면판정꼴, 화면지시문, 화면물음 } from "@/lib/ask/화면보기";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let 몸: { 그림?: string; 앞말?: string[]; 마지막말?: string };
  try { 몸 = await req.json(); } catch { return NextResponse.json({ 잘못: "본문을 못 읽었다" }, { status: 400 }); }
  const 그림 = (몸.그림 ?? "").replace(/^data:image\/\w+;base64,/, "");
  if (!그림) return NextResponse.json({ 잘못: "그림이 없다" }, { status: 400 });
  // 2MB 를 넘으면 화면 쪽이 줄이는 데 실패한 것이다 — 그대로 보내면 값이 샌다.
  if (그림.length > 2_800_000) return NextResponse.json({ 잘못: "그림이 너무 크다" }, { status: 413 });

  try {
    const { ai } = defaultProviders(null);
    const { output } = await ai.generateStructuredOutput({
      systemInstructions: 화면지시문,
      input: 화면물음(몸.앞말, 몸.마지막말),
      images: [그림],
      schema: 화면판정꼴, schemaName: "screen_watch", maxTokens: 16000, tier: "judgment",
    });
    const r = output as { 말걸까: boolean; 말: string; 까닭: string };
    // 말을 걸겠다면서 할 말이 비면 안 건 것으로 친다.
    const 걸까 = r.말걸까 && r.말.trim().length > 0;
    return NextResponse.json({ 말걸까: 걸까, 말: 걸까 ? r.말.trim() : "", 까닭: r.까닭 });
  } catch (e) {
    console.error("[화면보기] 실패:", e);
    return NextResponse.json({ 잘못: "지금은 못 봤어요" }, { status: 502 });
  }
}
