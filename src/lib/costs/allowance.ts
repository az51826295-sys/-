import type { SupabaseClient } from "@supabase/supabase-js";
import { formatUsd } from "@/lib/costs/pricing";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export interface SpendAllowance {
  limitUsd: number;
  spentUsd: number;
  remainingUsd: number;
  windowDays: number;
  /** True when no new work may start. */
  exhausted: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How much of this company's allowance is left.
 *
 * Read from the same `model_usage` ledger that every call already writes to,
 * so the figure the gate enforces and the figure the manager sees are the same
 * number rather than two counts that can disagree.
 *
 * Free to compute, which matters — it runs before every piece of work.
 */
export async function checkAllowance(
  db: Db,
  companyId: string,
): Promise<SpendAllowance> {
  const { data: company } = await db
    .from("companies")
    .select("spend_limit_usd, spend_window_days")
    .eq("id", companyId)
    .maybeSingle();

  const limitUsd = Number(company?.spend_limit_usd ?? 0);
  const windowDays = Number(company?.spend_window_days ?? 30);

  const since = new Date(Date.now() - windowDays * DAY_MS).toISOString();

  // 42회차 점검: ① 못 읽으면 0 으로 치고 **열어 줬다**(한도가 사라진다). 한도는 못 읽을 때 닫는 쪽이 맞다.
  // ② PostgREST 는 한 번에 최대 몇 백~천 행만 준다 — 장부가 그만큼 쌓이면 합계가 거기서 멈춘다. 쪽을 넘겨 가며 다 센다.
  let spentUsd = 0;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await db
      .from("model_usage")
      .select("cost_usd")
      .eq("company_id", companyId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      // 못 읽었다 = 얼마 썼는지 모른다. 모르면 멈춘다.
      console.error("[allowance] 장부를 못 읽었다 — 한도에 걸린 것으로 본다:", error.message);
      return { limitUsd, spentUsd: limitUsd, remainingUsd: 0, windowDays, exhausted: true };
    }
    const page = (rows ?? []) as { cost_usd: number | string }[];
    spentUsd += page.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
    if (page.length < PAGE) break;
  }

  return {
    limitUsd,
    spentUsd,
    remainingUsd: Math.max(0, limitUsd - spentUsd),
    windowDays,
    exhausted: spentUsd >= limitUsd,
  };
}

/**
 * The gate. Returns a message when work must not start, null when it may.
 *
 * Checked before work begins rather than during it, and deliberately so: a run
 * killed halfway leaves a half-written deliverable and an employee stuck
 * mid-assignment, which is a worse outcome than the small overshoot of letting
 * a started piece of work finish.
 *
 * That overshoot is real and bounded: the ledger can end a window up to one
 * assignment's cost over the limit. With the default limit that is a few tens
 * of cents, and it is the price of never leaving the company in a broken state.
 */
export async function blockedBySpendLimit(
  db: Db,
  companyId: string,
): Promise<string | null> {
  const allowance = await checkAllowance(db, companyId);

  if (!allowance.exhausted) return null;

  return `This account has used its ${formatUsd(allowance.limitUsd)} allowance for the last ${allowance.windowDays} days. Work already under way will finish, but nothing new can start.`;
}
