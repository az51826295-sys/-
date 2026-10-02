/**
 * **장르 한마디로 기준이 서나** (228회차 10-02).
 *   npx tsx engine/tools/rookery_env.mts engine/work/ask/참고자.mts ["주문"] [--진짜]
 *
 * 사장님 "사용자가 횡스크롤을 만들겠다 하면 다른 게임을 참고하라는 거지."
 *
 * 재는 것은 "아는 게 많나" 가 아니다. **빠뜨림을 막았나**다:
 *   ① 참고작을 둘 이상 댔나
 *   ② 기준이 8개 이상이고 **숫자가 절반 넘게** 들어갔나
 *   ③ 기준이 **우리 게임에서 확인할 수 있는 말**인가 — 참고작 이름이 기준 문장에 들어가면 안 된다
 *      ('스컬처럼 머리를 교체한다' 는 우리 화면에서 못 잰다)
 *   ④ `안가져올것` 과 `사람이정할것` 을 채웠나
 *   ⑤ 횡스크롤이라면 **당연한 것**을 짚었나 — 코요테 타임·입력 선행·히트스톱·무적 중 둘 이상
 *      (이게 이 기능의 존재 이유다. 이걸 못 짚으면 참고를 안 한 것과 같다.)
 */
import { writeFileSync, mkdirSync } from "node:fs";

const 주문 = process.argv.find((a) => !a.startsWith("-") && !a.endsWith(".mts") && !a.includes("node") && a.length > 6)
  ?? "횡스크롤 액션 게임 만들어 줘";
const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-참고";
mkdirSync(칸, { recursive: true });
console.log(`주문: "${주문}"`);

if (!진짜) { console.log("목(mock)은 이 꼴을 모른다 — 판정을 재려면 --진짜"); process.exit(0); }

type 결과 = {
  장르: string;
  참고작: { 이름: string; 왜: string; 배울것: string[]; 확실한가: string }[];
  당연한것: string[];
  기준: { id: string; when: string; then: string; 왜: string }[];
  안가져올것: string[]; 사람이정할것: string[];
};

const { 참고게임꼴, 참고게임지시문, 참고게임물음 } = await import("../../../src/lib/ask/참고게임");
const { defaultProviders } = await import("../../../src/lib/execution/shared");
const { meterProviders } = await import("../../../src/lib/costs/meter");
const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();
const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
const { ai } = meterProviders(defaultProviders(null), db, { companyId: (co as any).id, purpose: "genre_ref" } as any);
const { output } = await ai.generateStructuredOutput({
  systemInstructions: 참고게임지시문, input: 참고게임물음(주문),
  schema: 참고게임꼴, schemaName: "genre_ref", maxTokens: 16000, tier: "judgment",
});
const r = output as 결과;

console.log(`\n장르: ${r.장르}`);
console.log(`\n참고작:`);
for (const g of r.참고작) {
  console.log(`  · ${g.이름} (${g.확실한가}) — ${g.왜}`);
  for (const b of g.배울것) console.log(`      · ${b}`);
}
console.log(`\n이 장르라면 당연한 것:`); for (const x of r.당연한것) console.log(`  · ${x}`);
console.log(`\n기준 ${r.기준.length}개:`);
for (const c of r.기준) console.log(`  [${c.id}] ${c.when} → ${c.then}\n        (${c.왜})`);
console.log(`\n안 가져올 것:`); for (const x of r.안가져올것) console.log(`  ✗ ${x}`);
console.log(`사장님이 정하실 것:`); for (const x of r.사람이정할것) console.log(`  ? ${x}`);

// ── 자 ──────────────────────────────────────────────────────────
const 이름들 = r.참고작.map((g) => g.이름);
const 기준글 = r.기준.map((c) => `${c.when} ${c.then}`).join(" ");
const 이름샘 = 이름들.filter((n) => n.length > 1 && 기준글.includes(n));
const 숫자있는기준 = r.기준.filter((c) => /\d/.test(`${c.when}${c.then}`)).length;
const 전부 = JSON.stringify(r);
const 당연한말 = ["코요테", "선행 입력", "선입력", "버퍼", "히트스톱", "멈칫", "무적"];
const 짚은것 = 당연한말.filter((w) => 전부.includes(w));

const 잼: [string, boolean, string][] = [
  ["① 참고작을 둘 이상 댔나", r.참고작.length >= 2, `${r.참고작.length}개: ${이름들.join(", ")}`],
  ["② 기준 8개 이상 · 숫자가 절반 넘게", r.기준.length >= 8 && 숫자있는기준 * 2 >= r.기준.length, `${r.기준.length}개 중 숫자 ${숫자있는기준}개`],
  ["③ 기준에 참고작 이름이 안 섞였나", 이름샘.length === 0, 이름샘.length ? `**샜다**: ${이름샘.join(", ")}` : "안 섞임"],
  ["④ 안 가져올 것 · 사람이 정할 것을 채웠나", r.안가져올것.length >= 1 && r.사람이정할것.length >= 1, `${r.안가져올것.length}개 · ${r.사람이정할것.length}개`],
  ["⑤ 장르에서 당연한 것을 둘 이상 짚었나", 짚은것.length >= 2, 짚은것.join("·") || "**하나도 못 짚음**"],
];
console.log();
for (const [이름, ok, 값] of 잼) console.log(`${ok ? "맞음  " : "**어긋남**"} ${이름} — ${값}`);
const 맞음 = 잼.filter((x) => x[1]).length;
console.log(`\n${맞음}/${잼.length}`);
writeFileSync(`${칸}/참고기준.json`, JSON.stringify(r, null, 2));
console.log(`→ ${칸}/참고기준.json`);
if (맞음 < 잼.length) process.exitCode = 1;
