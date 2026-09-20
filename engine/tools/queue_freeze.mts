/**
 * **대기열을 얼린다 — 순서까지** (203회차 09-21). 사장님 셋:
 *   1. 무게를 섞을 것  2. 일부러 깨지는 과제를 흩어 둘 것(연속 3개 금지)  3. 순서를 고정하고 미리 적어 둘 것
 *
 * `queue_gen.mts` 가 낸 목록은 **가벼운 것부터 몰려** 있다. 그대로 돌리면 상한에 닿을 때까지
 * 가벼운 것만 돌고 무거운 것은 한 번도 안 돌아 — 섞은 의미가 사라진다. 그래서 여기서 **엇갈려 깐다**.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/queue_freeze.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
type W = "가벼움" | "중간" | "무거움";
type Item = { weight: W; title: string; description: string; expectFail?: boolean };
const src = JSON.parse(readFileSync("engine/docs/genesis/unattended-queue-2.json", "utf8")) as { items: Item[] };

// 실측(14일 · 끝난 실행 166판, `queue_cost.mts`): 값 25% $0.056 · 중앙 $0.159 · 75% $0.293 · 95% $0.727
//                                                시간 25% 1.8분 · 중앙 3.0분 · 75% 4.2분 · 95% 8.6분
// 무거운 판은 **아직 돌려 본 적이 없다** — 75~95% 구간을 갖다 쓴 추정이다. 판이 끝나면 실측으로 갈아 낀다.
const EST: Record<W, { usd: number; min: number; 근거: string }> = {
  가벼움: { usd: 0.04, min: 2.5, 근거: "09-20 무인 1회차 8판 실측 $0.028 · 3.4분" },
  중간:   { usd: 0.15, min: 3.5, 근거: "14일 중앙값 $0.159 · 3.0분" },
  무거움: { usd: 0.35, min: 7.0, 근거: "**추정** — 14일 75~95% 구간($0.293~$0.727). 무거운 판은 안 돌려 봤다" },
};
const CAP = 2.0, HOURS = 6;

const want: Record<W, number> = { 가벼움: 28, 중간: 18, 무거움: 12 }; // + 깨지는 것 2 = 60
const pool: Record<W, Item[]> = { 가벼움: [], 중간: [], 무거움: [] };
const broken = src.items.filter((x) => x.expectFail);
for (const x of src.items) if (!x.expectFail && pool[x.weight].length < want[x.weight]) pool[x.weight].push(x);
for (const w of Object.keys(want) as W[]) if (pool[w].length < want[w]) { console.error(`${w} 이 ${pool[w].length}개뿐 — 목록을 다시 내야 한다`); process.exit(1); }

// **엇갈려 깔기**: 각 무게를 제 비율대로 고르게 흩는다(자리 = (k+0.5)/개수).
const spread = ([] as { k: number; it: Item }[]).concat(
  ...(Object.keys(want) as W[]).map((w) => pool[w].map((it, i) => ({ k: (i + 0.5) / want[w], it }))),
).sort((a, b) => a.k - b.k).map((x) => x.it);

// **깨지는 과제 자리**: 상한이 15판쯤에서 닿는다(아래 계산) → 그 **안**에 둬야 실패 경로가 실제로 돈다.
// 6번·12번. 6칸 떨어져 있으니 연속 3개가 될 수 없다(문지기의 '같은 실패 3연속' 은 안 걸린다).
const order: Item[] = [...spread];
order.splice(5, 0, broken[0]);
order.splice(11, 0, broken[1]);

// 이 순서대로 돈다고 할 때 상한에 언제 닿나
let usd = 0, min = 0, capAt = 0;
const marks: { n: number; usd: number; min: number }[] = [];
for (const [i, it] of order.entries()) {
  usd += EST[it.weight].usd; min += EST[it.weight].min;
  if (!capAt && usd >= CAP) capAt = i + 1;
  if ((i + 1) % 15 === 0) marks.push({ n: i + 1, usd, min });
}
const reach = capAt || order.length;
const reachMin = order.slice(0, reach).reduce((a, x) => a + EST[x.weight].min, 0);

const out = {
  version: "unattended-queue-2",
  frozenAt: new Date().toISOString(),
  rule: "20260921-unattended-run-2 (a2f5bea38ff27b4b)",
  note: [
    "무인 판 2 의 **얼린 대기열 — 순서까지 고정**. 무작위로 뽑으면 다음 판과 못 견준다(사장님 09-21).",
    "무게를 엇갈려 깔았다 — 가벼운 것부터 몰아 두면 상한에 닿을 때까지 가벼운 것만 돌아 섞은 의미가 없어진다.",
    "깨지는 과제 둘은 6번·12번. **상한이 닿을 자리 안쪽**에 둬야 실패 경로가 실제로 돌고, 6칸 떨어져 있어 '같은 실패 3연속' 에는 안 걸린다.",
    "실패는 **보장되지 않는다** — 계획 모델이 빈 주문에서도 기준을 지어낼 수 있다. 안 깨지면 '실패 경로는 여전히 안 봤다' 가 결과다.",
  ].join(" "),
  mix: { 가벼움: want.가벼움, 중간: want.중간, 무거움: want.무거움, 깨지는것: broken.length, 합: order.length },
  estimate: {
    단가근거: EST,
    상한: CAP, 계획시간: HOURS,
    "상한에 닿는 자리": `${reach}번째 판 · 약 ${(reachMin / 60).toFixed(1)}시간`,
    "예상 총액(60판 전부)": Number(usd.toFixed(2)),
    "예상 총시간(60판 전부)": `${(min / 60).toFixed(1)}시간`,
    경고: `**$${CAP} 는 6시간을 못 산다.** 이 섞음으로 6시간을 채우려면 약 $${usd.toFixed(2)} 가 든다(하루 상한 $5 보다도 크다). 상한에 닿아 멈추는 것은 잠근 표에서 **성공**이고, 부하 하한도 '판이 돈 시간' 기준이라 통과한다 — 다만 **실제로 시험하는 것은 6시간이 아니라 약 ${(reachMin / 60).toFixed(1)}시간의 부하**다.`,
    구간: marks.map((m) => `${m.n}판 → $${m.usd.toFixed(2)} · ${(m.min / 60).toFixed(1)}시간`),
  },
  items: order.map((x, i) => ({ n: i + 1, ...x, expectFail: !!x.expectFail })),
};
writeFileSync("engine/docs/genesis/unattended-queue-2.json", JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`얼림 ${order.length}개 — ${JSON.stringify(out.mix)}`);
console.log(`상한 $${CAP} 은 ${reach}번째 판(약 ${(reachMin / 60).toFixed(1)}시간)에서 닿는다 · 60판 전부면 $${usd.toFixed(2)} · ${(min / 60).toFixed(1)}시간`);
console.log(out.estimate.구간.join("  |  "));
console.log("\n순서 (앞 20):");
for (const x of out.items.slice(0, 20)) console.log(`  ${String(x.n).padStart(2)} [${x.weight}]${x.expectFail ? "  ⚠실패기대" : ""} ${x.title}`);
