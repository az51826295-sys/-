/**
 * **기다리면 언제 풀리나** (10-12). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rookery_언제열리나.mts
 *
 * "10-31 쯤 월초에 리셋된다" 는 **틀린 그림**이다. 달이 바뀌어도 아무 일도 안 일어난다 —
 * 한도는 **굴러가는 30일 창**이고, 창 밖으로 빠져나간 지출만큼 자리가 생긴다.
 * 그래서 "언제 열리나" 는 짐작이 아니라 **계산**이다. 날마다 창을 다시 그어 본다.
 *
 * 한도 시작점(`credits_started_at`)이 있으면 그보다 앞의 지출은 아예 안 센다(09-25 에 그렇게 만들었다).
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const 창일 = 30;

const { data: 회사들 } = await db.from("companies").select("id,name,spend_limit_usd,credits_started_at");
for (const c of (회사들 ?? []).filter((x: any) => Number(x.spend_limit_usd ?? 0) > 0)) {
  // 지출을 쪽으로 나눠 받는다 — 한 번에 1000줄 상한이 있다(10-12 에 여기 걸렸다)
  const 들: any[] = [];
  for (let 쪽 = 0; ; 쪽++) {
    const { data } = await db.from("model_usage").select("created_at,cost_usd")
      .eq("company_id", c.id).gte("created_at", new Date(Date.now() - 90 * 864e5).toISOString())
      .order("created_at", { ascending: true }).range(쪽 * 1000, 쪽 * 1000 + 999);
    들.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const 한도 = Number(c.spend_limit_usd);
  const 시작 = c.credits_started_at ? new Date(c.credits_started_at).getTime() : 0;
  /** 그날 기준 창 안의 지출 — 창은 [max(그날-30일, 한도시작점), 그날] */
  const 창합 = (때: number) => {
    const 앞 = Math.max(때 - 창일 * 864e5, 시작);
    return 들.filter((r) => { const t = new Date(r.created_at).getTime(); return t >= 앞 && t <= 때; })
             .reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
  };
  const 지금 = 창합(Date.now());
  console.log(`\n${String(c.name).padEnd(12)} 지금 $${지금.toFixed(2)} / $${한도}`
    + (지금 >= 한도 ? "  **막혀 있다**" : "  열려 있다"));
  if (지금 < 한도) { console.log(`   남은 자리 $${(한도 - 지금).toFixed(2)}`); continue; }

  /* 날마다 창을 다시 그어 **처음 열리는 날**을 찾는다. 새 지출이 없다고 보고 센다
     — 기다리는 동안 아무것도 안 쓴다는 전제이고, 쓰면 그만큼 미뤄진다. */
  let 열림: string | null = null;
  for (let d = 1; d <= 90; d++) {
    const 때 = Date.now() + d * 864e5;
    if (창합(때) < 한도) { 열림 = new Date(때).toISOString().slice(0, 10); break; }
  }
  if (!열림) { console.log("   90일 안에는 안 열린다(그만큼 최근에 많이 썼다)"); continue; }
  const 며칠 = Math.round((new Date(열림).getTime() - Date.now()) / 864e5);
  console.log(`   아무것도 안 쓰면 **${열림}** 에 열린다 (${며칠}일 뒤)`);
  // 그 뒤 며칠은 얼마나 열리나 — 하루 만에 다시 막히면 "열렸다"가 뜻이 없다
  for (const 더 of [3, 7, 14]) {
    const 때 = new Date(열림).getTime() + 더 * 864e5;
    console.log(`     +${String(더).padStart(2)}일 뒤 창 안 $${창합(때).toFixed(2)} → 자리 $${Math.max(0, 한도 - 창합(때)).toFixed(2)}`);
  }
}
