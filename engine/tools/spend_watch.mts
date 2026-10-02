/**
 * **지금 무엇이 돈을 쓰고 있나** (228회차 10-03, 사장님 "돈 이제 쓰면 안돼 애플앱스토어 비싸서"). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/spend_watch.mts [며칠=7]
 *
 * 돈을 아끼려면 **내가 안 쓰는 것**만으로는 모자라다. 매일 저절로 도는 것이 있으면
 * 내가 손을 떼도 장부는 계속 준다. 그래서 **날마다·쓰임새마다** 갈라 센다.
 *
 * 특히 보는 것:
 *  - **사람이 안 시킨 지출**(자가진화·매일 수집·예약) — 끄면 바로 0 이 되는 자리다.
 *  - 하루 평균이 그대로 가면 한 달에 얼마인가 — 애플 $99 와 견줄 수 있게.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const 며칠 = Number(process.argv[2] ?? 7);
const 부터 = new Date(Date.now() - 며칠 * 864e5).toISOString();

const { data } = await db.from("model_usage")
  .select("cost_usd, purpose, created_at, company_id").gte("created_at", 부터).limit(5000);
const rows = (data ?? []) as { cost_usd: number | string; purpose: string | null; created_at: string; company_id: string }[];
if (!rows.length) { console.log(`최근 ${며칠}일 지출 기록이 없다.`); process.exit(0); }

const { data: cos } = await db.from("companies").select("id, name");
const 이름 = new Map(((cos ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
const 돈 = (r: typeof rows[number]) => Number(r.cost_usd ?? 0);
const 합 = rows.reduce((s, r) => s + 돈(r), 0);

// ── 날마다 ──────────────────────────────────────────────
const 날 = new Map<string, number>();
for (const r of rows) { const d = r.created_at.slice(0, 10); 날.set(d, (날.get(d) ?? 0) + 돈(r)); }
console.log(`최근 ${며칠}일 · 호출 ${rows.length}건 · 합 $${합.toFixed(2)}\n`);
console.log("날마다");
for (const [d, v] of [...날].sort()) console.log(`  ${d}  $${v.toFixed(3)}${"█".repeat(Math.round(v * 8)).slice(0, 40)}`);

// ── 쓰임새마다 ───────────────────────────────────────────
const 쓰임 = new Map<string, { n: number; c: number }>();
for (const r of rows) { const k = r.purpose ?? "(안 적힘)"; const v = 쓰임.get(k) ?? { n: 0, c: 0 }; v.n++; v.c += 돈(r); 쓰임.set(k, v); }
console.log("\n쓰임새마다 (큰 것부터)");
for (const [k, v] of [...쓰임].sort((a, b) => b[1].c - a[1].c).slice(0, 12)) {
  console.log(`  ${k.padEnd(18)} ${String(v.n).padStart(4)}건  $${v.c.toFixed(3)}`);
}

// ── 회사마다 ────────────────────────────────────────────
const 회사 = new Map<string, number>();
for (const r of rows) { const k = 이름.get(r.company_id) ?? r.company_id.slice(0, 8); 회사.set(k, (회사.get(k) ?? 0) + 돈(r)); }
console.log("\n회사마다");
for (const [k, v] of [...회사].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} $${v.toFixed(3)}`);

/**
 * **사람이 안 시킨 지출.** 이 쓰임새들은 내가 손을 떼도 저절로 돈다 —
 * 돈을 멈추려면 여기를 꺼야 한다. (쓰임새 이름은 장부에 적힌 그대로다.)
 */
const 저절로 = ["genesis", "rule_", "daily", "weekly", "next_work", "self_", "evolution", "collect"];
const 저절로쓴것 = rows.filter((r) => 저절로.some((w) => (r.purpose ?? "").includes(w)));
const 저절로합 = 저절로쓴것.reduce((s, r) => s + 돈(r), 0);
console.log(`\n**사람이 안 시킨 것**: ${저절로쓴것.length}건 · $${저절로합.toFixed(3)} (전체의 ${((저절로합 / 합) * 100).toFixed(0)}%)`);

const 하루 = 합 / Math.max(1, 날.size);
console.log(`\n하루 평균 $${하루.toFixed(3)} → 이대로면 한 달 **$${(하루 * 30).toFixed(2)}**`);
console.log(`(애플 개발자 $99/년 = 한 달 $8.25 꼴)`);
if (저절로합 > 0) {
  const 저절로하루 = 저절로합 / Math.max(1, 날.size);
  console.log(`\n저절로 도는 것만 멈추면 한 달 $${(저절로하루 * 30).toFixed(2)} 가 준다.`);
  console.log(`끄는 자리: 환경변수 GENESIS_SPEND (워커 서비스). 끄면 자가진화는 목(mock)으로만 돈다.`);
}
