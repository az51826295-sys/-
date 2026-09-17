/**
 * 진화 실행기 (97회차 09-13) — 한 회사에 대해 실제로 유전자 진화를 한 번 돌린다.
 * `rookery_env.mts` 로 감싸서 로키 DB(rookery-main)로 돌린다:
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_evolve.mts <companyId>
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_evolve.mts --all   (모든 회사)
 *
 * 표본(`work_prediction_scores`)이 40건이 안 되면 손 안 대고 이유를 찍는다.
 * 채택되면 `prediction_genomes` 에 한 줄이 남는다 — 무엇을 왜 바꿨는지까지.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runEvolution } = await import("../../src/lib/genesis/evolve");

const arg = process.argv[2];
if (!arg) { console.error("회사 id 또는 --all 이 필요하다"); process.exit(1); }
const db = createServiceClient();

const companyIds = arg === "--all"
  ? ((await db.from("companies").select("id")).data ?? []).map((r) => (r as { id: string }).id)
  : [arg];

for (const companyId of companyIds) {
  const r = await runEvolution(db, companyId);
  if (r.adopted) {
    console.log(`✅ ${companyId.slice(0, 8)} 채택: ${r.gene} · 브라이어 ${r.baseBrier.toFixed(4)} → ${r.newBrier.toFixed(4)} · 판정 ${r.decidedCount}건`);
  } else {
    console.log(`· ${companyId.slice(0, 8)}: ${r.reason}`);
  }
}
