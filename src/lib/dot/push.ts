import webpush from "web-push";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultProviders } from "@/lib/execution/shared";
import { stageVoiceFor, toVoiceLadder, timeOfDayKST, toEmotion, todayKST } from "./bond";

/**
 * 먼저 말 걸기 — **캐릭터가 하루 한 번, 사람마다 다른 시각에, 짧게.**
 *
 * 09-09 사장님: "일정 시간마다 랜덤 알람 보내기." 이런 앱이 사람을 붙잡는 힘은
 * 대화 품질이 아니라 이것에서 나온다. 카톡이 울리면 연다.
 *
 * ## 규칙 (모델이 정하지 않는다)
 * - 한국 시간 **11시~22시** 창 안에서만. 새벽에 울리면 지운다.
 * - 하루 **한 번**. 두 번 울리면 스팸이다.
 * - 시각은 사람마다 **그날 아침에 뽑는다**(`ping_minute`). 같은 시각에 몰아 보내면 서버가
 *   몰리고, 사람은 "정해진 시간에 오는 봇" 을 안다. 랜덤이 값어치다.
 * - **오늘 이미 말한 사람에겐 안 건다.** 대화 중인 사람을 또 부르는 건 귀찮음이다.
 * - 구독(푸시 주소)이 있는 사람만. 없으면 보낼 데가 없다.
 *
 * ## 말은 모델이 만든다 — 그러나 한 줄
 * 그 사람에 대해 기억하는 것(`memo`)과 단계 말투로 **한 문장**을 만든다. 싼 자리(DeepSeek).
 * 만든 말은 대화방에도 남긴다 — 알림을 누르고 들어왔을 때 그 말이 방에 있어야 자연스럽다.
 */

const WINDOW_START = 11 * 60;
const WINDOW_END = 22 * 60;

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function setup() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:hello@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

/** 한국 시간 지금이 하루의 몇 분째인가. */
export function minuteKST(now: Date = new Date()): number {
  const k = new Date(now.getTime() + 9 * 3_600_000);
  return k.getUTCHours() * 60 + k.getUTCMinutes();
}

/** 창 안의 무작위 분. 같은 날 같은 사람은 한 번만 뽑는다. */
/** 오늘 건드릴 기억 하나 — 날짜로 돌아가며 고른다. 매일 같은 기억을 건드리면 "그 얘기 또" 가 된다(73회차). */
export function memoForToday(memo: string[], now: Date = new Date()): string | null {
  if (!Array.isArray(memo) || memo.length === 0) return null;
  const dayIndex = Math.floor((now.getTime() + 9 * 3_600_000) / 86_400_000);
  return memo[dayIndex % memo.length] ?? null;
}

export function drawPingMinute(): number {
  return WINDOW_START + Math.floor(Math.random() * (WINDOW_END - WINDOW_START));
}

const opener = z.object({ text: z.string(), emotion: z.string() });

export type PingRow = {
  last_pinged_on: string | null; last_talked_on: string | null; ping_minute: number | null;
  pings_today: number; last_pinged_at: string | null;
};

/**
 * 지금 걸 것인가 — **순수 함수**(시험이 잰다, 75회차).
 * 하루 1번, 오늘 말한 사람에겐 안 걺, 뽑은 시각 이후, 창 안.
 *
 * 11-11: 멘헤라 모드를 빼면서 **하루 여러 번 거는 갈래도 같이 뺐다**(bond.ts 참고).
 */
export function pingDecision(b: PingRow, day: string, nowMin: number, now: Date): { go: boolean; why: string } {
  if (b.ping_minute === null) return { go: false, why: "시각 없음" };
  if (nowMin > WINDOW_END || nowMin < WINDOW_START) return { go: false, why: "창 밖" };
  const pingsToday = b.last_pinged_on === day ? b.pings_today : 0;
  if (pingsToday >= 1) return { go: false, why: "오늘 걸었다" };
  if (b.last_talked_on === day) return { go: false, why: "오늘 말했다" };
  if (nowMin < b.ping_minute) return { go: false, why: "시각 전" };
  return { go: true, why: "첫 번" };
}

/**
 * 한 턴 — 오늘 말 걸 사람을 고르고, 시각이 지났으면 보낸다.
 * 워커가 몇 분마다 부른다. 여러 번 불려도 하루 한 번만 보내는 것은 표(`last_pinged_on`)가 지킨다.
 */
/**
 * `force` 는 시험용 — 시각·창·오늘 말했나를 무시하고 **지금** 건다(사람은 그대로 고른다).
 * 사장님이 폰에서 "알림 켜기" 를 누른 직후 바로 오는지 볼 때 쓴다. 워커는 절대 force 로 부르지 않는다.
 */
