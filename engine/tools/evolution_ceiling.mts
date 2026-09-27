/**
 * **로키가 스스로 얼마나 진화할 수 있나 — 천장을 재고 적는다** (226회차 2026-09-27).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/evolution_ceiling.mts
 *
 * 사장님: *"가능성으로 따질때 알아서 얼마나 진화할 수있는지."*
 *
 * 이것도 주장하지 않고 센다. 진화를 세 층으로 가른다 —
 *   **1층 · 스스로 바꾸는 것** : 일하는 방식(프롬프트에 붙는 규칙). 사람 손 0번.
 *   **2층 · 스스로 만들고 사람이 한 번 누르는 것** : 코드 조각(self_fix) — 짓고 문 셋을 지나
 *            **로컬 커밋까지** 스스로 하지만 배포는 사람이 한다.
 *   **3층 · 구조상 못 하는 것** : 자기를 재는 자, 예산, 배포, 그리고 **자기 성격**.
 *
 * 3층이 왜 천장인가: **자를 스스로 느슨하게 만들 수 있으면 그건 자가 아니다.** 그래서 이 선은
 * 고장이 아니라 설계다. 진화의 상한은 "규칙과 코드 조각으로 표현될 수 있는 것" 까지다.
 *
 * 그런데 1층조차 **재료가 없으면 안 돌아간다** — 규칙은 실패 기록에서 나오고, 판정은 사람이 한다.
 * 그 굶주림을 숫자로 적는다([[evolution-is-starving-not-broken]]).
 */
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createServiceClient } from "../../src/lib/supabase/service";

const db = createServiceClient();
const 줄: string[] = [];
const 적기 = (s = "") => { 줄.push(s); console.log(s); };

// ── 1층: 스스로 채택한 규칙 ───────────────────────────────────────
const { data: 지식, error: e1 } = await db
  .from("organization_knowledge")
  .select("title, description, status, created_at")
  .limit(500);
if (e1) { console.error("지식을 못 읽었다 — 멈춘다:", e1.message); process.exit(1); }
const 규칙 = (지식 ?? []) as { title: string; description: string | null; status: string; created_at: string }[];
const 살아있음 = 규칙.filter((r) => r.status === "active");
const 내려간것 = 규칙.filter((r) => r.status === "deprecated");

const { data: 후보, error: e2 } = await db
  .from("learning_candidates")
  .select("status, created_at")
  .limit(1000);
if (e2) { console.error("후보를 못 읽었다 — 멈춘다:", e2.message); process.exit(1); }
const cs = (후보 ?? []) as { status: string; created_at: string }[];
const 상태셈 = new Map<string, number>();
for (const c of cs) 상태셈.set(c.status, (상태셈.get(c.status) ?? 0) + 1);

const 글자수 = 살아있음.reduce((s, r) => s + (r.title?.length ?? 0) + (r.description?.length ?? 0), 0);

적기(`# 로키가 스스로 얼마나 진화할 수 있나 — v0`);
적기();
적기(`뽑은 날 ${new Date().toISOString().slice(0, 10)}. **주장이 아니라 센 것이다.**`);
적기();
적기(`## 1층 · 스스로 바꾸는 것 — 일하는 방식 (사람 손 0번)`);
적기();
적기(`- 지금 일 프롬프트에 들어가 있는 **스스로 채택한 규칙 ${살아있음.length}개** (${글자수.toLocaleString()}자)`);
적기(`- 스스로 내린 규칙 ${내려간것.length}개 — 보류분이 늘면 다시 대 보고 문턱에 못 미치면 내린다`);
적기(`- 규칙 후보 ${cs.length}개 · ${[...상태셈].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(" · ")}`);
적기();
적기(`**이 층의 상한**: 규칙은 프롬프트에 붙는 글이다. 그래서 "말로 적을 수 있는 일하는 방식" 까지만 바뀐다.`);
적기(`숫자·자리·상한값(예: 토큰 상한, 어느 모델로 보낼지)은 규칙으로 못 바꾼다 — 그건 코드다.`);
적기();

// ── 2층: 코드 조각을 스스로 (사람이 한 번 누른다) ─────────────────
const selfFix = execSync('git log --oneline --all --grep="self-fix" --grep="self_fix" -i', { encoding: "utf-8" })
  .trim().split("\n").filter(Boolean);
적기(`## 2층 · 스스로 짓고 사람이 한 번 누르는 것 — 코드 조각`);
적기();
적기(`- 저장소에서 찾은 **자가 고침 커밋 ${selfFix.length}건**`);
for (const l of selfFix.slice(0, 6)) 적기(`   · ${l.slice(0, 100)}`);
적기();
적기(`**이 층의 상한**: 짓기·문 셋 지나기·로컬 커밋까지는 스스로 한다. **배포는 사람이 한다.**`);
적기(`그리고 고치는 범위는 조각이다 — 통째로 다시 쓰지 않는다(09-17 에 두 줄 고장에 게임을 새로 써서 사장님이 격분했다).`);
적기();

