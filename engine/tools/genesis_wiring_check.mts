/**
 * 자가진화가 **배포된 서버에서 진짜로 도는가** (118회차 09-15). 돈 0, 모델 없음.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_wiring_check.mts
 *
 * 100~117회차에 만든 것이 열 개가 넘는데, 각각은 자가 있어도 **다 이어져서 실제로 도는지** 보는 자가 없었다.
 * 09-05 에 등록 한 줄이 빠져 Nova·Dev 가 일주일 동안 일을 못 받은 적이 있고(그 고장은 화면에도 로그에도 안 보인다),
 * 09-07 이후 영상이 일주일 넘게 죽어 있었는데 아무도 몰랐다. 그 종류를 잡는 자다.
 *
 * 재는 것: 매일 실행이 어제~오늘 돌았나 · 그 결과가 성공인가 · 규칙 고리가 돈 흔적 · 영상 배관 점검 결과 ·
 *          채택된 규칙이 **일 프롬프트까지 닿나** · 진화한 유전자가 실제로 쓰이나 · '배운 것' 문이 살아 있나.
 * 못 도는 것은 이유까지 적는다 — "아직 재료가 모자람" 과 "고장" 은 다르다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { retrieveCompanyKnowledge, renderCompanyKnowledge } = await import("../../src/lib/knowledge/retrieval");
const { genomeFor } = await import("../../src/lib/genesis/predict");
const { BASE_GENOME } = await import("../../src/lib/genesis/genome");
const { kstDate } = await import("../../src/lib/genesis/daily");

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "https://rookery-web-production.up.railway.app";
const db = createServiceClient();
let bad = 0, warn = 0;
const ok = (name: string, good: boolean, detail: unknown = "") => { if (!good) bad++; console.log(good ? "통과" : "고장", name, detail ? `· ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""); };
const note = (name: string, detail: string) => { warn++; console.log("대기", name, `· ${detail}`); };

// ── 1. 매일 실행
const today = kstDate(new Date());
const { data: runs } = await db.from("genesis_runs").select("run_date, status, started_at, finished_at, result").order("run_date", { ascending: false }).limit(3);
const R = (runs ?? []) as { run_date: string; status: string; started_at: string; finished_at: string | null; result: Record<string, unknown> }[];
const latest = R[0];
ok("매일 실행 기록이 있다", !!latest, latest ? `${latest.run_date} ${latest.status}` : "한 번도 안 돎");
if (latest) {
  const ageDays = Math.round((Date.parse(today) - Date.parse(latest.run_date)) / 86400_000);
  ok("어제~오늘 안에 돌았다", ageDays <= 1, `마지막 ${latest.run_date} (오늘 ${today}, ${ageDays}일 전)`);
  ok("마지막 실행이 성공으로 끝났다", latest.status === "done", `${latest.status}${latest.finished_at ? "" : " · 끝나지 않음"}`);

  // 1-b. 영상 배관 점검이 그 안에 있나 (112회차)
  const v = latest.result?.video as { ok?: boolean; error?: string; ffmpeg?: string } | undefined;
  if (!v) note("영상 배관 점검", "마지막 실행에 없음 — 112회차 이후 첫 매일 실행을 아직 안 지남");
  else ok("영상 배관 점검 정상", v.ok === true, `${v.ffmpeg ?? "?"}${v.error ? " · " + v.error : ""}`);

  // 1-c. 회사별 규칙 고리·진화가 실제로 돌았나
  const entries = Object.entries(latest.result ?? {}).filter(([k]) => k !== "video" && k !== "retries") as [string, { rules?: Record<string, unknown>; evolution?: Record<string, unknown> }][];
  ok("회사마다 돌았다", entries.length > 0, `${entries.length}곳`);
  for (const [cid, e] of entries) {
    const { data: co } = await db.from("companies").select("name").eq("id", cid).maybeSingle();
    const r = e.rules as { skipped?: string; error?: string; adopted?: number } | undefined;
    const ev = e.evolution as { adopted?: boolean; reason?: string; source?: string } | undefined;
    if (r?.error) ok(`  규칙 고리 (${co?.name})`, false, r.error);
    else if (r?.skipped) note(`  규칙 고리 (${co?.name})`, r.skipped);
    else console.log(`통과   규칙 고리 (${co?.name}) · 채택 ${r?.adopted ?? 0}개`);
    if (ev?.adopted) console.log(`통과   예측 진화 (${co?.name}) · 채택됨 (${ev.source ?? "?"})`);
    else note(`  예측 진화 (${co?.name})`, `${ev?.reason ?? "안 돎"}${ev?.source ? ` [${ev.source}]` : ""}`);
  }
}

// ── 2. 채택된 규칙이 일 프롬프트까지 닿나 (109·102회차)
const { data: cos } = await db.from("companies").select("id, name");
for (const co of (cos ?? []) as { id: string; name: string | null }[]) {
  const { data: rules } = await db.from("organization_knowledge").select("id, title").eq("company_id", co.id).eq("status", "active").not("learning_candidate_id", "is", null);
  const verified = (rules ?? []) as { id: string; title: string }[];
  if (!verified.length) continue;
  const items = await retrieveCompanyKnowledge(db, co.id);
  const text = renderCompanyKnowledge(items);
  const missing = verified.filter((r) => !items.some((i) => i.id === r.id));
  ok(`검증된 규칙이 일 프롬프트에 닿는다 (${co.name}, ${verified.length}개)`, missing.length === 0, missing.length ? `빠짐: ${missing.map((m) => m.title).join(", ")}` : `${text.length}자`);
}

// ── 3. 진화한 유전자가 실제로 쓰이나 (115·116회차)
for (const co of (cos ?? []) as { id: string; name: string | null }[]) {
  const { data: g } = await db.from("prediction_genomes").select("gene, new_brier, base_brier").eq("company_id", co.id).order("adopted_at", { ascending: false }).limit(1).maybeSingle();
  if (!g) continue;
  const live = await genomeFor(db, co.id);
  const changed = (Object.keys(BASE_GENOME) as (keyof typeof BASE_GENOME)[]).filter((k) => live[k] !== BASE_GENOME[k]);
  ok(`진화한 유전자를 실제로 쓴다 (${co.name})`, changed.length > 0, `${(g as { gene: string }).gene} → 지금 ${changed.map((k) => `${k}=${live[k]}`).join(", ") || "출발값 그대로(적용 안 됨!)"}`);
}

// ── 4. '배운 것' 문이 살아 있나 (109회차)
try {
  const r = await fetch(`${BASE}/api/learning`, { headers: { accept: "application/json" } });
  ok("'배운 것' 문이 살아 있다 (로그인 없이 401)", r.status === 401, `HTTP ${r.status}`);
} catch (e) {
  ok("'배운 것' 문이 살아 있다", false, e instanceof Error ? e.message : String(e));
}

console.log(`\n고장 ${bad} · 대기(재료 모자람 등) ${warn}`);
process.exitCode = bad ? 1 : 0;
