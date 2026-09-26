/**
 * **가지고 있는데 안 쓰는 힘** (226회차 2026-09-26, 사장님 "무료로 쓸 수 있는 것만 자동으로 붙여").
 *
 * 새 열쇠를 사지 않고도 늘릴 수 있는 것부터 센다: 이미 가진 열쇠로 **열려 있는데 한 번도 안 부른** 모델들.
 * 돈 0 · 모델 호출 0 — 목록 문만 읽는다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/idle_power.mts
 */
import { listVendor, idlePower, IN_USE, powerOf, type ModelEntry, type Vendor } from "../../src/lib/providers/modelWatch";

const all: ModelEntry[] = [];
const 한글: Record<string, string> = { video: "영상", music: "음악", image: "그림", voice: "목소리", text: "글" };

for (const v of ["openai", "anthropic", "deepseek", "gemini"] as Vendor[]) {
  const r = await listVendor(v);
  if (!r.ok) { console.log(`${v.padEnd(10)} 못 읽음 — ${r.why}`); continue; }
  console.log(`${v.padEnd(10)} ${r.models.length}개`);
  all.push(...r.models);
}
if (!all.length) { console.log("\n아무 문도 못 읽었다 — 열쇠를 확인할 것."); process.exit(1); }

const { unusedPowers, untried } = idlePower(all, IN_USE);

console.log(`\n=== 지금 쓰는 것 (${IN_USE.length}) ===`);
const byPower = new Map<string, string[]>();
for (const u of IN_USE) { const p = powerOf(u.id); byPower.set(p, [...(byPower.get(p) ?? []), u.id]); }
for (const [p, ids] of byPower) console.log(`  ${(한글[p] ?? p).padEnd(4)} ${ids.join(", ")}`);

const none = Object.entries(unusedPowers);
console.log(`\n=== 통째로 안 쓰는 힘 (${none.length}) ===`);
if (!none.length) console.log("  없음 — 열린 능력은 전부 하나씩은 쓰고 있다.");
for (const [p, ids] of none) console.log(`  **${한글[p] ?? p}** (${ids.length}) — ${ids.slice(0, 8).join(", ")}`);

console.log(`\n=== 안 대 본 후보 ===`);
for (const [p, ids] of Object.entries(untried)) {
  if (p === "text") { console.log(`  ${한글[p]} ${ids.length}개 (글은 많아서 생략 — 자리 겨루기는 seats 가 한다)`); continue; }
  console.log(`  ${한글[p] ?? p} (${ids.length}) — ${ids.slice(0, 8).join(", ")}`);
}
console.log(`\n열쇠는 이미 있다. 새 결제 없이 붙일 수 있는 것들이다 — 부르면 사용량 값은 나간다.`);
