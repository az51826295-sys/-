/**
 * 채택 규칙의 효과 자 (107회차 09-14). 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_rule_effect.mts
 *
 * 106회차에 채택된 규칙 "검사에서 떨어진 줄 외에는 손대지 않는다" 가 실제로 행동을 바꾸는지 — 프롬프트에 들어간 뒤(09-14 새벽 이후 실행)
 * 되풀이 고치기 판(title '… 떨어진 줄 고치기')이 지난 판 대비 **새로 만든 파일 수**와 **바뀐 파일 수**가 줄고, 유니티 통과율이 오르는지를 잰다.
 * 규칙 채택은 상관이었다(어긴 판이 더 자주 실패). 여기는 인과 쪽 — 규칙을 넣은 뒤 같은 종류의 판이 실제로 달라지는가.
 * 지금은 '전' 만 있다. 판이 쌓이면 '후' 열이 채워진다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const ADOPTED_AT = process.argv[2] ?? "2026-09-14T03:00:00Z";

const { data: dels } = await db.from("deliverables").select("id, title, assignment_id, created_at, vfiles:content_json->verify->files").eq("deliverable_type", "app_build");
type Del = { id: string; title: string; assignment_id: string | null; created_at: string; vfiles: { path?: string }[] | null };
const D = (dels ?? []) as Del[];
const byId = new Map(D.map((d) => [d.id, d]));
const retries = D.filter((d) => /떨어진 줄 고치기/.test(d.title));
const { data: as } = await db.from("assignments").select("id, prev:role_input_json->>previousDeliverableId").in("id", retries.map((r) => r.assignment_id).filter(Boolean) as string[]);
const prevOf = new Map(((as ?? []) as { id: string; prev: string | null }[]).map((a) => [a.id, a.prev]));

// 유니티 판정
const { data: checks } = await db.from("conversation_messages").select("content, unity:attachments->unityChecks").not("attachments->unityChecks", "is", null).order("created_at");
const pass = new Map<string, boolean>();
for (const m of (checks ?? []) as { content: string; unity: { deliverableId?: string } | null }[]) {
  const hit = m.content.match(/통과 (\d+) · (?:실패|떨어짐) (\d+)/); const id = m.unity?.deliverableId;
  if (hit && id) pass.set(id, Number(hit[2]) === 0);
}

type Row = { when: "전" | "후"; files: number; newFiles: number; passed: boolean | null };
const rows: Row[] = [];
for (const r of retries) {
  const paths = new Set((r.vfiles ?? []).map((f) => f.path ?? "").filter(Boolean));
  const prev = r.assignment_id ? byId.get(prevOf.get(r.assignment_id) ?? "") : undefined;
  const prevPaths = new Set((prev?.vfiles ?? []).map((f) => f.path ?? "").filter(Boolean));
  const newFiles = prev ? [...paths].filter((p) => !prevPaths.has(p)).length : -1;
  rows.push({ when: r.created_at >= ADOPTED_AT ? "후" : "전", files: paths.size, newFiles, passed: pass.get(r.id) ?? null });
}
const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "—");
console.log(`되풀이 고치기 판 ${rows.length}건 (규칙 채택 기준 ${ADOPTED_AT})`);
console.log("구간  판수  평균 바뀐 파일  평균 새 파일(지난 판 대비)  유니티 통과율");
for (const when of ["전", "후"] as const) {
  const g = rows.filter((r) => r.when === when);
  const judged = g.filter((r) => r.passed !== null);
  const withPrev = g.filter((r) => r.newFiles >= 0);
  console.log(`${when}    ${String(g.length).padStart(4)}  ${avg(g.map((r) => r.files)).padStart(12)}  ${avg(withPrev.map((r) => r.newFiles)).padStart(22)}  ${judged.length ? `${Math.round((100 * judged.filter((r) => r.passed).length) / judged.length)}% (${judged.length})` : "— (0)"}`);
}
// 규칙이 겨눈 것: 새 파일을 얹은 판 vs 안 얹은 판의 통과율(전 구간)
const before = rows.filter((r) => r.when === "전" && r.newFiles >= 0 && r.passed !== null);
const added = before.filter((r) => r.newFiles > 0), kept = before.filter((r) => r.newFiles === 0);
const rate = (g: Row[]) => (g.length ? `${Math.round((100 * g.filter((r) => r.passed).length) / g.length)}% (${g.length})` : "—");
console.log(`\n'전' 구간에서 새 파일을 얹은 판 통과율 ${rate(added)} vs 안 얹은 판 ${rate(kept)} — 규칙이 겨눈 차이가 기계로도 보이는가`);
