/**
 * 채택한 규칙이 **정말 효과가 있었나** (142회차 09-16). 돈 0, 모델 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rule_effect.mts
 *
 * 우리는 규칙을 채택할 때 **떼어 둔 자료로 검증**한다(116회차). 그건 "이 규칙이 과거 자료에서 맞는가" 다.
 * 그런데 **채택한 뒤에 실제로 일이 달라졌는가** 는 한 번도 안 쟀다. 둘은 다른 질문이다 —
 * 채택 검증은 통과했는데 프롬프트에 실린 뒤 아무도 안 지킬 수 있다(127회차: 기준 189개에 지킴 2%).
 *
 * 채택된 규칙 셋은 전부 **고치는 판의 보고 방식**이라 결과물 글에서 기계로 잴 수 있다:
 *   · 09-14 11:58 — 떨어진 줄 외에는 손대지 않는다      → 낸 파일 수
 *   · 09-15 01:50 — 바꾼 파일과 **다시 잰 값**으로 보고  → 글에 실측값·'못 쟀음' 이 있나
 *   · 09-15 19:23 — 실패 줄을 **나열**하고 각 측정값     → 요약만 내지 않고 줄을 세웠나
 *
 * **자를 결과에 맞춰 만들지 않으려고** 재는 방법을 먼저 적고 시작한다:
 *   · 표본은 `app_build` 결과물 전부. 고치는 판만 따로도 본다.
 *   · 가른 선은 **채택 시각**이고, 그 전/후로 같은 값을 센다.
 *   · 판이 적으면 적다고 적는다. **적은 표본으로 '효과 있음' 이라고 말하지 않는다.**
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const R1 = new Date("2026-09-14T11:58:00Z").getTime();
const R2 = new Date("2026-09-15T01:50:00Z").getTime();
const R3 = new Date("2026-09-15T19:23:00Z").getTime();

const { data: co } = await db.from("companies").select("id").order("created_at").limit(1).maybeSingle();
const C = co as { id: string };

const { data: dels } = await db
  .from("deliverables")
  .select("id, title, created_at, content_markdown, content_json, assignment_id")
  .eq("company_id", C.id).eq("deliverable_type", "app_build")
  .order("created_at", { ascending: true });

type D = { id: string; title: string; created_at: string; content_markdown: string | null; content_json: { files?: unknown[] } | null; assignment_id: string };
const D = (dels ?? []) as D[];
console.log(`app_build 결과물 ${D.length}건\n`);

/** 그 판이 '이 줄만 고친다' 판인가 — 업무 제목·설명으로 가른다. */
const { data: asg } = await db.from("assignments").select("id, title, description").eq("company_id", C.id);
const fixRound = new Set(
  ((asg ?? []) as { id: string; title: string; description: string | null }[])
    .filter((a) => /떨어진 줄|이 줄만|검사 떨어진|고치기/.test(`${a.title} ${a.description ?? ""}`))
    .map((a) => a.id),
);

type Row = { at: number; fix: boolean; files: number; measured: boolean; listed: boolean; summaryOnly: boolean };
const rows: Row[] = D.map((d) => {
  const t = d.content_markdown ?? "";
  const files = Array.isArray(d.content_json?.files) ? (d.content_json!.files as unknown[]).length : 0;
  // 다시 잰 값: 실측/다시 재/못 쟀음 중 하나라도
  const measured = /실측|다시 재|다시 잰|못 쟀|못 잼/.test(t);
  // 실패 줄 나열: ❌ 줄이나 검사 이름(기대_·규격_)이 둘 이상
  const listed = (t.match(/❌/g) ?? []).length >= 1 || (t.match(/기대_|규격_/g) ?? []).length >= 2;
  // 요약만: '합격 N/M' 꼴은 있는데 줄 나열이 없음
  const summaryOnly = /합격\s*\d+\s*\/\s*\d+|통과\s*\d+\s*·/.test(t) && !listed;
  return { at: new Date(d.created_at).getTime(), fix: fixRound.has(d.assignment_id), files, measured, listed, summaryOnly };
});

const pct = (xs: boolean[]) => (xs.length ? `${Math.round((xs.filter(Boolean).length / xs.length) * 100)}%` : "—");
const show = (label: string, sel: Row[]) => {
  if (!sel.length) { console.log(`${label.padEnd(22)} 판 0건`); return; }
  const avgFiles = (sel.reduce((a, b) => a + b.files, 0) / sel.length).toFixed(1);
  console.log(
    `${label.padEnd(22)} 판 ${String(sel.length).padStart(2)} · ` +
    `다시 잰 값 ${pct(sel.map((r) => r.measured)).padStart(4)} · ` +
    `실패 줄 나열 ${pct(sel.map((r) => r.listed)).padStart(4)} · ` +
    `요약만 ${pct(sel.map((r) => r.summaryOnly)).padStart(4)} · ` +
    `평균 파일 ${avgFiles}`,
  );
};

console.log("── 전체 app_build");
show("규칙 전", rows.filter((r) => r.at < R1));
show("규칙1 뒤", rows.filter((r) => r.at >= R1 && r.at < R2));
show("규칙2 뒤", rows.filter((r) => r.at >= R2 && r.at < R3));
show("규칙3 뒤", rows.filter((r) => r.at >= R3));

console.log("\n── '이 줄만 고친다' 판만 (규칙이 실제로 겨냥한 것)");
const fixes = rows.filter((r) => r.fix);
show("규칙 전", fixes.filter((r) => r.at < R1));
show("규칙1 뒤", fixes.filter((r) => r.at >= R1 && r.at < R2));
show("규칙2 뒤", fixes.filter((r) => r.at >= R2 && r.at < R3));
show("규칙3 뒤", fixes.filter((r) => r.at >= R3));

const after = rows.filter((r) => r.at >= R3).length;
console.log(`\n마지막 규칙 채택 뒤 판 ${after}건.`);
if (after < 5) console.log("**표본이 적다 — 이것으로 '효과 있다/없다' 를 말하면 안 된다.** 판이 더 쌓여야 한다.");
