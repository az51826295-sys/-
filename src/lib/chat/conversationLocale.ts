import type { Supabase } from "@/lib/execution/shared";
import { guessLocale, type Locale } from "@/lib/i18n/core";

/**
 * 10-14 이 대화의 언어 — 요청 없이 나중에 붙는 말(계획 카드·끝난 일·스스로 고침 멈춤)이 쓴다.
 * 사람이 마지막으로 한 말에서 짐작한다(core.ts guessLocale). 표에 언어 칸을 더하지 않은 이유:
 * 언어를 바꾸면 다음 말부터 따라가야 하고, 사람이 실제로 쓴 글이 가장 정확한 표시다.
 */
export async function conversationLocale(db: Supabase, conversationId: string | null): Promise<Locale> {
  if (!conversationId) return "ko";
  try {
    const { data } = await db
      .from("conversation_messages")
      .select("content")
      .eq("conversation_id", conversationId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return guessLocale((data?.content as string | undefined) ?? "");
  } catch {
    return "ko";
  }
}
