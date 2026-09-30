const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("title, created_at, content_json").eq("deliverable_type", "app_build").order("created_at", { ascending: false }).limit(300);
type 줄 = { 날: string; 제목: string; 글자: number; 파일: number; 기준: number; 맞음: number; 틀림: number; 모름: number; 바퀴: string; 돌았나: string };
const 줄들: 줄[] = [];
for (const d of (data ?? []) as any[]) {
  const cj = d.content_json ?? {}; const fs = cj.files ?? [];
  if (!fs.length) continue;
  const l = cj.loop ?? {}; const v = l.verdict ?? {};
  const 기준 = (cj.criteria ?? []).length || ((v.met ?? []).length + (v.unmet ?? []).length + (v.unknown ?? []).length);
  줄들.push({
    날: d.created_at.slice(5, 10), 제목: (d.title ?? "").slice(0, 26), 글자: fs.reduce((s: number, f: any) => s + f.contents.length, 0), 파일: fs.length,
    기준, 맞음: (v.met ?? []).length, 틀림: (v.unmet ?? []).length, 모름: (v.unknown ?? []).length,
    바퀴: String((l.rounds ?? []).length || "-"),
    돌았나: l.facts ? (l.facts.ran === false ? "못돌림" : "돌림") : "-",
  });
}
줄들.sort((a, b) => b.글자 - a.글자);
console.log("가장 큰 판 12개 (글자 수 기준)");
console.log("날    제목                       글자    파일 기준 맞음 틀림 모름 바퀴 돌았나");
for (const r of 줄들.slice(0, 12)) console.log(`${r.날} ${r.제목.padEnd(26)} ${String(r.글자).padStart(7)} ${String(r.파일).padStart(3)} ${String(r.기준).padStart(4)} ${String(r.맞음).padStart(4)} ${String(r.틀림).padStart(4)} ${String(r.모름).padStart(4)} ${r.바퀴.padStart(4)} ${r.돌았나}`);
const 실제로된것 = 줄들.filter((r) => r.돌았나 === "돌림" && r.틀림 === 0 && r.맞음 >= 3);
console.log(`\n**실제로 돌렸고 틀린 기준 0개** 인 판 ${실제로된것.length}개 중 가장 큰 것:`);
for (const r of 실제로된것.slice(0, 5)) console.log(`  ${r.날} ${r.제목} — ${r.글자}자 · 파일 ${r.파일} · 기준 ${r.기준}(맞음 ${r.맞음}/모름 ${r.모름})`);
console.log(`\n파일 수 많은 것: ${줄들.slice().sort((a,b)=>b.파일-a.파일).slice(0,4).map((r)=>`${r.제목}=${r.파일}개(${r.글자}자,${r.돌았나})`).join(" · ")}`);
