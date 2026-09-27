/**
 * **로키의 한계표 — 어디까지 해냈나** (226회차 2026-09-27).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/limits_look.mts
 *
 * 사장님: *"로키가 없는게 하나있서 그건 한계야 어디까지 되는지 알아야해."*
 *
 * 로키는 "이건 어디까지 돼?" 에 답할 근거가 없다. 그래서 물으면 지어낸다 —
 * 09-16 에 **있는 v2 를 없다고** 했고, 오늘 나는 "잘림 0건" 을 "없다" 로 읽었다.
 * 둘 다 같은 병이다: **모르는 것을 모른다고 말할 자리가 없었다.**
 *
 * 그래서 한계를 **주장하지 않고 장부에서 뽑는다.** 세 칸으로 가른다 —
 *   · **해 봤고 됐다** — 실제로 만들어진 최대치. 이건 사실이다.
 *   · **해 봤고 안 됐다** — 떨어진 횟수와 이유. 여기가 벽에 가깝다.
 *   · **안 해 봤다** — 등록부에 있는데 결과물이 0건. **이건 "안 된다" 가 아니라 "모른다" 다.**
 *
 * 최대치는 "가장 큰 것" 이지 "한계" 가 아니다. 더 큰 것을 시도한 적이 없으면
 * 벽은 그보다 뒤에 있다. 그 구분을 표에 적는다.
 */
import { writeFileSync } from "node:fs";
import { createServiceClient } from "../../src/lib/supabase/service";

const db = createServiceClient();
const { employeeSkillRegistry } = await import("../../src/lib/skills/registry");

type D = { deliverable_type: string; content_json: Record<string, unknown> | null; created_at: string };
const 결과물: D[] = [];
for (let 시작 = 0; ; 시작 += 1000) {
  const { data, error } = await db
    .from("deliverables")
    .select("deliverable_type, content_json, created_at")
    .order("created_at", { ascending: false })
    .range(시작, 시작 + 999);
  if (error) { console.error(error.message); process.exit(1); }
  const 쪽 = (data ?? []) as D[];
  결과물.push(...쪽);
  if (쪽.length < 1000) break;
}

// 226회차: 처음에 `capability_id` 로 물었는데 **그 칸이 없어서** 조회가 통째로 실패했고,
// 나는 **오류를 안 읽고** "업무 0건 · 능력 16개 전부 안 해 봤다" 를 적었다. 같은 날 아침에
// [[zero-can-mean-i-cannot-see]] 를 써 놓고 한 시간 만에 그대로 했다. 이제 오류를 읽고 멈춘다.
//
// 능력은 `role_input_schema_id` 로 갈린다(app_build_assignment_v1 · video_assignment_v1 …).
// `role_input_json.capabilityId` 는 434건 중 17건에만 있다 — 그걸로 세면 대부분이 빠진다.
type A = { status: string; failure_reason: string | null; role_input_schema_id: string | null };
const 업무: A[] = [];
for (let 시작 = 0; ; 시작 += 1000) {
  const { data, error } = await db
    .from("assignments")
    .select("status, failure_reason, role_input_schema_id")
    .order("created_at", { ascending: false })
    .range(시작, 시작 + 999);
  if (error) {
    console.error("업무를 못 읽었다 — 여기서 멈춘다(0 을 '없다' 로 적지 않는다):", error.message);
    process.exit(1);
  }
  const 쪽 = (data ?? []) as A[];
  업무.push(...쪽);
  if (쪽.length < 1000) break;
}

/** 종류마다 "크기" 를 재는 법. 없으면 크기 칸은 비운다 — 지어내지 않는다. */
const 크기재기: Record<string, { 이름: string; 값: (c: Record<string, unknown>) => number | null }[]> = {
  app_build: [
    { 이름: "파일 개수", 값: (c) => (Array.isArray(c.files) ? c.files.length : null) },
    { 이름: "확인 항목 수", 값: (c) => (Array.isArray(c.criteria) ? c.criteria.length : null) },
    { 이름: "고침 바퀴", 값: (c) => (typeof c.loop === "object" && c.loop && "rounds" in (c.loop as object) ? Number((c.loop as { rounds?: number }).rounds ?? 0) || null : null) },
    { 이름: "코드 글자 수", 값: (c) => (Array.isArray(c.files) ? (c.files as { contents?: string }[]).reduce((s, f) => s + (f.contents?.length ?? 0), 0) || null : null) },
  ],
  video: [
    { 이름: "길이(초)", 값: (c) => (typeof c.total === "number" ? c.total : null) },
    { 이름: "장면 수", 값: (c) => (Array.isArray(c.durations) ? c.durations.length : null) },
  ],
  slides: [{ 이름: "장 수", 값: (c) => (Array.isArray(c.outline) ? c.outline.length : null) }],
  analysis: [
    { 이름: "출처 수", 값: (c) => (Array.isArray(c.sources) ? c.sources.length : null) },
    { 이름: "인용 수", 값: (c) => (Array.isArray(c.claims) ? c.claims.length : null) },
  ],
  mesh_assets: [{ 이름: "조각 수", 값: (c) => (Array.isArray(c.clips) ? c.clips.length : null) }],
  image: [{ 이름: "장 수", 값: (c) => (Array.isArray(c.variants) ? c.variants.length : null) }],
  document: [{ 이름: "항목 수", 값: (c) => (Array.isArray(c.items) ? c.items.length : null) }],
};

const 줄: string[] = [];
const 적기 = (s = "") => { 줄.push(s); console.log(s); };

