/**
 * **사례 창이 14일 내내 160 에 멈춰 있다** (10-13). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/work/probe/사례창.mts
 *
 * genesis_runs 를 보니 09-30 부터 10-13 까지 **매일 똑같이** `total 160 · train 108 · holdout 52` 다.
 * 10-01 에 "창이 막혀 자가진화가 굶었다" 를 고쳤다고 적어 뒀는데(limit 160→400), 숫자가 안 움직였다.
 * **고친 것이 안 먹었나, 아니면 재료가 정말 160건뿐인가** — 둘 중 하나다. 세 본다.
 *
 * 모델은 안 부른다(`ai: null`) — 사장님 반응 읽기는 건너뛰고 **개수만** 본다.
 */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { collectCases } = await import("../../../src/lib/genesis/cases");

const 회사 = process.argv[2] ?? "5925c03a-557f-46d7-8589-7388b769df40";
for (const 창 of [160, 400, 2000]) {
  const cs = await collectCases(db as never, 회사, { limit: 창, ai: null });
  const 종류: Record<string, number> = {};
  for (const c of cs) 종류[(c as { source?: string }).source ?? "?"] = (종류[(c as { source?: string }).source ?? "?"] ?? 0) + 1;
  const 나쁜 = cs.filter((c) => !(c as { ok?: boolean }).ok).length;
  console.log(` limit ${String(창).padStart(4)} → **${cs.length}건** (나쁜 ${나쁜}) · ${Object.entries(종류).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
}
