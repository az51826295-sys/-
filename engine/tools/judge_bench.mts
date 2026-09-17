/**
 * 심판자 심판대 (132회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judge_bench.mts [--dry]
 *
 * 사장님: "재는 자는 의미없다. 재는자 대신 심판자 ai를 만들어라."
 *
 * 얼린 다섯 판은 `engine/docs/judge-bench-vision-2026-09-16.md` 에 있다 — **돌리기 전에** 적었다.
 * 정답은 내가 만든 라벨이 아니라 **사장님이 화면을 보고 대화창에 친 말**이다.
 * 기계 자의 성적은 2/5. 합격선은 4/5 이고, 만점을 받고도 퇴짜 맞은 1·2 번을 **둘 다** 잡아야 한다.
 *
 * `--dry`: 모델을 안 부르고 재료만 확인한다(돈 0).
 */
const DRY = process.argv.includes("--dry");

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { judgeWork, judgeLine } = await import("../../src/lib/genesis/judge");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const ai = defaultProviders().ai;

type Row = { id: string; at: string; truth: "통과" | "실패"; said: string; machine: "PASS" | "FAIL"; machineLine: string };

/** 얼린 심판대. 이 표는 숫자를 보기 전에 적혔다 — 결과를 보고 고치지 않는다. */
const BENCH: Row[] = [
  { id: "7e962317", at: "09-08 03:56", truth: "실패", said: "이번엔 투구가 점처럼 작아졌어", machine: "PASS", machineLine: "통과 10 · 실패 0 (만점)" },
  { id: "5711714d", at: "09-08 09:56", truth: "실패", said: "투구 크기 개판인데 (네 번)", machine: "PASS", machineLine: "통과 14 · 실패 0 (만점)" },
  { id: "f57142e9", at: "09-08 01:58", truth: "실패", said: "투구가 너무 커", machine: "FAIL", machineLine: "통과 9 · 실패 1" },
  { id: "4ace443c", at: "09-08 23:25", truth: "통과", said: "동작은 그대로 두고 파일만 쪼개 줘", machine: "PASS", machineLine: "통과 18 · 실패 0" },
  { id: "12e0674e", at: "09-08 07:30", truth: "통과", said: "Vox, 기준 맨몸 하나 만들어 줘 (불평 없이 다음 일로)", machine: "FAIL", machineLine: "통과 12 · 실패 1" },
];

const db = createServiceClient();

// uuid 는 `like 'prefix%'` 로 못 고른다(타입이 다르다 — 09-15 에도 여기서 한 번 걸렸다). 다 받아서 코드에서 맞춘다.
const { data: allDels } = await db.from("deliverables").select("id, title, work_execution_id").limit(2000);
const ALL = (allDels ?? []) as { id: string; title: string; work_execution_id: string | null }[];

async function materials(prefix: string) {
  const del = ALL.find((d) => d.id.startsWith(prefix));
  if (!del) return null;
  let order = del.title ?? "";
  if (del.work_execution_id) {
    const { data: ex } = await db.from("work_executions").select("assignment_id").eq("id", del.work_execution_id).maybeSingle();
    const aid = (ex as { assignment_id?: string } | null)?.assignment_id;
    if (aid) {
      const { data: a } = await db.from("assignments").select("title, description, expected_outcome").eq("id", aid).maybeSingle();
      const A = a as { title?: string; description?: string; expected_outcome?: string } | null;
      if (A) order = [A.title, A.description, A.expected_outcome].filter(Boolean).join("\n");
    }
  }
  const { data: files } = await db.from("deliverable_files").select("title, storage_path, mime_type")
    .eq("deliverable_id", del.id).eq("mime_type", "image/png").order("created_at", { ascending: true });
  const images: { label: string; b64: string }[] = [];
  for (const f of (files ?? []) as { title: string; storage_path: string }[]) {
    const { data: blob, error } = await db.storage.from("deliverable-files").download(f.storage_path);
    if (error || !blob) { console.log(`    (못 받음 ${f.title}: ${error?.message})`); continue; }
    images.push({ label: f.title, b64: Buffer.from(await blob.arrayBuffer()).toString("base64") });
  }
  return { order, images };
}

let right = 0, wrong = 0, unseen = 0, inTok = 0, outTok = 0;
const ranKey = new Set<string>(); // 핵심 두 판을 실제로 판정했는가 — 못 돌린 것을 "잡았다"고 세면 안 된다
const missed: string[] = [];

for (const b of BENCH) {
  console.log(`\n── ${b.id} (${b.at}) · 기계 ${b.machineLine} → ${b.machine}`);
  console.log(`   정답(사장님): ${b.truth} — "${b.said}"`);
  const m = await materials(b.id);
  if (!m) { console.log("   재료 없음 — 건너뜀"); continue; }
  console.log(`   사진 ${m.images.length}장 (${m.images.map((i) => i.label).join(", ")}) · 주문 ${m.order.length}자`);
  if (DRY || !m.images.length) continue;  let v;
  try { const r = await judgeWork(ai, { order: m.order, kind: "유니티 씬 (게임 화면 사진)", images: m.images }); v = r.verdict; inTok += r.inputTokens; outTok += r.outputTokens; }
  catch (e) { console.log(`   심판자 오류: ${(e as Error).message}`); continue; }

  console.log(`   본 것: ${v.seen.slice(0, 200)}`);
  console.log(`   ${judgeLine(v)} (믿음 ${v.confidence})`);
  for (const f of v.faults) console.log(`     · [${f.severity}] ${f.what} — ${f.where}`);
  for (const p of v.prescriptions) console.log(`     처방 ${p.spot}: ${p.use} (${p.source ?? "출처 없음"})`);

  if (v.verdict === "못 봤다") { unseen++; console.log("   → 못 봤다 (오답 아님, 미측정)"); continue; }
  const said = v.verdict === "통과" ? "통과" : "실패";
  if (b.id === "7e962317" || b.id === "5711714d") ranKey.add(b.id);
  if (said === b.truth) { right++; console.log("   → 맞음"); }
  else { wrong++; missed.push(b.id); console.log(`   → **틀림** (심판자 ${said}, 정답 ${b.truth})`); }
}

const n = right + wrong;
console.log(`\n══ 심판자 ${right}/${n}${unseen ? ` · 못 봤다 ${unseen}` : ""} · 기계 자 2/5`);
const caughtKey = ranKey.size === 2 && !missed.includes("7e962317") && !missed.includes("5711714d");
console.log(`   만점 받고 퇴짜 맞은 두 판(7e962317·5711714d): ${caughtKey ? "둘 다 잡음" : "놓침 — 점수와 무관하게 채택 안 함"}`);
console.log(`   합격선 4/5 + 그 둘: ${right >= 4 && caughtKey ? "**통과**" : "미달"}`);
if (!DRY) console.log(`   토큰 들어간 ${inTok.toLocaleString()} · 나온 ${outTok.toLocaleString()}`);
