/** 무인 판 2의 **무게별 실측** — 얼린 대기열의 추정치를 갈아 낄 근거. 읽기만 한다. */
import { readFileSync } from "node:fs";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const q = JSON.parse(readFileSync("engine/docs/genesis/unattended-queue-2.json", "utf8")) as { items: { n: number; weight: string; title: string }[] };
const wOf = new Map(q.items.map((x) => [x.title, x.weight]));
const { data: row } = await db.from("genesis_runs").select("result").eq("kind", "unattended").order("run_date", { ascending: false }).limit(1).maybeSingle();
const since = (row!.result as { startedAt: string }).startedAt;
const { data: asg } = await db.from("assignments").select("id, title").eq("role_input_json->>unattended", "true");
const tOf = new Map((asg ?? []).map((a) => [a.id as string, a.title as string]));
const { data: ex } = await db.from("work_executions").select("id, assignment_id, started_at, completed_at, status").gte("created_at", since);
const { data: mu } = await db.from("model_usage").select("cost_usd, work_execution_id").gte("created_at", since);
const cost = new Map<string, number>();
for (const m of mu ?? []) { const k = m.work_execution_id as string | null; if (k) cost.set(k, (cost.get(k) ?? 0) + Number(m.cost_usd ?? 0)); }
const by = new Map<string, { usd: number[]; min: number[] }>();
for (const e of ex ?? []) {
  if (e.status !== "completed" || !e.completed_at) continue;
  const w = wOf.get(tOf.get(e.assignment_id as string) ?? "") ?? "알 수 없음";
  const u = cost.get(e.id as string) ?? 0; if (!u) continue;
  const g = by.get(w) ?? { usd: [], min: [] }; g.usd.push(u);
  g.min.push((Date.parse(e.completed_at as string) - Date.parse((e.started_at ?? e.completed_at) as string)) / 60000);
  by.set(w, g);
}
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log("무게별 실측 (무인 판 2, 끝난 판만)");
for (const w of ["가벼움", "중간", "무거움", "알 수 없음"]) {
  const g = by.get(w); if (!g?.usd.length) continue;
  console.log(`  ${w.padEnd(6)} n=${String(g.usd.length).padStart(2)} · 값 중앙 $${med(g.usd).toFixed(3)} (추정 대비) · 시간 중앙 ${med(g.min).toFixed(1)}분`);
}
const all = [...by.values()].flatMap((g) => g.usd);
console.log(`합계 n=${all.length} · $${all.reduce((a, b) => a + b, 0).toFixed(3)}`);
