/**
 * **어디까지 판단이고 어디부터 자인가** (155회차 09-16). 돈 0, 모델 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judgment_census.mts
 *
 * 사장님: *"기계가 아니라 인공지능로 가야한다. 재는 게 아니라 판단이다."* · *"계획 만들어, 판단자 ai 만들"*
 *
 * 계획을 감으로 짜지 않으려고 센다. **판단이 정하는 자리**(모델이 자기 말로 고르는 곳)와
 * **자가 정하는 자리**(내가 박아 둔 숫자·표·정규식)를 각각 찾아 나란히 놓는다.
 * 자가 나쁘다는 게 아니다 — 난간은 자여야 한다. 나쁜 것은 **판단이어야 할 자리에 자가 앉아 있는 것**이다.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src", "lib");
async function walk(d: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}
const files = await walk(ROOT);

// 판단이 정하는 자리 = 모델에게 스키마를 주고 고르게 하는 호출
const JUDGE = /generateStructuredOutput\(/g;
// 자가 정하는 자리 = 흐름을 가르는 고정 숫자·표
const RULER = [
  [/if\s*\([^)]*[<>]=?\s*-?\d+(\.\d+)?\s*\)/g, "숫자 문턱"],
  [/\.\s*(test|match)\s*\(/g, "정규식 판별"],
  [/new Set\(\[/g, "고정 목록"],
] as const;

let judge = 0;
const rulers: Record<string, number> = {};
const perFile: { f: string; j: number; r: number }[] = [];
for (const f of files) {
  const t = await readFile(f, "utf8");
  const j = (t.match(JUDGE) ?? []).length;
  let r = 0;
  for (const [re, name] of RULER) { const n = (t.match(re) ?? []).length; r += n; rulers[name] = (rulers[name] ?? 0) + n; }
  judge += j;
  if (j || r > 4) perFile.push({ f: path.relative(ROOT, f), j, r });
}
console.log(`파일 ${files.length}개`);
console.log(`\n**판단이 정하는 자리** (모델에게 물어 고르게 하는 호출): ${judge}곳`);
console.log(`**자가 정하는 자리**: ${Object.entries(rulers).map(([k, v]) => `${k} ${v}`).join(" · ")} = ${Object.values(rulers).reduce((a, b) => a + b, 0)}곳`);
console.log("\n판단이 있는 파일 (판단/자):");
for (const x of perFile.filter((x) => x.j).sort((a, b) => b.j - a.j).slice(0, 14)) console.log(`  ${String(x.j).padStart(2)} / ${String(x.r).padStart(3)}  ${x.f}`);
console.log("\n판단이 하나도 없는데 자가 많은 파일 (여기가 다음 후보다):");
for (const x of perFile.filter((x) => !x.j).sort((a, b) => b.r - a.r).slice(0, 12)) console.log(`   0 / ${String(x.r).padStart(3)}  ${x.f}`);
