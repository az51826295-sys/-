/**
 * **머리가 판단하는가** (161회차 2026-09-17). 돈: 판단 호출 3번.
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/rookery_env.mts engine/tools/head_probe.mts
 *
 * 사장님 "판단자 ai 만들자" · "기계가 아닌 AI 여야 돼". 판별법은 어제와 같다:
 * ① 같은 코드에서 일마다 다른 답이 나오는가(자리·기계·재료) ② 사장님이 보는 한 줄에 내부 이름이 없는가 ③ 잰 값을 근거로 말하는가.
 */
const { headFacts, decide, decisionLines } = await import("../../src/lib/genesis/head");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { createServiceClient } = await import("../../src/lib/supabase/service");
if (process.env.GENESIS_SPEND !== "i-approve") { console.error("돈이 든다. GENESIS_SPEND=i-approve 로."); process.exit(1); }
const db = createServiceClient(); const CO = "5925c03a-557f-46d7-8589-7388b769df40";
let bad = 0; const check = (n: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(got)); };
const t0 = Date.now();
const facts = await headFacts(db, CO);
console.log(`── 머리가 보는 사실(${facts.length}자, ${((Date.now() - t0) / 1000).toFixed(0)}초):\n` + facts.split("\n").slice(0, 6).join("\n") + "\n  …");
const ORDERS: [string, string][] = [
  ["영상", "로키 15초 광고 만들어 줘. 처음 보는 사람이 3초 안에 멈추게."],
  ["게임", "Godot 로 2D 도트 탑다운 마을 게임(대화 NPC 셋) 만들어서 내 노트북에서 바로 돌려 봐."],
  ["잔손질", "저번 문서 오타 두 개만 고쳐 줘. 3쪽 '되요'→'돼요', 5쪽 '몇일'→'며칠'."],
];
const got: { kind: string; place: string; machine: string; materials: string; show: string; by: string; sec: number }[] = [];
for (const [kind, order] of ORDERS) {
  const t1 = Date.now();
  const d = await decide(defaultProviders().ai, { order, kind, facts });
  got.push({ kind, place: d.placement.place, machine: d.machine, materials: d.materials, show: d.showToPerson, by: d.decidedBy, sec: (Date.now() - t1) / 1000 });
  console.log(`\n[${kind}] (${d.decidedBy}, ${((Date.now() - t1) / 1000).toFixed(0)}초)\n` + decisionLines(d).join("\n"));
}
check("\n① 일마다 다른 자리·기계·재료가 나온다(=자가 아니다)", new Set(got.map((g) => `${g.place}|${g.machine}|${g.materials}`)).size >= 2, got.map((g) => [g.place, g.machine]));
check("② 사장님이 보는 한 줄이 있고 내부 이름이 없다", got.every((g) => g.show.length > 10 && !/gpt-|deepseek|sora-|app_build|mesh_assets|video_make/i.test(g.show)), got.map((g) => g.show.slice(0, 60)));
check("③ 게임 일은 잰 노트북을 기계로 잡는다", /LAPTOP/i.test(got[1].machine), got[1].machine);
check("④ 광고는 글자만으로 안 된다고 본다", !/글자면 된다/.test(got[0].materials), got[0].materials);
console.log(bad ? `\n${bad}건 실패` : "\n전부 통과");
