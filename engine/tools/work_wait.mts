/**
 * 업무 하나가 끝날 때까지 지켜본다 (228회차 10-03). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/work_wait.mts <업무id앞자리> [분=20]
 *
 * 폴링이 아니라 **지켜보기**다 — 끝나면 결과물 제목과 글머리를 같이 낸다.
 * id 는 앞자리만 줘도 된다. 09-24 에 **앞 8자만 저장했다가 새 게임으로 둔갑**한 적이 있어서,
 * 여기서는 앞자리로 **찾기만** 하고 쓰는 것은 늘 전체 id 다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const 앞자리 = process.argv[2] ?? "";
const 분 = Number(process.argv[3] ?? 20);
if (!앞자리) { console.error("업무 id 앞자리가 필요하다"); process.exit(1); }

const { data: 들 } = await db.from("assignments").select("id, title, status").order("created_at", { ascending: false }).limit(200);
const 찾음 = ((들 ?? []) as Record<string, any>[]).filter((a) => String(a.id).startsWith(앞자리));
if (찾음.length !== 1) { console.error(`앞자리 '${앞자리}' 로 ${찾음.length}건 — 더 길게 줘라`); process.exit(1); }
const id = String(찾음[0].id);                       // **전체 id** 로만 조회한다
console.log(`지켜봄: ${찾음[0].title} (${id})`);

const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));
const 끝 = Date.now() + 분 * 60_000;
let 앞상태 = "";
while (Date.now() < 끝) {
  const { data: a, error } = await db.from("assignments").select("status").eq("id", id).maybeSingle();
  if (error) { console.error(`못 읽음: ${error.message}`); process.exit(1); }   // 09-24: 못 읽은 것을 모른 척하면 엉뚱한 결론이 난다
  const 상태 = String((a as any)?.status ?? "?");
  if (상태 !== 앞상태) { console.log(`${new Date().toTimeString().slice(0, 8)}  ${상태}`); 앞상태 = 상태; }
  if (["completed", "failed", "cancelled", "awaiting_approval"].includes(상태)) break;
  await 쉼(10_000);
}
if (!["completed", "failed", "cancelled", "awaiting_approval"].includes(앞상태)) { console.log(`${분}분 동안 안 끝났다 (${앞상태})`); process.exit(2); }

// 칸 이름은 `content_json` 이다. 10-03 에 `content` 로 물어 **0개**가 나왔고, 하마터면 "로키가 빈손으로 끝냈다" 고
// 보고할 뻔했다 — 오류를 안 읽었기 때문이다. 0 은 "없다" 가 아니라 "그 이름으로는 못 본다" 였다.
const { data: 결, error: 결오류 } = await db.from("deliverables").select("title, content_json, created_at").eq("assignment_id", id).order("created_at", { ascending: false });
if (결오류) { console.error(`결과물을 못 읽었다: ${결오류.message}`); process.exit(1); }
const 것들 = (결 ?? []) as Record<string, any>[];
console.log(`\n결과물 ${것들.length}개`);
for (const d of 것들) {
  const 글 = typeof d.content_json === "string" ? d.content_json : JSON.stringify(d.content_json, null, 2);
  console.log(`\n── ${d.title} (${글.length}자)\n${글.slice(0, 1200)}${글.length > 1200 ? "\n…" : ""}`);
}
const { data: x } = await db.from("work_executions").select("error_message, status").eq("assignment_id", id).order("created_at", { ascending: false }).limit(3);
for (const e of ((x ?? []) as Record<string, any>[])) if (e.error_message) console.log(`\n실행 ${e.status}: ${String(e.error_message).slice(0, 300)}`);
