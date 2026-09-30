import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultProviders } from "@/lib/execution/shared";
import { todayKST, timeOfDayKST, toVoiceLadder } from "./bond";

/**
 * 게시물 — 캐릭터가 하루 한 장 올린다 (78회차 09-11).
 *
 * 사장님: "카톡 벤치마킹, 캐릭터들이 게시물을 도트로 올리고 팔로우하고 채팅하는 시스템."
 * 사진은 그 캐릭터의 스냅사진 묶음(`dot_characters.photos`)에서 **날짜로 돌아가며** 고른다 — 새 그림은 돈이 드니 주 단위로 따로 더한다.
 * 한 줄은 모델이 그 캐릭터 말투로 쓴다(싼 자리). 올리는 시각은 캐릭터·날짜로 정해진 무작위(11~22시) — 같은 시각에 넷이 몰리지 않고, 시험이 잴 수 있다.
 */
const WINDOW_START = 11 * 60, WINDOW_END = 22 * 60;

/** 캐릭터·날짜로 정해지는 올리는 분(11:00~21:59). 순수 함수 — 자가 잰다. */
export function postMinute(slug: string, day: string): number {
  let h = 2166136261;
  for (const c of `${slug}|${day}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return WINDOW_START + (h % (WINDOW_END - WINDOW_START));
}

/** 오늘 올릴 사진 — 날짜로 돌아가며. 사진이 없으면 null. */
export function pickPhoto<T>(photos: T[], day: string): T | null {
  if (!photos.length) return null;
  const n = Number(day.replace(/-/g, "")) || 0;
  return photos[n % photos.length];
}

/** 지금 올릴 것인가. 순수 함수. */
export function postDecision(b: { hasPostToday: boolean; minute: number }, nowMin: number): { go: boolean; why: string } {
  if (b.hasPostToday) return { go: false, why: "오늘 올렸다" };
  if (nowMin < b.minute) return { go: false, why: "시각 전" };
  if (nowMin > WINDOW_END) return { go: false, why: "창 밖" };
  return { go: true, why: "올린다" };
}

const shape = z.object({ caption: z.string() });

export type PostChar = { id: string; slug: string; name: string; persona: string; speech: string; formal_start: boolean; voice_ladder?: string | null; photos: { url: string; caption: string }[] };

/** 한 줄 쓰기 — 그 캐릭터가 자기 사진에 붙이는 말. ≤50자, AI 얘기 없음. */
export async function writeCaption(c: PostChar, photo: { url: string; caption: string }): Promise<string> {
  const out = await defaultProviders().ai.generateStructuredOutput({
    systemInstructions: [
      `너는 "${c.name}" 다. 네 SNS 에 사진 한 장을 올리며 한 줄을 쓴다.`,
      "", "## 너는 누구인가", c.persona, c.speech ? `말투: ${c.speech}` : "",
      "", "## 사진", `장면: ${photo.caption}`,
      "", "## 어떻게 쓰나",
      "- **한 문장, 50자 이내.** 일기 한 줄처럼. 해시태그·이모지 남발 없이(이모지 최대 하나).",
      // 09-30: formal_start 만 보면 서하(반말 츤데레)가 존댓말로 게시물을 썼다. 사다리를 본다.
      toVoiceLadder(c.voice_ladder, c.formal_start) === "polite" ? "- 팔로워에게 말하듯 존댓말." : "- 편한 반말.",
      `- 지금 한국 시간 ${timeOfDayKST()}. 시간에 맞는 말이면 좋다.`,
      "- 네가 AI 라는 말은 안 한다. 성적인 내용 없음.",
      "", "## 답의 모양 (json)", "- `caption` 그 한 줄",
    ].filter(Boolean).join("\n"),
    input: "(사진을 올린다)",
    schema: shape, schemaName: "dot_post_caption", maxTokens: 200, tier: "conversation",
  });
  return out.output.caption.trim().slice(0, 80);
}

/** 워커가 몇 분마다 부른다. 공개 캐릭터마다 오늘 것이 없고 시각이 지났으면 하나 올린다. */
export async function postTick(db: SupabaseClient, log: (s: string) => void = console.log, force = false): Promise<{ posted: number }> {
  const day = todayKST();
  const k = new Date(Date.now() + 9 * 3_600_000); const nowMin = k.getUTCHours() * 60 + k.getUTCMinutes();
  const { data: chars } = await db.from("dot_characters").select("id, slug, name, persona, speech, formal_start, voice_ladder, photos").eq("is_public", true);
  const { data: todays } = await db.from("dot_posts").select("character_id").eq("published_on", day);
  const done = new Set(((todays ?? []) as { character_id: string }[]).map((t) => t.character_id));
  let posted = 0;
  for (const c of (chars ?? []) as PostChar[]) {
    const d = postDecision({ hasPostToday: done.has(c.id), minute: postMinute(c.slug, day) }, nowMin);
    if (!force && !d.go) continue;
    if (force && done.has(c.id)) continue;
    const photo = pickPhoto(Array.isArray(c.photos) ? c.photos : [], day);
    if (!photo) { log(`[게시물] ${c.name}: 사진 없음`); continue; }
    let caption = "";
    try { caption = await writeCaption(c, photo); } catch (e) { log(`[게시물] ${c.name} 한 줄 실패: ${e instanceof Error ? e.message : e}`); continue; }
    if (!caption) continue;
    // unique(character_id, published_on) 이 두 워커의 경주를 막는다.
    const { error } = await db.from("dot_posts").insert({ character_id: c.id, image_url: photo.url, caption, published_on: day });
    if (error) { if (!/duplicate|unique/i.test(error.message)) log(`[게시물] ${c.name} 저장 실패: ${error.message}`); continue; }
    posted++;
    log(`[게시물] ${c.name} "${caption}" (${photo.caption})`);
  }
  return { posted };
}
