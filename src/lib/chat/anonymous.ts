import { createServiceClient } from "@/lib/supabase/service";
import { costOf } from "@/lib/costs/pricing";

/**
 * 로그인 없이 쓰는 대화의 안전장치.
 *
 * 대화를 열어 두는 이유는 분명하다 — 링크를 연 사람이 값어치를 보기 전에 가입을
 * 요구받으면 대부분 그냥 닫는다. 그런데 익명 대화도 **돈을 쓴다**. 회사가 없으면
 * 회사 한도가 안 걸리고, 계량도 회사 id 를 요구하므로 통째로 빠진다. 그대로 열면
 * 장부에 안 남고 상한도 없는 구멍이 되고, 링크가 새는 순간 무한정이다.
 *
 * 그래서 세 겹으로 막는다:
 *
 *   방문자별 턴 수   한 사람이 오래 붙어 있는 것을 막는다. 브라우저 값이라
 *                    지우면 초기화되므로 **이것만으로는 방어가 아니다.**
 *   일일 총액        진짜 방어. 지우고 다시 와도 이 벽은 그대로다.
 *   싼 등급 고정     익명은 대화 등급만 쓴다. 보고서를 익명으로 뽑아 가지 못한다.
 */

/** 익명 하루 총액. 넘으면 그날은 익명 대화를 닫는다. */
export const ANON_DAILY_USD = Number(process.env.ANON_DAILY_USD ?? 2);
/** 한 방문자가 하루에 쓸 수 있는 턴. */
export const ANON_TURNS_PER_DAY = Number(process.env.ANON_TURNS_PER_DAY ?? 10);

export type AnonGate =
  | { allowed: true; turnsLeft: number }
  | { allowed: false; why: string };

function since(): string {
  const d = new Date();
  d.setHours(d.getHours() - 24);
  return d.toISOString();
}

export async function checkAnonymous(visitor: string): Promise<AnonGate> {
  const db = createServiceClient();
  const from = since();

  const { data: rows } = await db
    .from("anonymous_usage")
    .select("visitor, usd")
    .gte("created_at", from);

  const all = (rows ?? []) as { visitor: string | null; usd: number }[];
  const spent = all.reduce((sum, r) => sum + (r.usd ?? 0), 0);
  if (spent >= ANON_DAILY_USD) {
    return {
      allowed: false,
      why: "오늘 몫의 무료 대화가 다 찼습니다. 로그인하시면 이어서 쓸 수 있습니다.",
    };
  }

  const mine = all.filter((r) => r.visitor === visitor).length;
  if (mine >= ANON_TURNS_PER_DAY) {
    return {
      allowed: false,
      why: `로그인 없이는 하루 ${ANON_TURNS_PER_DAY}번까지 쓸 수 있습니다. 로그인하시면 제한이 없습니다.`,
    };
  }

  return { allowed: true, turnsLeft: ANON_TURNS_PER_DAY - mine };
}

/** 익명 사용을 장부에 남긴다. 이게 빠지면 위 상한이 셀 것이 없어진다. */
export async function recordAnonymous(
  visitor: string,
  call: { model: string; inputTokens: number; outputTokens: number },
): Promise<void> {
  const db = createServiceClient();
  await db.from("anonymous_usage").insert({
    visitor,
    model: call.model,
    input_tokens: call.inputTokens,
    output_tokens: call.outputTokens,
    usd: costOf({
      backend: call.model,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
    }),
  });
}
