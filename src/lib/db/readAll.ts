import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * **다 읽었는지 기계가 확인한다** (2026-09-22, 사장님).
 *
 * Supabase 는 한 번에 **1000줄까지만** 준다. `select()` 만 쓰고 전부 왔다고 믿으면 **조용히 잘린 채로 더한다.**
 * 09-22 에 그 일이 두 번 났다:
 * - "지금까지 쓴 돈" 을 $59.49 라고 적었는데 실제는 **$64.31** 이었다(원장 1501줄 중 1000줄만 읽었다).
 * - 엔진·분류 어긋남 비용을 절반 넘게 낮게 쟀다.
 *
 * 잡힌 것은 사장님이 **부분의 합이 전체보다 작다**는 것을 본 덕이었다. 그때까지 아무 경고도 없었다.
 *
 * 그래서 **약속 대신 도구로 막는다**: 쪽수로 나눠 다 읽고, **받은 줄 수와 전체 줄 수를 대조**한다.
 * 안 맞으면 **던진다** — 합계가 분모와 안 맞을 때 "이 표는 못 믿는다" 를 찍는 것과 같은 장치다.
 */

export const PAGE = 1000;

export async function readAll<T = Record<string, unknown>>(
  db: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const { count, error: ce } = await db.from(table).select(columns, { count: "exact", head: true });
  if (ce) throw new Error(`${table} 줄 수를 못 셌다: ${ce.message}`);
  const total = count ?? 0;
  const out: T[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} ${from}쪽을 못 읽었다: ${error.message}`);
    out.push(...((data ?? []) as T[]));
  }
  // **여기서 막는다.** 받은 줄 수가 전체와 다르면 그 숫자는 못 쓴다.
  if (out.length !== total) {
    throw new Error(`${table}: 받은 줄 ${out.length} ≠ 전체 ${total} — **이 읽기는 못 믿는다.** (1000줄 자름이거나 읽는 도중 줄이 늘었다)`);
  }
  return out;
}

/** 이미 읽은 것이 다 왔는지만 본다. 좁혀서 물은 읽기에 쓴다. */
export async function assertComplete(db: SupabaseClient, table: string, got: number): Promise<void> {
  const { count } = await db.from(table).select("id", { count: "exact", head: true });
  const total = count ?? 0;
  if (got < total && got >= PAGE) {
    throw new Error(`${table}: 받은 줄 ${got} < 전체 ${total} 이고 ${PAGE} 의 배수다 — **잘렸을 수 있다. 못 믿는다.**`);
  }
}
