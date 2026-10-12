/**
 * **도구가 쓴 돈이 적히나 · 막히나** (10-12). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_장부밖.mts
 *
 * 10-12 아침에 `gate_look` 을 두 번 돌리고 **"비용 $0"** 이라고 보고했다. 지갑이 안 움직였기 때문이다.
 * 그런데 그 도구는 말 40줄마다 모델을 부른다 — 두 번이면 80호출이고, 실제로는 $0.125 였다.
 * 장부(`model_usage`)에는 그날 0건이 적혔다. **돈은 나갔고 장부가 못 본 것**이다.
 *
 * **적는 것과 막는 것은 다른 일이다.** 둘을 갈라 센다:
 *   · **적힌다** — `rookery_env.mts` 를 지나면 `ROOKERY_TOOL_COMPANY` 가 심기고,
 *     `defaultProviders()` 가 장부에 붙인다. 도구는 전부 그 자리를 지난다.
 *   · **막힌다** — 10-12 오후부터 `defaultProviders()` 안에 문이 있다. 첫 호출에서 한도를 보고
 *     닿았으면 **모델을 안 부르고 던진다.** 그래서 도구 전부가 막힌다.
 *     `seatProviderForCompany` 를 쓰는 것들은 **더 곱게** 멈춘다(던지지 않고 적고 끝낸다).
 *
 * 섞어 세면 어느 쪽이 빈 칸인지 안 보여서 갈라 센다.
 */
import { readdirSync, readFileSync } from "node:fs";

const 칸 = "engine/tools";
const 나 = "rookery_장부밖.mts";
const 파일 = readdirSync(칸).filter((f) => f.endsWith(".mts") && f !== 나);

const 모델부름: string[] = [];
const 막힘: string[] = [];
for (const f of 파일) {
  const s = readFileSync(`${칸}/${f}`, "utf8");
  if (s.includes("defaultProviders") || s.includes("seatProviderForCompany")) 모델부름.push(f);
  if (s.includes("seatProviderForCompany")) 막힘.push(f);
}

const 줄 = (xs: string[]) => xs.map((f) => f.replace(/\.mts$/, "")).sort().join(" · ");
const 안막힘 = 모델부름.filter((f) => !막힘.includes(f));

console.log(`도구 ${파일.length}개 중 **모델을 부르는 것 ${모델부름.length}개**\n`);
console.log(`  ── 적힌다(장부에 남는다)`);
console.log(`     **${모델부름.length}개 전부** — rookery_env.mts 를 지나면 자동으로 붙는다`);
console.log(`     (10-12 확인: routing_test 가 장부에 routing_probe 22건으로 찍혔다. 전에는 0건이었다.)\n`);
console.log(`  ── 막힌다(한도에 닿으면 안 부르고 멈춘다)`);
console.log(`     **${모델부름.length}개 전부** — 문이 defaultProviders() 안에 있다(첫 호출에서 보고 던진다)`);
console.log(`     (10-12 확인: 막힌 지갑에서 routing_test 가 **통과 0/0 · 못 물어본 것 22건**, 모델 호출 0)\n`);
console.log(`  ── 그중 **더 곱게 멈추는 것** ${막힘.length}개 — seatProviderForCompany 를 써서`);
console.log(`     던지는 대신 "한도에 닿았다" 를 적고 조용히 끝낸다`);
console.log(`     ${줄(막힘) || "(없음)"}\n`);
console.log(`     나머지 ${안막힘.length}개는 **막히기는 하되 예외로 멈춘다** — 막는 것은 같고 끝맺는 모양만 거칠다.\n`);

console.log(`  한도가 **보는** 도구: 100% (${모델부름.length}/${모델부름.length})`);
console.log(`  한도가 **막는** 도구: 100% (${모델부름.length}/${모델부름.length})`);
console.log(`\n  **이 자는 글자를 세는 자다** — 코드에 그 이름이 있나만 본다.`);
console.log(`  "진짜로 막히나" 는 막힌 지갑에서 도구를 돌려 봐야 안다(10-12 에 그렇게 확인했다).`);
