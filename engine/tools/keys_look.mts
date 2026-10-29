/**
 * **열쇠가 살아 있나 · 돈이 없나** — 공급자마다 한 줄 (10-29). 읽기만, 값 0.
 *
 *   npx tsx engine/tools/keys_look.mts
 *
 * ## 왜 만들었나
 *
 * 10-29 에 새 캐릭터를 만들려다 그림이 안 나왔다. 사장님이 물었다 — *"아 돈 없다고?"*
 * 재 보니 셋 중 **둘은 돈이 아니라 키가 틀린 것**이었다(OpenAI 401, Meshy 401).
 * 돈이 없는 것은 fal 하나였고, 앱 본체(DeepSeek)는 멀쩡했다.
 *
 * 그 둘을 섞어 적으면 **사장님이 안 내도 되는 돈을 낸다.** 그래서 이 자는
 * `401 invalid_api_key`(키)와 `402·403·insufficient_quota`(돈)를 **갈라 적는다.**
 * 못 가린 응답은 "모름" 으로 두고 원문을 그대로 보여 준다 — 지어내지 않는다.
 *
 * 일거리를 돌리지 않는다: 목록 호출이나 **일부러 빈 입력**을 보내서, 열쇠가 살았으면
 * 입력 검사(422)에서 막히게 한다. 그래서 이 자를 돌리는 값은 0 이다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}

type 줄 = { 자리: string; 쓰임: string; 상태: string; 까닭: "열림" | "키" | "돈" | "모름" | "열쇠없음"; 본것: string };
const 표: 줄[] = [];

/** 응답 하나를 **키 문제 / 돈 문제 / 열림 / 모름** 으로 가른다. */
function 가르기(status: number, 글: string): 줄["까닭"] {
  if (status === 200 || status === 422) return "열림";                       // 422 = 입력 검사까지 갔다 = 열쇠는 통했다
  // 400 도 **입력** 을 나무라는 글이면 열쇠는 통한 것이다(Tavily 가 "Query is missing" 을 400 으로 준다).
  // 열쇠를 나무라는 400 과 가르려고 글을 본다 — 숫자만으로는 못 가린다.
  if (status === 400 && /missing|required|invalid request|validation|empty/i.test(글) && !/key|token|auth/i.test(글)) return "열림";
  if (/insufficient_quota|exhausted balance|billing|top up|insufficient balance|credit/i.test(글)) return "돈";
  if (status === 402) return "돈";
  if (status === 401 || /invalid[_ ]api[_ ]key|incorrect api key|unauthorized/i.test(글)) return "키";
  if (status === 403) return /balance|quota|billing/i.test(글) ? "돈" : "키";
  return "모름";
}

async function 재기(자리: string, 쓰임: string, 변수: string, 부르기: (key: string) => Promise<Response>) {
  const key = process.env[변수]?.trim();
  if (!key) { 표.push({ 자리, 쓰임, 상태: `${변수} 가 없다`, 까닭: "열쇠없음", 본것: "" }); return; }
  try {
    const r = await 부르기(key);
    const 글 = await r.text().catch(() => "");
    표.push({ 자리, 쓰임, 상태: `HTTP ${r.status}`, 까닭: 가르기(r.status, 글), 본것: 글.replace(/\s+/g, " ").slice(0, 110) });
  } catch (e) {
    표.push({ 자리, 쓰임, 상태: "못 닿음", 까닭: "모름", 본것: e instanceof Error ? e.message : String(e) });
  }
}

await 재기("OpenAI", "그림(캐릭터 시트)·번역", "OPENAI_API_KEY", (k) =>
  fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${k}` } }));
await 재기("Anthropic", "내 자리", "ANTHROPIC_API_KEY", (k) =>
  fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": k, "anthropic-version": "2023-06-01" } }));
await 재기("fal", "3D 넷(Tripo·Rodin·Hunyuan·Trellis)", "FAL_KEY", (k) =>
  fetch("https://queue.fal.run/fal-ai/trellis", { method: "POST", headers: { Authorization: `Key ${k}`, "content-type": "application/json" }, body: "{}" }));
await 재기("Meshy", "3D 본선", "MESHY_API_KEY", (k) =>
  fetch("https://api.meshy.ai/openapi/v1/balance", { headers: { authorization: `Bearer ${k}` } }));
await 재기("Tavily", "검색", "TAVILY_API_KEY", (k) =>
  fetch("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_key: k, query: "" }) }));

/* DeepSeek 은 잔액을 숫자로 주는 유일한 자리다 — 이 저장소의 지갑 함수를 그대로 쓴다. */
{
  const { deepSeekWallet, LOW_USD } = await import("../../src/lib/providers/balance");
  const w = await deepSeekWallet();
  표.unshift({
    자리: "DeepSeek", 쓰임: "두근도트 대화(앱 본체)",
    상태: w.usd === null ? "못 읽음" : `$${w.usd.toFixed(2)}`,
    까닭: w.usd === null ? "모름" : w.available && w.usd >= LOW_USD ? "열림" : w.available ? "돈" : "돈",
    본것: w.note,
  });
}

const 딱지 = { 열림: "✅ 열림", 키: "🔑 **키가 틀렸다(돈 아님)**", 돈: "💸 **돈이 없다**", 모름: "◻︎ 모름", 열쇠없음: "◻︎ 열쇠가 없다" };
console.log();
for (const r of 표) {
  console.log(`${r.자리.padEnd(10)} ${r.상태.padEnd(12)} ${딱지[r.까닭]}`);
  console.log(`${" ".repeat(11)}${r.쓰임}${r.본것 ? `\n${" ".repeat(11)}↳ ${r.본것}` : ""}`);
}
const 돈 = 표.filter((r) => r.까닭 === "돈"), 키 = 표.filter((r) => r.까닭 === "키");
console.log(`\n돈이 없는 곳 ${돈.length}개${돈.length ? ` (${돈.map((r) => r.자리).join(", ")})` : ""} · 키가 틀린 곳 ${키.length}개${키.length ? ` (${키.map((r) => r.자리).join(", ")})` : ""}`);
if (키.length) console.log("키가 틀린 것은 **돈을 내서 풀리지 않는다** — 키를 다시 발급해 .env.local 에 넣는 것이 먼저다.");
