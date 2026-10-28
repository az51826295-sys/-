/**
 * **앱이 부르는 DB 함수가 다 있나** (10-28 사장님 "크레딧없는데 선물줄 수 있는거").
 *   npx tsx engine/tools/dot_rpc_check.mts
 *
 * 10-24 이사는 **표를 옮겼다.** 함수도 따라왔는지는 아무도 안 봤다. 함수가 없으면
 * 코드는 그 자리에서 조용히 다른 길로 가고, **돈 세는 자리**가 통째로 빠질 수 있다.
 *
 * ## 자가 한 번 틀렸다
 *
 * 처음에 **인자 없이** 불러 보고 일곱 개가 전부 "없음" 이라고 적었다. PostgREST 는
 * 인자 이름까지 보고 함수를 고르기 때문에, 인자를 안 주면 **있는 함수도 없다고 나온다.**
 * 대화가 멀쩡히 되는 것을 보고 자를 의심했다([[planted-fault-must-be-well-formed]]).
 * 그래서 여기서는 **진짜 인자 이름**으로 부른다.
 *
 * 있는지만 본다 — 없는 사람 id 로 부르므로 아무것도 안 바뀐다.
 */
import { readFileSync } from "node:fs";
const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
const URL_ = vars.NEXT_PUBLIC_SUPABASE_URL;
const KEY = vars.SUPABASE_SECRET_KEY;
const H = { apikey: KEY, authorization: "Bearer " + KEY, "content-type": "application/json" };

const 없는사람 = "00000000-0000-0000-0000-000000000000";
const 오늘 = new Date().toISOString().slice(0, 10);

/** 앱이 실제로 쓰는 인자 이름 그대로. 다르면 자가 거짓말을 한다. */
const 부를것: [string, Record<string, unknown>][] = [
  ["dot_take_turn", { p_user: 없는사람, p_day: 오늘, p_limit: 15 }],
  ["dot_give_back_turn", { p_user: 없는사람, p_day: 오늘, p_limit: 15 }],
  ["dot_spend_credits", { p_user: 없는사람, p_amount: 1, p_sku: "probe" }],
  ["dot_grant", { p_user: 없는사람, p_sku: "probe", p_credits: 0, p_menhera_days: 0, p_source: "probe", p_ref: null }],
  /* 10-28: 처음엔 p_max·p_turns 를 빼고 불러서 "없음" 으로 적었다 — **두 번째 거짓 경보**다.
     인자 목록은 짐작하지 말고 부르는 쪽(src/app/api/dot/ad/route.ts)에서 베껴 온다. */
  ["dot_ad_refill", { p_user: 없는사람, p_day: 오늘, p_max: 3, p_turns: 5 }],
  ["dot_add_tokens", { p_user: 없는사람, p_day: 오늘, p_in: 0, p_out: 0 }],
  ["dot_like_post", { p_post: -1, p_user: 없는사람 }],
];

let 없음 = 0, 모름 = 0;
console.log("함수                     있나");
for (const [f, args] of 부를것) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${f}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  const t = await r.text();
  /* PGRST202 = 그런 이름·인자의 함수가 없다. 다른 오류는 **있는데 거절한 것**이라 있음이다. */
  const 그런함수없음 = t.includes("PGRST202");
  /* 인자 이름이 틀렸을 때도 같은 코드가 나온다 — 그래서 쪽글을 같이 적는다.
     "없다" 와 "내가 잘못 불렀다" 를 사람이 가를 수 있어야 한다. */
  if (그런함수없음) { 없음++; console.log(`${f.padEnd(24)} **없음**  ${t.replace(/\s+/g, " ").slice(0, 100)}`); }
  else if (!r.ok && !t.includes("violates") && !t.includes("foreign key") && r.status >= 500) { 모름++; console.log(`${f.padEnd(24)} 못 잼   ${r.status}`); }
  else console.log(`${f.padEnd(24)} 있음 (${r.status})`);
}
console.log(`\n**없는 함수 ${없음}개**` + (모름 ? ` · 못 잰 것 ${모름}개` : ""));
process.exit(없음 === 0 ? 0 : 1);
