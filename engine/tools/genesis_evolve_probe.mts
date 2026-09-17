/**
 * 진화 자 (97회차 09-13, 사장님 "자가 진화") — DB 없이, 가짜 Supabase로.
 *
 * `08-27`에 이미 있던 것: 예측 커밋(`predict.ts`)과 후보 만들기(`genome.ts`).
 * 없던 것: 후보를 실제로 시험해서 채택하는 코드 — `evolve.ts`가 그 마지막
 * 조각이다. 이 자는 그게 (1) 표본이 적으면 손 안 대고 (2) 기준이 도중에
 * 뒤집히는 세계에서 더 빨리 잊는 유전자를 실제로 골라내고(§9 프로토콜:
 * "같은 문제를 두 번째 만났을 때 더 잘 푸는가") (3) 순수 잡음에는 손대지
 * 않는지 잰다. 모델 호출 없음, 지출 0.
 *
 *   npx tsx engine/tools/genesis_evolve_probe.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }

const { runEvolution, MIN_DECIDED } = await import("../../src/lib/genesis/evolve");

type Row = { skill_id: string; approved: number; basis: { features: string[] }; committed_at: string };

/** rand01(seed) — 결정론적 의사난수. 매번 같은 자 결과가 나와야 한다. */
function mulberry32(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const KEYS = ["skill=draft", "type=manager", "recurring=false", "memory=few"];

function makeRows(n: number, pAt: (i: number) => number, seed: number): Row[] {
  const rnd = mulberry32(seed);
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const approved = rnd() < pAt(i) ? 1 : 0;
    rows.push({ skill_id: "draft", approved, basis: { features: KEYS }, committed_at: new Date(2026, 0, 1, 0, i).toISOString() });
  }
  return rows;
}

/** 진짜 Supabase 클라이언트의 부분 흉내 — evolve.ts / predict.ts 가 쓰는 메서드만. */
function fakeDb(rows: Row[], adoptedGenome: unknown = null) {
  const inserts: Record<string, unknown>[] = [];
  const builder = (table: string) => {
    const state: { order?: [string, boolean]; limit?: number; eq?: [string, unknown] } = {};
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => { state.eq = [col, val]; return api; },
      order: (col: string, opts?: { ascending?: boolean }) => { state.order = [col, opts?.ascending ?? true]; return api; },
      limit: (n: number) => { state.limit = n; return api; },
      maybeSingle: async () => {
        if (table === "prediction_genomes") return { data: adoptedGenome ? { genome: adoptedGenome } : null };
        return { data: null };
      },
      insert: async (obj: Record<string, unknown>) => { inserts.push(obj); return { error: null }; },
      then: (resolve: (v: { data: unknown }) => void) => {
        if (table === "work_prediction_scores") {
          let out = [...rows];
          const asc = state.order?.[1] ?? true;
          out.sort((a, b) => (asc ? 1 : -1) * (a.committed_at < b.committed_at ? -1 : 1));
          if (state.limit) out = out.slice(0, state.limit);
          resolve({ data: out });
        } else resolve({ data: [] });
      },
    };
    return api;
  };
  return { from: builder, __inserts: inserts } as unknown as import("@/lib/execution/shared").Supabase & { __inserts: Record<string, unknown>[] };
}

const lines: [boolean, string][] = [];

// (1) 표본 부족 — 손 안 댐
{
  const db = fakeDb(makeRows(MIN_DECIDED - 5, () => 0.9, 1));
  const r = await runEvolution(db, "company-thin");
  lines.push([r.adopted === false && r.reason.includes("아직 이르다"), `표본 ${MIN_DECIDED - 5}건: ${r.adopted ? "채택함(오류)" : r.reason}`]);
}

// (2) 기준이 도중에 뒤집힘 — 더 빨리 잊는 유전자가 이겨야 한다
{
  const n = 240;
  const rows = makeRows(n, (i) => (i < n / 2 ? 0.9 : 0.2), 2);
  const db = fakeDb(rows);
  const r = await runEvolution(db, "company-shift");
  const gotRecencyDown = r.adopted && r.gene.startsWith("recency") && r.to < r.from;
  lines.push([gotRecencyDown, r.adopted ? `채택: ${r.gene} (기준 브라이어 ${r.baseBrier.toFixed(4)} → ${r.newBrier.toFixed(4)})` : `채택 안 함(오류): ${r.reason}`]);
  lines.push([r.adopted && r.baseBrier > r.newBrier + 0.01, r.adopted ? `개선폭 ${(r.baseBrier - r.newBrier).toFixed(4)} (≥0.01)` : "해당 없음"]);
}

// (3) 순수 잡음 — 기준을 못 이겨야 한다(잡음에 채택하면 그게 더 큰 고장)
{
  const rows = makeRows(240, () => 0.5, 3);
  const db = fakeDb(rows);
  const r = await runEvolution(db, "company-noise");
  lines.push([r.adopted === false, r.adopted ? `잡음에 채택함(오류): ${r.gene}` : `잡음엔 채택 안 함: ${r.reason}`]);
}

// (4) 채택되면 정말로 DB에 한 줄만 쓰는가(ONE_GENE_PER_EXPERIMENT — 후보 여럿을 동시에 안 씀)
{
  const n = 240;
  const rows = makeRows(n, (i) => (i < n / 2 ? 0.9 : 0.2), 2);
  const db = fakeDb(rows);
  await runEvolution(db, "company-shift2");
  lines.push([(db as unknown as { __inserts: unknown[] }).__inserts.length === 1, `저장 행 수 ${(db as unknown as { __inserts: unknown[] }).__inserts.length}개 (=1)`]);
}

for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
