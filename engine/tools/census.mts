/**
 * **산출 결산** (204회차 09-21). 임시 스크립트로 손으로 세다가 하루에 세 번 합이 안 맞았다.
 * 그래서 **표마다 합계 줄을 찍고 분모와 같은지 기계가 확인**한다(사장님 규칙).
 *
 * 그리고 채점표 안에만 있던 "못 잼" 을 **전체 결산에도** 찍는다 — 어젯밤 여섯 판은 고치는 판이
 * 아니라 채점표 범위 밖이어서 그 줄엔 안 잡혔다. 같은 판이 또 나오면 여기서 잡힌다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/census.mts
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { assertComplete } = await import("../../src/lib/db/readAll");
const db = createServiceClient();
const WEB_FROM = "2026-09-17"; // 웹으로 겨냥을 바꾼 날. 그 전 결과물은 유니티가 맞다.
const DOC = /조사|설계|설명|요구사항/;  // 게임이 아닌 문서 — 분류 어긋남 후보
// **일부러 깨뜨린 과제**는 진짜 작업도 고장도 아니다 — 얼린 대기열에서 제목을 가져온다(사장님 09-21).
const { readFileSync } = await import("node:fs");
const PLANTED = new Set<string>((() => {
  try { const q = JSON.parse(readFileSync("engine/docs/genesis/unattended-queue-2.json", "utf8")) as { items: { title: string; expectFail?: boolean }[] };
    return q.items.filter((x) => x.expectFail).map((x) => x.title.replace(/^\[[^\]]+\]\s*/, "")); } catch { return []; }
})());
const isPlanted = (t: string) => [...PLANTED].some((p) => t.includes(p)) || /아무것도 없는 빈 유니티/.test(t);

const { data } = await db.from("deliverables").select("id, title, created_at, assignment_id, content_json").eq("deliverable_type", "app_build");
// **다 읽었는지 기계가 본다**(09-22). 1000줄에서 잘린 채 더하면 결산이 조용히 틀린다.
await assertComplete(db, "deliverables", (data ?? []).length);
// 심은 과제 표시는 **업무의 칸**에서 읽는다. 그 칸이 생기기 전에 들어간 둘은 제목으로 뒤를 받친다.
const { data: asgs } = await db.from("assignments").select("id, role_input_json");
const plantedIds = new Set((asgs ?? []).filter((a) => (a.role_input_json as { planted?: boolean } | null)?.planted).map((a) => a.id as string));
type R = { id: string; title: string; day: string; at: string; html: boolean; engine: string; loop: boolean; rounds: number; doc: boolean; planted: boolean };
const R: R[] = (data ?? []).map((a) => {
  const cj = a.content_json as Record<string, unknown> | null;
  const files = ((cj?.files ?? []) as { path?: string }[]);
  const loop = cj?.loop as { rounds?: unknown[] } | null;
  return { id: String(a.id), title: String(a.title), day: String(a.created_at).slice(0, 10), at: String(a.created_at).slice(5, 16),
    html: files.some((f) => /\.html?$/i.test(String(f.path))), engine: String((cj?.stage as { engine?: string } | null)?.engine ?? cj?.target ?? "(없음)"),
    loop: !!loop, rounds: loop?.rounds?.length ?? 0, doc: DOC.test(String(a.title)), planted: plantedIds.has(String(a.assignment_id)) || isPlanted(String(a.title)) };
});
const web = R.filter((r) => r.day >= WEB_FROM), uni = R.filter((r) => r.day < WEB_FROM);

function table(name: string, rows: R[], buckets: [string, (r: R) => boolean][]) {
  console.log(`\n[${name}] 분모 ${rows.length}`);
  let sum = 0;
  for (const [label, f] of buckets) { const c = rows.filter(f).length; sum += c; console.log(`  ${label.padEnd(32)}${String(c).padStart(4)}`); }
  const ok = sum === rows.length;
  console.log(`  ${"합계".padEnd(32)}${String(sum).padStart(4)}  ${ok ? "= 분모 (닫힘)" : `**분모 ${rows.length} 와 안 맞음 — 이 표는 못 믿는다**`}`);
  if (!ok) process.exitCode = 1;
}

