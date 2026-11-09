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

/**
 * **제일 오래 안 쓴 사진**을 고른다 (11-09).
 *
 * 날짜 나머지로 돌리면 사진 넷이면 나흘마다 똑같이 돌아온다. 최근 올린 것들을 보고
 * **안 나온 것부터** 쓰면 같은 주기라도 사람 눈에 덜 반복으로 읽힌다. 사진이 하나뿐이면
 * 여기서 할 수 있는 게 없다 — 그건 그림을 더 그려야 푸는 문제다.
 */
export function pickPhotoLRU<T extends { url: string }>(photos: T[], 최근쓴주소: string[]): T | null {
  if (!photos.length) return null;
  let 고름 = photos[0], 가장오래 = -1;
  for (const p of photos) {
    const i = 최근쓴주소.indexOf(p.url);          // 0 = 바로 전에 씀, -1 = 최근에 안 씀
    const 오래 = i === -1 ? Number.MAX_SAFE_INTEGER : i;
    if (오래 > 가장오래) { 가장오래 = 오래; 고름 = p; }
  }
  return 고름;
}

/**
 * **소재 바퀴** — 사진이 글감을 다 먹지 않게 한다.
 *
 * 지금 글이 비슷한 까닭은 말재주가 아니라 **글감이 하나**라서다: 사진 설명(`photo.caption`)이
 * 그대로 소재가 되니, 사진이 넷뿐인 사람은 소재도 넷이다. 연우는 열다섯 번 중 열세 번
 * "첫눈" 을 썼다(10월인데도). 그래서 **날마다 다른 각도**를 하나 집어 준다.
 *
 * 열세 개(소수)로 둔 것은 돌아오는 주기를 사진 수(1·4)와 안 맞물리게 하려는 것이다 —
 * 4와 13은 서로소라 52일이 지나야 같은 조합이 돌아온다.
 */
export const TOPICS = [
  "지금 눈앞에 있는 사소한 것 하나",
  "방금 먹은 것 · 먹고 싶은 것",
  "오늘 좀 짜증 났던 일",
  "작은 자랑",
  "팔로워에게 던지는 질문",
  "오늘 날씨·공기",
  "문득 떠오른 옛날 일",
  "내일·이번 주에 할 일",
  "요즘 빠진 것(노래·게임·드라마 같은)",
  "혼잣말 같은 푸념",
  "사진 속 장면 그대로",
  "몸 상태(졸림·배고픔·뻐근함)",
  "누군가 생각났다는 말",
] as const;
export type Topic = (typeof TOPICS)[number];