// ── 3층: 못 하는 것 ──────────────────────────────────────────────
적기(`## 3층 · 구조상 못 하는 것 — 여기가 천장이다`);
적기();
적기(`- **자기를 재는 자**를 못 바꾼다. 자를 스스로 느슨하게 만들 수 있으면 그건 자가 아니다. 고장이 아니라 설계다.`);
적기(`- **배포**를 못 한다. 새 코드가 실제로 도는 순간은 사람의 손가락 하나가 필요하다.`);
적기(`- **예산**을 못 정한다. 한도 숫자는 사장님 것이다.`);
적기(`- **자기 성격**(대화 프롬프트)을 못 바꾼다. 사람이 고친다.`);
적기(`- **자기 판정**을 못 한다. 좋은지 나쁜지의 마지막 칸은 사람이 고른다.`);
적기();

// ── 재료: 1층조차 굶고 있나 ───────────────────────────────────────
const { data: 반응, error: e3 } = await db
  .from("conversation_messages")
  .select("attachments, created_at")
  .eq("role", "user")
  .not("attachments", "is", null)
  .order("created_at", { ascending: false })
  .limit(800);
if (e3) { console.error("반응을 못 읽었다 — 멈춘다:", e3.message); process.exit(1); }
let 판정 = 0, 물림 = 0, 최근30일 = 0;
const 서른일전 = Date.now() - 30 * 86400_000;
for (const m of (반응 ?? []) as { attachments: Record<string, unknown> | null; created_at: string }[]) {
  const a = m.attachments?.reaction as { rejected?: boolean } | undefined;
  if (!a || typeof a.rejected !== "boolean") continue;
  판정++;
  if (a.rejected) 물림++;
  if (new Date(m.created_at).getTime() > 서른일전) 최근30일++;
}
적기(`## 재료 — 1층조차 이것 없이는 안 돈다`);
적기();
적기(`- 사장님 판정이 붙은 결과물 **${판정}건** (물림 ${물림}건 · 최근 30일 ${최근30일}건)`);
적기(`- 규칙은 **실패 기록에서** 나오고, 채택 여부는 **떼어 둔 자료**로 검증한다. 판정이 안 쌓이면 후보가 안 나온다.`);
적기(`- 그래서 진화 속도의 실제 병목은 모델이 아니라 **사장님이 "이건 아니다" 라고 말한 횟수**다.`);
적기();
적기(`## 한 줄로`);
적기();
적기(`**말로 적을 수 있는 일하는 방식은 혼자 바꾼다. 코드는 조각까지 혼자 짓고 배포에서 손을 기다린다.**`);
적기(`**자·예산·성격·판정은 구조상 못 바꾼다 — 그게 천장이고, 천장이 있어야 자가 자다.**`);
// **결론을 박지 않고 숫자에서 고른다.** 처음에 나는 "재료가 모자라 굶고 있다" 를 적어 뒀는데,
// 바로 위에 최근 30일 판정이 202건으로 찍혔다 — 09-16 진단(판정 0건) 이후 상황이 바뀐 것이다.
// 자기 숫자와 모순되는 결론을 적으면 그 문서는 다음에 읽는 사람을 잘못 이끈다.
const 채택률 = cs.length ? (상태셈.get("approved") ?? 0) / cs.length : 0;
적기();
적기(`**지금 어디서 막혀 있나** (숫자에서 고른 것):`);
if (최근30일 < 20) {
  적기(`- 재료가 모자라다 — 최근 30일 판정 ${최근30일}건. 규칙은 실패 기록에서 나오므로 여기가 먼저다.`);
} else {
  적기(`- **재료는 흐른다** — 최근 30일 판정 ${최근30일}건(누적 ${판정}건). 09-16 에 "굶고 있다" 고 본 상태는 벗어났다.`);
  적기(
    `- 막힌 곳은 **채택률**이다 — 후보 ${cs.length}개 중 받아들인 것 ${상태셈.get("approved") ?? 0}개 ` +
      `(${(채택률 * 100).toFixed(0)}%). 떼어 둔 자료에서 못 이긴 후보는 버려진다.`,
  );
  적기(`- 그래서 다음 물음은 "재료를 더 모으자" 가 아니라 **"왜 후보가 검증을 못 넘나"** 다.`);
  적기(`  (그리고 채택된 규칙이 실제로 무언가를 막고 있나 — 어긴 사례가 0건인 규칙은 있으나 없으나 같다.)`);
}
적기();
적기(`**천장에 닿아서 못 크는 게 아니다.** 1층(규칙)에서 검증을 넘는 후보가 적어서 느린 것이다.`);

writeFileSync("engine/docs/evolution-ceiling-v0.md", 줄.join("\n") + "\n");
console.log("\nengine/docs/evolution-ceiling-v0.md 에 적었다. 호출 0번 · 값 0원.");
