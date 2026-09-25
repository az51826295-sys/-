const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("id, content_json, content_markdown").gte("created_at", "2026-09-25").order("created_at", { ascending: false }).limit(20);
for (const pre of process.argv.slice(2)) {
  const d = ((data ?? []) as Record<string, any>[]).find((x) => String(x.id).startsWith(pre)); if (!d) { console.log(pre, "없음"); continue; }
  const c = (d.content_json ?? {}) as Record<string, any>;
  console.log(`--- ${pre} 키: ${Object.keys(c).join(",")}`);
  for (const k of ["durations", "total", "judge", "verdict", "judgeBy", "script"]) if (c[k] != null) console.log(`  ${k}: ${JSON.stringify(c[k]).slice(0, 260)}`);
  console.log("  markdown:", String(d.content_markdown ?? "").replace(/\s+/g, " ").slice(0, 500));
}
