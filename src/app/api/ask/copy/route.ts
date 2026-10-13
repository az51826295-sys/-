/**
 * **이거처럼 — 화면 한 장을 구조로** (228회차 10-02).
 *   POST /api/ask/copy  { 그림: "<base64>" }
 *
 * `/api/ask/screen` 과 닮았지만 하는 일이 다르다. 저쪽은 **말을 걸까 말까**를 정하고(거의 안 건다),
 * 이쪽은 사장님이 **먼저 시킨** 것이라 **반드시 답한다.** 그래서 문턱도 말투도 없다.
 *
 * 그림은 여기서도 **저장하지 않는다.**
 */
import { NextResponse } from "next/server";
import { defaultProviders } from "@/lib/execution/shared";
import { 모방꼴, 모방지시문, 모방물음 } from "@/lib/ask/모방";
import { makeT } from "@/lib/i18n/core";
import { localeFromRequest } from "@/lib/i18n/server";
import { ROOKERY } from "@/lib/i18n/dict/rookery";
import { replyLanguageNote } from "@/lib/i18n/model";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const locale = localeFromRequest(req);
  const t = makeT(ROOKERY, locale);
  let 몸: { 그림?: string };
  try { 몸 = await req.json(); } catch { return NextResponse.json({ 잘못: t("요청을 읽지 못했어요.") }, { status: 400 }); }
  const 그림 = (몸.그림 ?? "").replace(/^data:image\/\w+;base64,/, "");
  if (!그림) return NextResponse.json({ 잘못: t("그림이 없어요.") }, { status: 400 });
  if (그림.length > 2_800_000) return NextResponse.json({ 잘못: t("그림이 너무 커요.") }, { status: 413 });

  try {
    const { ai } = defaultProviders(null);
    const { output } = await ai.generateStructuredOutput({
      systemInstructions: 모방지시문 + replyLanguageNote(locale), input: 모방물음, images: [그림],
      schema: 모방꼴, schemaName: "ui_copy", maxTokens: 16000, tier: "judgment",
    });
    return NextResponse.json({ 구조: output });
  } catch (e) {
    console.error("[이거처럼] 실패:", e);
    return NextResponse.json({ 잘못: t("지금은 못 봤어요") }, { status: 502 });
  }
}
