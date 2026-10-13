/**
 * **말에서 주운 반응이 14판 내내 35/120 이다** — 왜 (10-13). 모델 0 · 값 0.
 *
 * `implicit.ts:89` 가 `.limit(5000)` 을 적었는데 **Supabase 는 기본으로 1000줄에서 끊는다**
 * (10-12 에 내 도구가 똑같이 걸렸다). 오름차순이라 **새 말이 영영 안 들어온다** —
 * 그러면 35/120 이 굳는 게 맞다. 장부에 적힌 `read` 가 1000 의 배수인지로 가린다.
 */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const { data } = await db.from("genesis_runs").select("run_date, result").eq("kind", "daily")
  .order("run_date", { ascending: false }).limit(6);
for (const r of (data ?? []) as Record<string, any>[]) {
  const co = Object.entries(r.result ?? {}).find(([k]) => /^[0-9a-f]{8}-/.test(k))?.[1] as any;
  console.log(` ${r.run_date}  implicit = ${JSON.stringify(co?.implicit ?? null)}`);
}

/* 실제로 몇 줄 있나 — 끊기는 게 맞는지 센다 */
const { data: co1 } = await db.from("companies").select("owner_id").eq("id", "5925c03a-557f-46d7-8589-7388b769df40").maybeSingle();
const { data: convs } = await db.from("conversations").select("id").eq("owner_id", co1!.owner_id as string).limit(500);
const ids = (convs ?? []).map((c: any) => c.id as string);
console.log(`\n 대화 ${ids.length}개`);
let 전체 = 0;
for (let i = 0; i < ids.length; i += 50) {
  const { count } = await db.from("conversation_messages").select("*", { count: "exact", head: true })
    .in("conversation_id", ids.slice(i, i + 50));
  const { data: 한판 } = await db.from("conversation_messages").select("id")
    .in("conversation_id", ids.slice(i, i + 50)).order("created_at", { ascending: true }).limit(5000);
  전체 += count ?? 0;
  console.log(`   묶음 ${i / 50 + 1}: 진짜 ${count}줄 · limit(5000) 으로 받은 것 **${한판?.length ?? 0}줄**`);
}
console.log(` 합 ${전체}줄`);
