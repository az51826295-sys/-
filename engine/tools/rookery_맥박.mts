/**
 * **로키가 지금 살아서 뭘 하고 있나** (10-12). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rookery_맥박.mts [일수=14]
 *
 * 10-12 에 지출을 보니 **최근 7일 $0.01** 이었다 — 거의 아무것도 안 돈 것이다.
 * 그런데 어디가 멈췄는지(배치냐 서버 고리냐 한도냐) 한눈에 보는 자리가 없었다.
 * 그래서 **장부에서 직접 센다.** 짐작하지 않는다.
 */
import { createClient } from "@supabase/supabase-js";

const 일수 = Number(process.argv[2] ?? 14);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const 어제 = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

const 세기 = async (표: string, 칸 = "created_at", 조건?: (q: any) => any) => {
  let q = db.from(표).select("*", { count: "exact", head: true }).gte(칸, 어제(일수));
  if (조건) q = 조건(q);
  const { count, error } = await q;
  return error ? `못 읽음(${error.message.slice(0, 40)})` : count ?? 0;
};

console.log(`최근 ${일수}일 — 로키 맥박\n`);

/* 10-12: 표 이름을 **짐작해서** jobs/artifacts/chat_turns 라 적었더니 전부 "없음" 이 나왔다 —
   없는 게 아니라 그런 표가 없었던 것이다. 코드가 실제로 부르는 이름으로 고쳤다.
   (0 은 "못 본다" 일 수 있다 — 09-27 교훈이 여기서도 그대로다.) */
for (const [이름, 표] of [["업무(assignments)", "assignments"], ["실행(work_executions)", "work_executions"],
                          ["결과물(deliverables)", "deliverables"], ["대화 글(conversation_messages)", "conversation_messages"],
                          ["모델 호출(model_usage)", "model_usage"], ["자가진화(genesis_runs)", "genesis_runs"]] as const) {
  console.log(`  ${이름.padEnd(22)} ${await 세기(표)}`);
}

/* **지갑은 내가 세지 않는다 — 문에게 묻는다.** (10-12)
   날것 30일을 더해 "$28.71 / $14 두 배 넘침 · 막혀 있다" 고 보고했는데, 문은
   **한도 시작점(09-25) 이전을 아예 안 센다.** 진짜 값은 $12.80 · **열려 있음** 이었다.
   사장님과 제미나이가 그 거짓 숫자 위에 "초비상" 계획을 세웠다.
   09-26 에 똑같은 사고를 적어 뒀는데(그때도 "막힘 $57.8" 이 실은 "$0.19 열림") 또 했다 —
   **보고하는 자가 문을 안 부르면 반드시 어긋난다.** 그래서 여기서는 문을 그대로 부른다. */
console.log("\n  지갑 — 문(allowance_look)이 보는 값:");
{
  const { spawnSync } = await import("node:child_process");
  const p = spawnSync("npx", ["tsx", "engine/tools/allowance_look.mts"], { encoding: "utf8", shell: true, env: process.env });
  for (const l of String(p.stdout ?? "").split("\n")) if (l.trim() && !l.includes("[로키 DB]")) console.log(`    ${l.trim()}`);
}

// 마지막으로 **진짜 일**이 언제였나 — 0 건일 때 "언제부터 0 인가"가 다음 질문이다
for (const [이름, 표] of [["업무", "assignments"], ["결과물", "deliverables"], ["대화 글", "conversation_messages"]] as const) {
  const { data } = await db.from(표).select("created_at").order("created_at", { ascending: false }).limit(1);
  const t = data?.[0]?.created_at;
  console.log(`  마지막 ${이름.padEnd(6)} ${t ? `${String(t).slice(0, 16).replace("T", " ")} (${Math.round((Date.now() - new Date(t).getTime()) / 864e5)}일 전)` : "없음"}`);
}
// 모델 호출이 날마다 몇 건인가 — 일은 0 인데 호출이 있으면 **다른 고리**가 돌고 있다는 뜻
const { data: 호출 } = await db.from("model_usage").select("created_at,cost_usd").gte("created_at", 어제(일수));
const 날별 = new Map<string, { 건: number; 값: number }>();
for (const r of 호출 ?? []) {
  const d = String(r.created_at).slice(0, 10);
  const v = 날별.get(d) ?? { 건: 0, 값: 0 };
  v.건++; v.값 += Number(r.cost_usd ?? 0); 날별.set(d, v);
}
console.log("\n  날마다 모델 호출:");
for (const [d, v] of [...날별].sort()) console.log(`    ${d}  ${String(v.건).padStart(4)}건  $${v.값.toFixed(2)}`);

// 서버가 살아 있다고 말하는가
const { data: 심장 } = await db.from("service_heartbeat").select("*").order("updated_at", { ascending: false }).limit(10);
console.log("\n  심장 소리(최근 10):");
for (const h of 심장 ?? []) {
  const 분 = Math.round((Date.now() - new Date(h.updated_at).getTime()) / 60000);
  console.log(`    ${String(h.service ?? h.name ?? "?").padEnd(26)} ${분 < 60 ? `${분}분 전` : `${Math.round(분 / 60)}시간 전`}`);
}
