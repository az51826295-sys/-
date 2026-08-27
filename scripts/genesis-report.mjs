// Genesis 계기판 — 예측이 실제로 나아지고 있는가. 읽기만 하므로 비용 0.
//
//   node scripts/genesis-report.mjs
//
// 주장이 아니라 숫자로 본다. 세 가지만 본다:
//   · 캘리브레이션 — 0.7이라 말한 것 중 실제로 70%가 승인됐는가
//   · Brier 추세   — 예측이 나아지고 있는가
//   · LP           — 나아지는 **속도**. 0이면 배울 게 없거나 못 배우는 중
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);

const { data, error } = await db
  .from("work_prediction_scores")
  .select("p_approved, approved, brier, skill_id, basis, committed_at")
  .order("committed_at", { ascending: true });

if (error) {
  console.error(error.message);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log("\n채점된 예측이 아직 없습니다.");
  console.log("예측은 실행 시작 시 기록되고, 매니저가 검토한 뒤에 채점됩니다.\n");
  process.exit(0);
}

const rows = data.map((r) => ({ ...r, p: Number(r.p_approved), brier: Number(r.brier) }));
const pct = (x) => (x * 100).toFixed(1).padStart(5) + "%";

console.log(`\n채점된 예측 ${rows.length}건\n`);

// ── 구간별 추세 ──────────────────────────────────────────────────
const WINDOW = Math.max(5, Math.floor(rows.length / 4));
console.log("── 추세 ─────────────────────────────────────────────");
console.log("   구간        승인률    Brier      LP");

let prevBrier = null;
for (let start = 0; start + WINDOW <= rows.length; start += WINDOW) {
  const slice = rows.slice(start, start + WINDOW);
  const approval = slice.filter((r) => r.approved === 1).length / slice.length;
  const brier = slice.reduce((s, r) => s + r.brier, 0) / slice.length;
  // 오차의 크기가 아니라 하강 속도. 이것이 0이면 다 배웠거나,
  // 더 배울 수 없는 것(환경 잡음) 앞에 서 있거나 — 어느 쪽이든
  // 여기 비용을 더 쓰지 말라는 신호는 같다.
  const lp = prevBrier === null ? 0 : ((prevBrier - brier) / slice.length) * 100;
  console.log(
    `   ${String(start + 1).padStart(4)}-${String(start + WINDOW).padEnd(5)}` +
      ` ${pct(approval)}  ${brier.toFixed(4)}  ${lp >= 0 ? " " : ""}${lp.toFixed(3).padStart(7)}`,
  );
  prevBrier = brier;
}

// ── 캘리브레이션 ─────────────────────────────────────────────────
console.log("\n── 캘리브레이션 ─────────────────────────────────────");
console.log("   예측대     건수    예측   실제    차이");
const BUCKETS = 5;
for (let i = 0; i < BUCKETS; i++) {
  const lo = i / BUCKETS;
  const hi = (i + 1) / BUCKETS;
  const bucket = rows.filter((r) => r.p >= lo && (r.p < hi || (i === BUCKETS - 1 && r.p <= hi)));
  if (bucket.length === 0) continue;
  const predicted = bucket.reduce((s, r) => s + r.p, 0) / bucket.length;
  const actual = bucket.filter((r) => r.approved === 1).length / bucket.length;
  const gap = predicted - actual;
  console.log(
    `   ${lo.toFixed(1)}–${hi.toFixed(1)}  ${String(bucket.length).padStart(6)}` +
      `  ${predicted.toFixed(2)}  ${actual.toFixed(2)}  ${(gap >= 0 ? "+" : "") + gap.toFixed(2)}`,
  );
}

// ── 가장 약한 고리 ───────────────────────────────────────────────
//
// 예측이 낮게 나올 때 무엇이 발목을 잡았는가. 이게 다음에 개선할
// 곳의 후보다.
const weakest = new Map();
for (const r of rows) {
  const w = r.basis?.weakest;
  if (!w) continue;
  const c = weakest.get(w) ?? { n: 0, ok: 0 };
  c.n += 1;
  if (r.approved === 1) c.ok += 1;
  weakest.set(w, c);
}

if (weakest.size > 0) {
  console.log("\n── 예측을 끌어내린 조건 ─────────────────────────────");
  const sorted = [...weakest.entries()]
    .filter(([, c]) => c.n >= 3)
    .sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)
    .slice(0, 6);
  for (const [key, c] of sorted) {
    console.log(`   ${key.padEnd(34)} 실제 승인률 ${pct(c.ok / c.n)} (${c.n}건)`);
  }
}

const overall = rows.reduce((s, r) => s + r.brier, 0) / rows.length;
const base = rows.filter((r) => r.approved === 1).length / rows.length;
// 항상 전체 승인률을 답하는 상수 예측기. 이걸 못 이기면 예측은
// 아무것도 하고 있지 않은 것이다.
const baseline = rows.reduce((s, r) => s + (base - r.approved) ** 2, 0) / rows.length;

console.log("\n── 기준선 대비 ──────────────────────────────────────");
console.log(`   Genesis 예측        Brier ${overall.toFixed(4)}`);
console.log(`   상수 예측기(${(base * 100).toFixed(0)}%)   Brier ${baseline.toFixed(4)}`);
console.log(
  overall < baseline
    ? `   → 예측이 상수 기준선을 이기고 있습니다.\n`
    : `   → 아직 상수 기준선을 못 이깁니다. 근거가 더 쌓여야 합니다.\n`,
);
