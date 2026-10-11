/**
 * **장부를 안 거치고 모델을 부르는 도구를 센다** (10-12). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_장부밖.mts
 *
 * 10-12 에 `gate_look.mts` 를 두 번 돌리고 **"비용 $0"** 이라고 보고했다.
 * 지갑이 안 움직였기 때문이다. 그런데 그 도구는 사장님 말 40줄마다 모델을 부른다 —
 * 두 번이면 **80호출**이다. 장부(`model_usage`)에는 그날 **0건**이 적혔다.
 *
 * 까닭: 길이 둘인데 **하나만 장부를 거친다.**
 *   · `seatProviderForCompany(...)` → meterProviders + 한도 검사 → **적히고 막힌다**
 *   · `defaultProviders()`          → 그냥 모델 → **안 적히고 안 막힌다**
 *
 * 그래서 "$21/30일 안전장치" 는 **서버 길과 도구 셋**만 덮는다.
 * 안 보이는 지출은 줄일 수도, 막을 수도 없다 — 그러니 **몇 개가 밖에 있는지라도 센다.**
 */
import { readdirSync, readFileSync } from "node:fs";

const 칸 = "engine/tools";
const 파일 = readdirSync(칸).filter((f) => f.endsWith(".mts"));
const 밖: string[] = [];
const 안: string[] = [];
const 둘다: string[] = [];
for (const f of 파일) {
  const s = readFileSync(`${칸}/${f}`, "utf8");
  /* 10-12: 이 자가 **자기 자신을 "둘 다 쓰는 것"으로 셌다** — 위 설명 글에 두 이름이
     다 적혀 있기 때문이다. 세는 자가 제 글에 걸리면 숫자가 한 칸씩 틀어진다. 자기는 뺀다. */
  if (f === "rookery_장부밖.mts") continue;
  const 장부밖 = s.includes("defaultProviders");
  const 장부안 = s.includes("seatProviderForCompany");
  if (장부밖 && 장부안) 둘다.push(f);
  else if (장부밖) 밖.push(f);
  else if (장부안) 안.push(f);
}

const 줄 = (xs: string[]) => xs.map((f) => f.replace(/\.mts$/, "")).sort().join(" · ");
console.log(`도구 ${파일.length}개 중 모델을 부르는 것 ${밖.length + 안.length + 둘다.length}개\n`);
console.log(`  **장부 밖** ${밖.length}개 — 적히지 않고, 한도가 못 막는다`);
console.log(`     ${줄(밖)}\n`);
console.log(`  장부 안 ${안.length}개 — 적히고 한도에 걸린다`);
console.log(`     ${줄(안) || "(없음)"}\n`);
if (둘다.length) console.log(`  둘 다 쓰는 것 ${둘다.length}개 — 길이 섞여 있다: ${줄(둘다)}\n`);

/* **숫자 하나로 남긴다.** 이 값이 줄지 않으면 한도는 반쪽이다. */
const 덮은비율 = ((안.length + 둘다.length) / Math.max(1, 밖.length + 안.length + 둘다.length)) * 100;
console.log(`  한도가 덮는 도구: **${덮은비율.toFixed(0)}%** (${안.length + 둘다.length}/${밖.length + 안.length + 둘다.length})`);
console.log(`\n  이 자는 **고치지 않는다 — 센다.** 36개를 한꺼번에 바꾸는 것은 닿는 범위가 넓어`);
console.log(`  사장님이 정할 일이다(10-11 "규칙이 닿는 범위를 먼저 센다").`);
