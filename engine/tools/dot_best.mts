/**
 * **여러 판 뽑아 이기는 것을 고른다** (226회차 2026-09-27).
 *
 * 사장님 "아직은 이상해" 를 자로 잡았다: 새로 그린 판의 실루엣 일관성이 **0.909**, 지금 앱에 있는 옛 판이
 * **0.949** — 내가 그린 게 더 못했다. 그림 모델은 같은 주문에도 판마다 다르게 나오므로, 한 판만 뽑아
 * 쓰는 것은 운에 맡기는 것이다. **여러 판 뽑고 자로 고른다** — 고르는 자가 생긴 뒤에야 할 수 있는 일이다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/dot_best.mts <참조png> <나갈폴더> [판수]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ref = process.argv[2], out = process.argv[3], n = Number(process.argv[4] ?? 3);
if (!ref || !out) throw new Error("사용: dot_best.mts <참조png> <나갈폴더> [판수]");

const scores: { dir: string; worst: number; avg: number }[] = [];
for (let i = 1; i <= n; i++) {
  const raw = `${out}-판${i}`, aligned = `${out}-판${i}-정렬`;
  console.log(`\n=== ${i}/${n} 판 ===`);
  execFileSync("npx", ["tsx", "engine/tools/rookery_env.mts", "engine/tools/dot_redraw_same.mts", ref, raw, "--run"], { stdio: "inherit", shell: true, timeout: 600_000 });
  execFileSync("npx", ["tsx", "engine/tools/dot_align.mts", raw, aligned], { stdio: "ignore", shell: true, timeout: 300_000 });
  const outTxt = execFileSync("npx", ["tsx", "engine/tools/dot_shape_check.mts", aligned], { encoding: "utf8", shell: true, timeout: 300_000 });
  const worst = Number(/가장 안 겹치는 짝: .*= ([0-9.]+)/.exec(outTxt)?.[1] ?? 0);
  const avgs = [...outTxt.matchAll(/평균 ([0-9.]+)/g)].map((m) => Number(m[1]));
  const avg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
  console.log(`  일관성: 최저 ${worst.toFixed(3)} · 평균 ${avg.toFixed(3)}`);
  scores.push({ dir: aligned, worst, avg });
}

scores.sort((a, b) => b.worst - a.worst || b.avg - a.avg);
console.log(`\n=== 판 ${n}개 ===`);
for (const s of scores) console.log(`  ${s.dir.split("\\").pop()?.split("/").pop()}  최저 ${s.worst.toFixed(3)} · 평균 ${s.avg.toFixed(3)}`);
const win = scores[0];
console.log(`\n**이긴 판**: ${win.dir} (최저 ${win.worst.toFixed(3)})`);
console.log(`앱에 있는 옛 판은 0.949 였다 — ${win.worst >= 0.949 ? "**이겼다**" : "아직 못 이겼다"}`);
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(win.dir)) fs.copyFileSync(path.join(win.dir, f), path.join(out, f));
console.log(`${out} 에 담았다.`);
