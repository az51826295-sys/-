/** 100회차: 답에 새는 내부 id 를 걷는 자. npx tsx engine/tools/rookery_scrub_probe.mts */
import { scrubCapabilityIds, capabilityCatalogue } from "../../src/lib/chat/routing";
const id = capabilityCatalogue()[0].capabilityId;
const cases: [string, string][] = [
  [`· 앱 만들기 (${id})`, "· 앱 만들기"],
  [`· 앱 만들기（${id}）\n· 다음`, "· 앱 만들기\n· 다음"],
  [`\`${id}\` 로 맡겨요`, " 로 맡겨요"],
  ["가격 (원화) 기준", "가격 (원화) 기준"],
  ["(small_talk_not_an_id) 그대로", "(small_talk_not_an_id) 그대로"],
];
let bad = 0;
for (const [i, want] of cases) { const got = scrubCapabilityIds(i); const ok = got === want; if (!ok) bad++; console.log(ok ? "통과" : "실패", JSON.stringify(i), "→", JSON.stringify(got)); }
console.log(`ids ${capabilityCatalogue().length}개, 실패 ${bad}`); process.exit(bad ? 1 : 0);
