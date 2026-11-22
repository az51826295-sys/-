import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultProviders } from "@/lib/execution/shared";

/**
 * **캐릭터 글을 영어로** (11-22 사장님 "다 영어로 시작하자").
 *
 * 번역기 말투가 아니라 **그 사람이 영어로 썼을 법한 한 줄**로 옮긴다 — 반말/존댓말 차이는 영어에서
 * 문장 길이·줄임말로 낸다(enVoice 와 같은 생각). 이름·고유명사(김치찌개 같은)는 살린다.
 * 한 번에 여러 줄을 보낸다(호출이 줄당이 아니라 묶음당 — [[sample-unit-is-the-call]]).
 */
const shape = z.object({ items: z.array(z.object({ i: z.number(), en: z.string() })) });

export async function toEnglish(lines: { text: string; who?: string }[]): Promise<string[]> {
  if (!lines.length) return [];
  const out = await defaultProviders().ai.generateStructuredOutput({
    systemInstructions: [
      "You translate short Korean social-media lines and chat lines written by fictional characters into natural English.",
      "- Keep the character's tone: casual stays casual (contractions are fine), polite stays polite (full sentences).",
      "- Always use normal capitalization (\"I\", first letter of a sentence) — no all-lowercase texting style.",
      "- Keep Korean food/place words that have no good English word, romanized (e.g. kimchi stew, gimbap, ramyeon).",
      "- Turn Korean laughter like ㅋㅋ into \"lol\" or \"haha\"; ㅠ into a sad emoji or drop it.",
      "- Same length or shorter. One line in, one line out. Do not add hashtags.",
      "- Return every item with its index `i`.",
    ].join("\n"),
    input: lines.map((l, i) => `${i}. ${l.who ? `[${l.who}] ` : ""}${l.text}`).join("\n"),
    schema: shape, schemaName: "dot_to_english", maxTokens: 120 + lines.length * 60, tier: "conversation",
  });
  const map = new Map(out.output.items.map((x) => [x.i, x.en.trim()]));
  return lines.map((_, i) => map.get(i) ?? "");
}

/**
 * 피드가 영어로 보일 때 **영어 줄이 없는 글**을 그 자리에서 옮기고 적어 둔다(다음 사람은 바로 본다).
 * 워커가 새 글을 쓸 때 영어를 같이 안 적으므로(워커 배포 길이 막혀 있다 — 11-22) 여기서 메운다.
 * 실패하면 조용히 한국어로 둔다 — 번역 하나 때문에 피드가 죽으면 안 된다.
 */
export async function fillCaptionEn(db: SupabaseClient, rows: { id: number; caption: string; caption_en: string | null; who?: string }[]) {
  const 빈 = rows.filter((r) => !(r.caption_en ?? "").trim() && r.caption.trim()).slice(0, 30);
  if (!빈.length) return;
  try {
    const en = await Promise.race([
      toEnglish(빈.map((r) => ({ text: r.caption, who: r.who }))),
      new Promise<string[]>((_, no) => setTimeout(() => no(new Error("timeout")), 12000)),
    ]);
    await Promise.all(빈.map((r, k) => {
      if (!en[k]) return null;
      r.caption_en = en[k];
      return db.from("dot_posts").update({ caption_en: en[k] }).eq("id", r.id).is("caption_en", null);
    }));
  } catch { /* 한국어로 둔다 */ }
}