/** 캐릭터·날짜로 정해지는 소재. 순수 함수 — 자가 잰다. */
export function pickTopic(slug: string, day: string): Topic {
  let h = 2166136261;
  for (const c of `소재|${slug}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const 날 = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000) || 0;
  return TOPICS[(h + 날) % TOPICS.length];
}

/** 사진 설명이 지금 계절과 어긋나나 — 어긋나면 계절 얘기를 시키지 않는다. */
export function 계절어긋남(photoCaption: string, day: string): boolean {
  const 달 = Number(day.slice(5, 7));
  const 계절 = 달 <= 2 || 달 === 12 ? "겨울" : 달 <= 5 ? "봄" : 달 <= 8 ? "여름" : "가을";
  const 말 = [
    { 철: "겨울", re: /첫눈|눈|겨울|크리스마스|목도리|붕어빵/ },
    { 철: "봄", re: /벚꽃|봄|개나리|새학기/ },
    { 철: "여름", re: /여름|장마|바다|수영|에어컨|빙수/ },
    { 철: "가을", re: /가을|단풍|낙엽/ },
  ];
  return 말.some((m) => m.re.test(photoCaption) && m.철 !== 계절);
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

/**
 * 한 줄 쓰기 — 그 캐릭터가 자기 사진에 붙이는 말. ≤50자, AI 얘기 없음.
 *
 * 11-09: **최근에 쓴 글과 오늘의 소재를 같이 넘긴다.** 안 넘기면 모델은 사진 설명만 보고 쓰므로
 * 사진이 넷뿐인 사람은 글도 네 가지가 된다. 실측으로 린은 글 37개의 **첫머리가 100% 같았고**
 * (전부 "어,"), 연우는 15개 중 13개가 "첫눈" 이었다(10월인데). 자는 `dot/variety.ts`.
 */
export async function writeCaption(
  c: PostChar,
  photo: { url: string; caption: string },
  opts: { 최근글?: string[]; 소재?: string; day?: string; 옛방식?: boolean } = {},
): Promise<string> {
  /** `옛방식` 은 **대조군 전용**이다 — 11-08 까지 쓰던 프롬프트 그대로(소재·최근 글 없음).
   *  새 프롬프트가 정말 공이 있는지 보려면 같은 날·같은 사진으로 둘 다 돌려 봐야 한다
   *  ([[prompt-credit-needs-a-control]]). 제품 길에서는 부르지 않는다. */
  const 최근글 = opts.옛방식 ? [] : (opts.최근글 ?? []).slice(0, 6);
  const 날 = opts.day ?? todayKST();
  const 소재 = opts.소재 ?? pickTopic(c.slug, 날);
  const 첫머리들 = [...new Set(최근글.map((s) => s.trim().split(/\s+/)[0]).filter(Boolean))];
  const out = await defaultProviders().ai.generateStructuredOutput({
    systemInstructions: [
      `너는 "${c.name}" 다. 네 SNS 에 사진 한 장을 올리며 한 줄을 쓴다.`,
      "", "## 너는 누구인가", c.persona, c.speech ? `말투: ${c.speech}` : "",
      "", "## 사진", `장면: ${photo.caption}`,
      !opts.옛방식 && 계절어긋남(photo.caption, 날) ? "- 이 사진은 **지금 계절이 아니다**(예전 사진). 계절·날씨 얘기는 꺼내지 않는다." : "",
      ...(opts.옛방식 ? [] : ["", "## 오늘 쓸 것", `**${소재}**`, "- 사진을 설명하는 글이 아니다. 위 소재로 쓰고, 사진은 거들기만 한다."]),
      최근글.length ? ["", "## 최근에 네가 쓴 글 (같은 말을 또 쓰지 않는다)", ...최근글.map((s) => `- ${s}`)].join("\n") : "",
      첫머리들.length ? `- 특히 **${첫머리들.map((s) => `"${s}"`).join(" · ")} 로 시작하지 않는다.** 첫마디를 바꾼다.` : "",
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
    /* 최근 글 — 사진 고르는 데도(안 쓴 것부터), 글 쓰는 데도(같은 말 안 쓰게) 쓴다. */
    const { data: 최근 } = await db.from("dot_posts")
      .select("caption, image_url").eq("character_id", c.id)
      .order("published_on", { ascending: false }).limit(6);
    const 최근글 = ((최근 ?? []) as { caption: string }[]).map((r) => r.caption);
    const 최근사진 = ((최근 ?? []) as { image_url: string }[]).map((r) => r.image_url);
    const photo = pickPhotoLRU(Array.isArray(c.photos) ? c.photos : [], 최근사진);
    if (!photo) { log(`[게시물] ${c.name}: 사진 없음`); continue; }
    const 소재 = pickTopic(c.slug, day);
    let caption = "";
    try { caption = await writeCaption(c, photo, { 최근글, 소재, day }); } catch (e) { log(`[게시물] ${c.name} 한 줄 실패: ${e instanceof Error ? e.message : e}`); continue; }
    if (!caption) continue;
    // unique(character_id, published_on) 이 두 워커의 경주를 막는다.
    const { error } = await db.from("dot_posts").insert({ character_id: c.id, image_url: photo.url, caption, published_on: day });
    if (error) { if (!/duplicate|unique/i.test(error.message)) log(`[게시물] ${c.name} 저장 실패: ${error.message}`); continue; }
    posted++;
    log(`[게시물] ${c.name} "${caption}" (${photo.caption} · 소재 ${소재})`);
  }
  return { posted };
}