export async function pingTick(db: SupabaseClient, log: (s: string) => void = console.log, force = false): Promise<{ drawn: number; sent: number; dead: number }> {
  if (!pushConfigured()) return { drawn: 0, sent: 0, dead: 0 };
  setup();
  const day = todayKST();
  const nowMin = minuteKST();

  // 1) 오늘 시각을 아직 안 뽑은 사이에 시각을 준다. 구독이 있는 사람만.
  const { data: subs } = await db.from("dot_push_subs").select("user_id").is("dead_at", null);
  const users = Array.from(new Set(((subs ?? []) as { user_id: string }[]).map((s) => s.user_id)));
  if (users.length === 0) return { drawn: 0, sent: 0, dead: 0 };

  const { data: bonds } = await db
    .from("dot_bonds")
    .select("user_id, character_id, points, stage, memo, last_talked_on, last_pinged_on, ping_day, ping_minute, pings_today, last_pinged_at")
    .in("user_id", users);
  type B = { user_id: string; character_id: string; points: number; stage: number; memo: string[]; last_talked_on: string | null; last_pinged_on: string | null; ping_day: string | null; ping_minute: number | null; pings_today: number; last_pinged_at: string | null };
  const rows = (bonds ?? []) as B[];

  // 사람마다 **가장 친한 캐릭터 하나**만 말을 건다. 셋이 동시에 울리면 스팸이다.
  const best = new Map<string, B>();
  for (const b of rows) {
    const cur = best.get(b.user_id);
    if (!cur || b.points > cur.points) best.set(b.user_id, b);
  }

  let drawn = 0, sent = 0, dead = 0;
  for (const b of best.values()) {
    if (b.ping_day !== day) {
      const m = drawPingMinute();
      await db.from("dot_bonds").update({ ping_day: day, ping_minute: m, pings_today: 0 }).eq("user_id", b.user_id).eq("character_id", b.character_id);
      b.ping_day = day; b.ping_minute = m; b.pings_today = 0;
      drawn++;
    }
    const pingsToday = b.last_pinged_on === day ? b.pings_today : 0;
    if (!force) {
      const d = pingDecision({ last_pinged_on: b.last_pinged_on, last_talked_on: b.last_talked_on, ping_minute: b.ping_minute, pings_today: b.pings_today, last_pinged_at: b.last_pinged_at }, day, nowMin, new Date());
      if (!d.go) continue;
    }

    // 2) 먼저 표에 "걸었다" 를 적는다 — 보내는 중에 다른 워커가 또 보내지 않게.
    //    `neq` 가 그 경계다: 두 워커가 같은 줄을 동시에 집어도 한쪽만 갱신에 성공한다.
    //    force(시험) 일 때만 이 경계를 푼다.
    let claim = db
      .from("dot_bonds")
      .update({ last_pinged_on: day, last_pinged_at: new Date().toISOString(), pings_today: pingsToday + 1 })
      .eq("user_id", b.user_id).eq("character_id", b.character_id);
    if (!force) claim = claim.or(`last_pinged_on.is.null,last_pinged_on.neq.${day}`);
    const { data: claimed } = await claim.select("user_id").maybeSingle();
    if (!claimed) continue;

    const { data: ch } = await db.from("dot_characters").select("id, slug, name, persona, speech, formal_start, voice_ladder").eq("id", b.character_id).maybeSingle();
    if (!ch) continue;

    // 3) 한 문장 만든다.
    let text = "", emotion = "neutral";
    try {
      const out = await defaultProviders().ai.generateStructuredOutput({
        systemInstructions: [
          `너는 "${ch.name}" 다. 지금 네가 **먼저** 말을 거는 것이다 — 상대는 아직 아무 말도 안 했다.`,
          "", "## 너는 누구인가", ch.persona as string, ch.speech ? `말투: ${ch.speech}` : "",
          // 09-30: 여기는 모든 캐릭터에 존댓말 사다리를 쓰고 있었다 — 린이 먼저 말을 걸 때 존댓말로 걸었다.
          "", "## 지금 이 사람과의 사이", `${b.stage}단계. ${stageVoiceFor(toVoiceLadder(ch.voice_ladder, ch.formal_start as boolean | undefined), b.stage)}`,
          memoForToday(b.memo) ? `\n오늘은 이 기억 하나를 **꼭** 살짝 건드린다(그 낱말을 써서): ${memoForToday(b.memo)}` : "",
          "", "## 지금", `한국 시간 ${timeOfDayKST()}. 이 시간에 어울리는 한마디여야 한다.`,
          "", "## 어떻게 말하나",
          "- **딱 한 문장**, 40자 이내. 알림 한 줄로 뜬다.",
          "- 안부·궁금함·오늘 있었던 소소한 일 중 하나. 질문으로 끝내면 답하기 쉽다.",
          "- 위에 '오늘 건드릴 기억' 이 있으면 그 얘기로 시작한다(예: 등산은 어땠어요?). 없는 것은 지어내지 않는다.",
          "- 네가 AI 라는 말, 성적인 내용은 안 한다.",
          "", "## 답의 모양 (json)", "- `text` 그 한 문장", "- `emotion` neutral/happy/shy/sad/angry/surprised 중 하나",
        ].filter(Boolean).join("\n"),
        input: "(먼저 말을 건다)",
        schema: opener, schemaName: "dot_opener", maxTokens: 400, tier: "conversation",
      });
      text = out.output.text.trim().slice(0, 60);
      emotion = toEmotion(out.output.emotion);
    } catch (e) {
      log(`[먼저말걸기] ${ch.name} 문장 실패: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (!text) continue;

    // 4) 방에 남기고 보낸다.
    await db.from("dot_messages").insert({ user_id: b.user_id, character_id: ch.id, role: "character", content: text, emotion });

    const { data: mySubs } = await db.from("dot_push_subs").select("id, endpoint, p256dh, auth").eq("user_id", b.user_id).is("dead_at", null);
    const payload = JSON.stringify({ title: ch.name, body: text, url: `/dot/${ch.slug}`, tag: `dot-${ch.slug}` });
    for (const s of (mySubs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await db.from("dot_push_subs").update({ dead_at: new Date().toISOString() }).eq("id", s.id);
          dead++;
        } else {
          log(`[먼저말걸기] 보내기 실패 ${code ?? ""}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    log(`[먼저말걸기] ${ch.name} → ${b.user_id.slice(0, 8)} "${text}" (${b.ping_minute}분째, 구독 ${(mySubs ?? []).length})`);
  }
  return { drawn, sent, dead };
}
