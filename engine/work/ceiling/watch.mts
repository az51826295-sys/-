import { writeFileSync } from "node:fs";
const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();
const { data: all } = await db.from("assignments").select("id").gte("created_at", "2026-09-30T18:08:00Z").order("created_at", { ascending: false }).limit(10);
const id = ((all ?? []) as any[]).find((r) => r.id.startsWith("24aae924"))!.id;
let 마지막 = "";
for (let i = 0; i < 200; i++) {
  const { data: a } = await db.from("assignments").select("status").eq("id", id).single();
  const { data: ex } = await db.from("work_executions").select("id, status, current_step, error_code, error_message").eq("assignment_id", id).order("created_at", { ascending: false }).limit(1);
  const e = (ex ?? [])[0] as any;
  const 지금 = `${(a as any).status}/${e?.status ?? "-"}/${e?.current_step ?? "-"}`;
  if (지금 !== 마지막) { console.log(new Date().toTimeString().slice(0, 8), 지금); 마지막 = 지금; }
  if (["completed", "failed", "cancelled"].includes((a as any).status) || e?.status === "failed") {
    console.log("== 끝", (a as any).status, e?.error_code ?? "", (e?.error_message ?? "").slice(0, 200));
    const { data: d } = await db.from("deliverables").select("id, title, content_json").eq("assignment_id", id).order("created_at", { ascending: false }).limit(1);
    const dv = (d ?? [])[0] as any;
    if (dv) {
      const cj = dv.content_json ?? {}, l = cj.loop ?? {}, v = l.verdict ?? {};
      writeFileSync("engine/work/ceiling/결과7.json", JSON.stringify(cj, null, 1));
      for (const f of cj.files ?? []) {
        const p = `engine/work/ceiling/게임7/${f.path}`;
        (await import("node:fs")).mkdirSync(p.split("/").slice(0, -1).join("/"), { recursive: true });
        writeFileSync(p, f.contents);
      }
      const 글자 = (cj.files ?? []).reduce((s: number, f: any) => s + f.contents.length, 0);
      console.log("제목", dv.title);
      console.log(`**${글자}자 · 파일 ${(cj.files ?? []).length}개** —`, (cj.files ?? []).map((f: any) => `${f.path}(${Math.round(f.contents.length / 1024)}KB)`).join(" "));
      console.log("바퀴", (l.rounds ?? []).length, "| 멈춤", l.stoppedBy, "| 값 $", (l.usd ?? 0).toFixed(4), "| 돌림", l.facts?.ran !== false);
      console.log("맞음", (v.met ?? []).length, JSON.stringify(v.met ?? []));
      console.log("틀림", (v.unmet ?? []).length, JSON.stringify((v.unmet ?? []).map((u: any) => u.id ?? u)));
      console.log("모름", (v.unknown ?? []).length, JSON.stringify(v.unknown ?? []));
      console.log("깨짐", JSON.stringify(v.broken ?? []));
    }
    const { data: exs } = await db.from("work_executions").select("id").eq("assignment_id", id);
    const { data: u } = await db.from("model_usage").select("cost_usd").in("work_execution_id", ((exs ?? []) as any[]).map((x) => x.id));
    console.log("호출", (u ?? []).length, "합계 $", ((u ?? []) as any[]).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0).toFixed(4));
    break;
  }
  await new Promise((r) => setTimeout(r, 10000));
}
