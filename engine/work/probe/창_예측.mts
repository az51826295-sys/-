/**
 * **내일 04시 판이 어떤 숫자를 낼지 미리 적는다** (10-13). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/work/probe/창_예측.mts
 *
 * 워커가 오늘 13시에 올라갔다. 그 전엔 10-01 보다 옛 코드가 돌고 있었고(창 160),
 * 10-01 에 "창을 400 으로 넓혀 채택률 8%→38%" 라고 적은 것은 **제품에 닿은 적이 없었다.**
 *
 * 내일 04시 판이 첫 번째 넓은 창 판이다. **재기 전에 값을 적는다**(09-25 규율) —
 * 나중에 "그럴 줄 알았다" 고 말하지 못하게.
 */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { collectCases } = await import("../../../src/lib/genesis/cases");
const { TRAIN_SHOW } = await import("../../../src/lib/genesis/ruleLoop");
const { isHoldout, ADOPT } = await import("../../../src/lib/genesis/ruleStats");

const 회사 = process.argv[2] ?? "5925c03a-557f-46d7-8589-7388b769df40";
const cs = await collectCases(db as never, 회사, { limit: 400, ai: null });
const train = cs.filter((c) => !isHoldout(c.id) || c.source === "execution")
  .sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, TRAIN_SHOW);
const holdout = cs.filter((c) => isHoldout(c.id) && c.source !== "execution");
const 보류나쁜 = holdout.filter((c) => c.bad).length;
const 보류좋은 = holdout.length - 보류나쁜;

console.log(` 지금 로키 DB 에서 센 것 — total ${cs.length} · train ${train.length} · holdout ${holdout.length}`);
console.log(`   보류분: 실패 ${보류나쁜} · 성공 ${보류좋은} (문턱 각 ${ADOPT.minBadHoldout}·${ADOPT.minOkHoldout})`);
console.log(`   제안용 실패 ${train.filter((c) => c.bad).length}건 (문턱 2)`);
console.log("");
console.log(" **10-14 04시 판 예측** (지금 적는다)");
console.log(`   · total ${cs.length} 이상 (하루치가 더해지니 더 클 수 있다)`);
console.log(`   · train ${TRAIN_SHOW} (상한에 닿는다 — 14일 내내 108 이었다)`);
console.log(`   · holdout ${holdout.length} 쯤 (14일 내내 52 였다)`);
console.log(`   · 사례 부족으로 "건너뜀" 은 안 나온다`);
console.log(`   · 보류(pending) 가 처음으로 생긴다 — 못 잰 것을 기각 대신 보류로 두는 코드도 오늘 올라갔다`);
console.log("");
console.log(" 틀리면 그것이 답이다. 확인: npx tsx engine/tools/rookery_env.mts engine/work/probe/고리_돌았나.mts");
