import type { SupabaseClient } from "@supabase/supabase-js";
import { TRIAL_USD, toCredits } from "./plans";
import type { GrantPlan } from "./paddle";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * 크레딧 원장 (100회차 09-13, 월 구독으로 바꿈).
 *
 * **지금 기간**만 센다: 잔고 = `credits_started_at` 이후 원장 합계(구독·체험·지급·환불) − 같은 시점 이후 `model_usage` 원가.
 * 구독이 갱신될 때마다 `credits_started_at` 을 그 시각으로 옮기고 그 달 한도를 한 줄 넣는다 → 남은 크레딧은 다음 달로 안 넘어간다.
 * 스키마 변경 없이(열·표 그대로) "매달 새로"를 만든다. 비용 장부는 두 번 적지 않는다 — 한도 문과 화면이 같은 두 표를 읽는다.
 * 못 읽으면 잔고 0 으로 본다(모르면 멈춘다 — 42회차 점검 규칙).
 *
 * 시각 주의: 기간 시작과 그 달 첫 줄의 created_at 을 **같은 값**으로 넣는다. DB 기본값 now() 와 서버 시계가 1초만 어긋나도
 * 첫 줄이 기간 밖으로 밀려 잔고가 0 이 된다.
 */
export type CreditBalance = { usd: number; credits: number; paidUsd: number; spentUsd: number; readable: boolean };

export function balanceFrom(ledgerUsd: number, spentUsd: number): { usd: number; credits: number } {
  const usd = Math.round((ledgerUsd - spentUsd) * 1e6) / 1e6;
  return { usd, credits: Math.max(0, toCredits(usd)) };
}

async function sumPaged(db: Db, table: string, column: string, companyId: string, since: string): Promise<number | null> {
  let total = 0;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select(column)
      .eq("company_id", companyId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as unknown as Record<string, number | string>[];
    total += rows.reduce((s, r) => s + Number(r[column] ?? 0), 0);
    if (rows.length < PAGE) return total;
  }
}

export async function creditBalance(db: Db, companyId: string, startedAt: string | null): Promise<CreditBalance> {
  const since = startedAt ?? new Date(0).toISOString();
  const [paid, spent] = await Promise.all([
    sumPaged(db, "credit_ledger", "delta_usd", companyId, since),
    sumPaged(db, "model_usage", "cost_usd", companyId, since),
  ]);
  if (paid === null || spent === null) return { usd: 0, credits: 0, paidUsd: paid ?? 0, spentUsd: spent ?? 0, readable: false };
  return { ...balanceFrom(paid, spent), paidUsd: paid, spentUsd: spent, readable: true };
}

/**
 * 결제 한 건을 원장에 넣는다. 서비스 키 전용.
 * 구독 결제면(첫 결제든 매달 갱신이든) **먼저 새 기간을 연다** — 남은 크레딧을 넘기지 않기 위해.
 * 순서가 중요하다: 같은 거래가 두 번 오면(Paddle 재전송) 기간을 또 열면 안 된다 — 이미 들어간 그 달 한도가 기간 밖으로 밀려
 * 잔고가 0 이 된다. 그래서 **중복 확인을 기간 열기보다 먼저** 한다.
 */
export async function recordGrant(svc: Db, plan: GrantPlan): Promise<"granted" | "duplicate" | "no-company" | "error"> {
  const { data: co } = await svc.from("companies").select("id").eq("id", plan.companyId).maybeSingle();
  if (!co) return "no-company";
  const { data: dup } = await svc.from("credit_ledger").select("id").eq("ref", plan.ref).maybeSingle();
  if (dup) return "duplicate";

  const at = new Date().toISOString();
  if (plan.subscriptionId) {
    const { error: pe } = await svc.from("companies").update({ billing_mode: "prepaid", credits_started_at: at }).eq("id", plan.companyId);
    if (pe) { console.error("[billing] 새 기간을 못 열었다:", pe.message); return "error"; }
  }
  const { error } = await svc.from("credit_ledger").insert({
    company_id: plan.companyId,
    delta_usd: plan.deltaUsd,
    kind: "purchase",
    sku: plan.sku.id,
    provider: plan.provider ?? "paddle",
    ref: plan.ref,
    amount_paid: plan.amountPaid,
    currency: plan.currency,
    note: plan.subscriptionId ? `구독 ${plan.subscriptionId}` : plan.quantity > 1 ? `${plan.quantity}개` : null,
    created_at: at,
  });
  if (!error) return "granted";
  if (error.code === "23505") return "duplicate";
  console.error("[billing] 원장에 못 넣음:", error.message);
  return "error";
}

/**
 * 새 회사를 충전식으로 시작한다: 방식 표시 + 체험 크레딧 한 번. ref 가 회사마다 하나라 두 번 불려도 한 번만 준다.
 * BILLING_OPEN=1 일 때만 부른다(실패는 삼키고 기록만 — 회사 만들기를 깨지 않는다).
 */
export async function startPrepaid(svc: Db, companyId: string): Promise<void> {
  const at = new Date().toISOString();
  const { error: e1 } = await svc.from("companies").update({ billing_mode: "prepaid", credits_started_at: at }).eq("id", companyId);
  if (e1) { console.error("[billing] 충전식 시작 실패:", e1.message); return; }
  const { error: e2 } = await svc.from("credit_ledger").insert({ company_id: companyId, delta_usd: TRIAL_USD, kind: "trial", ref: `trial:${companyId}`, note: "처음 체험", created_at: at });
  if (e2 && e2.code !== "23505") console.error("[billing] 체험 크레딧 실패:", e2.message);
}