적기(`# 로키 한계표 v0 — 어디까지 해냈나`);
적기();
적기(`뽑은 날 ${new Date().toISOString().slice(0, 10)} · 결과물 ${결과물.length}건 · 업무 ${업무.length}건`);
적기();
적기(`**이 표는 한계가 아니라 "해낸 최대치" 다.** 더 큰 것을 시도한 적이 없으면 벽은 그보다 뒤에 있다.`);
적기(`"안 해 봤다" 는 **"안 된다" 가 아니라 "모른다" 다** — 그 줄에서는 로키가 모른다고 말해야 한다.`);
적기();

const 종류들 = [...new Set(결과물.map((d) => d.deliverable_type))].sort();
for (const t of 종류들) {
  const ds = 결과물.filter((d) => d.deliverable_type === t);
  적기(`## ${t} — 해낸 것 ${ds.length}건`);
  const 재기 = 크기재기[t];
  if (!재기) {
    적기(`  크기를 재는 법이 없다 — **이 종류의 한계는 모른다.**`);
  } else {
    for (const m of 재기) {
      const 값들 = ds.map((d) => m.값(d.content_json ?? {})).filter((x): x is number => typeof x === "number" && x > 0);
      적기(
        값들.length
          ? `  ${m.이름}: 가장 큰 것 **${Math.max(...값들).toLocaleString()}** · 중간 ${값들.sort((a, b) => a - b)[Math.floor(값들.length / 2)].toLocaleString()} (${값들.length}건에서 읽음)`
          : `  ${m.이름}: 읽을 수 있는 줄이 없다 — 모른다`,
      );
    }
  }
  적기();
}

적기(`## 끝까지 못 간 것 — 벽에 가까운 자리`);
// **`failed` 상태는 하나도 없다**(434건: completed 325 · cancelled 108 · waiting 1).
// 처음에 나는 `failed` 를 셌고 0 이 나왔다 — 없는 상태를 세면 언제나 0 이다.
// 끝까지 못 간 것은 `cancelled` 다. 취소는 사장님이 접은 것이기도 하고 되돌린 것이기도 하다
// ([[cancel-is-not-recall]] — 취소하면 통과한 자산도 사라진다).
const 상태 = new Map<string, number>();
for (const a of 업무) 상태.set(a.status, (상태.get(a.status) ?? 0) + 1);
적기(`  업무 ${업무.length}건 · ${[...상태].sort((x, y) => y[1] - x[1]).map(([s, n]) => `${s} ${n}`).join(" · ")}`);
const 이유 = new Map<string, number>();
for (const a of 업무) {
  if (!a.failure_reason) continue;
  const r = a.failure_reason.replace(/\s+/g, " ").slice(0, 70);
  이유.set(r, (이유.get(r) ?? 0) + 1);
}
적기(
  이유.size
    ? `  이유가 적힌 것 ${[...이유.values()].reduce((a, b) => a + b, 0)}건:`
    : `  **이유가 적힌 줄이 하나도 없다** — 왜 끝까지 못 갔는지 장부에 안 남는다. 여기는 아직 못 읽는 자리다.`,
);
for (const [r, n] of [...이유].sort((x, y) => y[1] - x[1]).slice(0, 12)) 적기(`   ${String(n).padStart(3)}회 · ${r}`);
적기();

적기(`## 안 해 봤다 — 모르는 자리`);
const 능력들: { skill: string; cap: string }[] = [];
for (const [sid, skill] of Object.entries(employeeSkillRegistry)) {
  for (const c of (skill as { capabilities?: { id: string }[] }).capabilities ?? []) 능력들.push({ skill: sid, cap: c.id });
}
// 업무는 `role_input_schema_id`(예: video_assignment_v1) 로 남으므로 능력 id 와 이름이 다르다.
// 그래서 **기술(skill) 단위로** 맞춘다 — 그보다 잘게는 이 장부로 못 가른다. 그 한계를 적어 둔다.
const 해본기술 = new Set(
  업무.map((a) => (a.role_input_schema_id ?? "").replace(/_assignment_v\d+$/, "")).filter(Boolean),
);
적기(`  업무에 실제로 나온 기술 ${해본기술.size}가지: ${[...해본기술].sort().join(" · ")}`);
// 기술 id 와 스키마 이름이 다르다: `video_make` → `video_assignment_v1`, `social_post` → `social_...`.
// 첫 판에 그대로 대 봐서 video_explainer·slide_deck·self_board·social_post 넷이 **헛되이**
// "안 해 봤다" 로 올라갔다. 꼬리(`_make`·`_post`)를 떼고 맞춘다.
const 다듬기 = (s: string) => s.replace(/_(make|post)$/, "");
const 해본다듬 = new Set([...해본기술].map(다듬기));
const 안해본 = 능력들.filter((x) => {
  // small_app 은 app_build 기술의 능력인데 스키마 이름이 small_app_assignment_v1 이다 — 둘 다 본다.
  return !해본다듬.has(다듬기(x.skill)) && !해본다듬.has(다듬기(x.cap));
});
적기(`  등록된 능력 ${능력들.length}개 중 **업무 기록에서 안 보이는 것 ${안해본.length}개**`);
for (const x of 안해본) 적기(`   · ${x.cap} (${x.skill})`);
적기();
적기(`  (장부는 기술 단위로만 남으므로, 같은 기술의 여러 능력 중 어느 것이 불렸는지는 **못 가른다.**`);
적기(`   그래서 위 목록은 "안 해 봤다" 의 **상한**이다 — 실제로는 더 적을 수 있다.)`);
적기();
적기(`이 줄들에서 "이거 돼?" 를 물으면 로키는 **"코드는 있는데 아직 해 본 적이 없다"** 고 말해야 한다.`);
적기(`"된다" 도 "안 된다" 도 아직 사실이 아니다.`);

writeFileSync("engine/docs/limits-v0.md", 줄.join("\n") + "\n");
console.log("\nengine/docs/limits-v0.md 에 적었다. 호출 0번 · 값 0원.");