table("전체 app_build", R, [[`유니티 시절(~${WEB_FROM} 전)`, (r) => r.day < WEB_FROM], [`웹 시절(${WEB_FROM}~)`, (r) => r.day >= WEB_FROM]]);
table("유니티 시절", uni, [["HTML 있음(첫 웹 게임)", (r) => r.html], ["분류 어긋남 — 문서", (r) => !r.html && r.doc], ["진짜 유니티 결과물", (r) => !r.html && !r.doc]]);
table("웹 시절 — 검사 상태", web, [
  ["고리가 돌았다(바퀴≥1)", (r) => r.rounds >= 1],
  ["**못 잼** — 고리가 안 돌았다(no_run)", (r) => r.loop && r.rounds === 0],
  ["안 잼 — HTML 은 있는데 고리 기록 없음", (r) => !r.loop && r.html],
  ["대상 아님 — HTML 이 없다", (r) => !r.loop && !r.html],
]);
table("**웹 시절** · HTML 없는 것 (전체로는 102개)", web.filter((r) => !r.html), [
  ["**엔진 어긋남** — 엔진=web 인데 HTML 없음", (r) => r.engine === "web"],
  ["분류 어긋남 — 문서", (r) => r.engine !== "web" && r.doc],
  ["일부러 깨뜨린 과제(얼린 대기열)", (r) => r.engine !== "web" && !r.doc && r.planted],
  ["유니티로 정하고 유니티가 나옴", (r) => r.engine !== "web" && !r.doc && !r.planted],
]);
console.log(`\n분류 어긋남 — 제목에 "조사·설계·설명·요구사항" 이 든 것 (어느 칸에 있었나)`);
for (const r of R.filter((r) => r.doc)) console.log(`  ${r.at} ${r.title.slice(0, 28).padEnd(30)} ${r.day < WEB_FROM ? "유니티 시절" : "웹 시절"} · HTML ${r.html ? "있음" : "없음"} · 엔진 ${r.engine}`);

// ── **거르는 규칙은 반대쪽을 재야 근거가 된다** (사장님 09-21)
// 넷에서 뽑은 규칙이 넷을 잡는 것은 당연하다. 멀쩡한 게임이 몇 개 걸리는지를 센다.
const hit = R.filter((r) => r.doc);
const falseHit = hit.filter((r) => r.html);   // HTML 이 나왔으면 실제로 돌아가는 것 — 문서가 아니다
console.log(`
거르는 규칙 시험 — 제목에 "조사·설계·설명·요구사항" 이 들어간 것을 거른다면`);
console.log(`  192개 중 걸리는 것 ${hit.length}개`);
console.log(`  그중 **HTML 이 있는 것(= 멀쩡한 게임이 걸린다) ${falseHit.length}개**`);
for (const r of falseHit) console.log(`    ${r.at} ${r.title.slice(0, 40)}`);
console.log(`  잘못 걸린 것이 ${falseHit.length === 0 ? "**0 개 — 이 규칙은 단순해도 된다**" : `${falseHit.length}개 있다 — 규칙을 좀 더 좀혀야 한다`}`);

// **잡는 잣대를 바꿈** (사장님 09-21): "HTML 이 있으면 멀쩡한 게임" 은 유니티 시절엔 안 맞는다 —
// 진짜 게임 88개도 HTML 이 없다. 필요한 문장은 **"걸린 넷이 알려진 문서 넷과 정확히 같다"** 이다.
// **알려진 문서는 아이디로 적는다** (사장님 09-21). 오늘 오타 세 번이 전부 손으로 친 한글 제목에서 나왔다 —
// 따옴표 모양, 유니코드 이스케이프. 아이디로 대조하면 그 문제가 아예 생길 수 없다.
// 심은 과제를 제목에서 칸으로 옮긴 것과 같은 이유다.
const KNOWN_DOC_IDS = new Set([
  "343e1a21-49a4-46f4-b071-0e831ce4c08f", // 자가학습 API 교체 구조 조사 및 설계안
  "0cea59c0-68af-4db4-8341-c84990ac60f3", // "유니티가 잰다"의 의미 설명
  "e960620b-5122-414e-a176-03f5b41cdd16", // 로키 자가학습 엔진 교체 구조 설계·구현
  "d57969c2-7518-40ee-bd2f-c35b3220368c", // 벽돌깨기 게임 요구사항 정의 및 인수 기준 v2
]);
const matched = hit.filter((r) => KNOWN_DOC_IDS.has(r.id));
console.log(`  알려진 문서 ${KNOWN_DOC_IDS.size}개 중 걸린 것 ${matched.length}개 · 걸렸는데 알려진 문서가 아닌 것 ${hit.length - matched.length}개`);
console.log(`  → ${matched.length === KNOWN_DOC_IDS.size && hit.length === KNOWN_DOC_IDS.size ? "**걸린 넷이 알려진 문서 넷과 정확히 같다**" : "**같지 않다 — 다시 봐야 한다**"}`);
