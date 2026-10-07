/**
 * **빠진 것만 조각으로 채운다** (228회차 10-03).
 *   npx tsx engine/tools/rookery_env.mts engine/work/ask/조각고침.mts <폴더> <불평.txt> [모델]
 *
 * 한 판 지어 재 봤더니 **전투의 알맹이(환생·수정)가 통째로 없었다.** 모델은 27개 중 21개를 지켰다고 적었는데,
 * 없는 것을 있다고 적은 것이다 — **스스로 적은 지킴은 자가 아니다.**
 *
 * 그렇다고 **다시 짓지 않는다.** 09-17 에 두 줄 고장에 게임을 통째로 새로 써서 사장님이 격분하셨다.
 * 들고 있는 것(본부·건물·탭·전투 뼈대)은 자가 7/7 로 멀쩡하다고 쟀다. 멀쩡한 것은 **한 글자도 건드리지 않는다.**
 *
 * 불평은 **파일로** 넘긴다 — 09-25 에 여러 줄 주문이 윈도에서 첫 줄만 남아 지시문 없이 돈 적이 있다.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const 폴더 = (process.argv[2] ?? "").split("\\").join("/");
const 불평길 = process.argv[3] ?? "";
const 모델 = process.argv[4] ?? "gpt-5.6-luna";
if (!폴더 || !existsSync(폴더)) { console.error("폴더가 없다"); process.exit(1); }
if (!불평길 || !existsSync(불평길)) { console.error("불평을 적은 파일이 필요하다 (여러 줄은 인자로 넘기면 잘린다)"); process.exit(1); }
const 불평 = readFileSync(불평길, "utf8").trim();

const { buildPatch } = await import("../../../src/lib/skills/appBuild/patch");
const { createOpenAIProvider } = await import("../../../src/lib/providers/openai");
const { meterProviders } = await import("../../../src/lib/costs/meter");
const { createServiceClient } = await import("../../../src/lib/supabase/service");

const 말: Record<string, string> = { ".html": "html", ".js": "javascript", ".css": "css", ".json": "json", ".md": "markdown" };
const 모은것: { path: string; language: string; contents: string }[] = [];
for (const f of readdirSync(폴더)) {
  const p = join(폴더, f);
  if (statSync(p).isDirectory() || !말[extname(f)]) continue;
  모은것.push({ path: f, language: 말[extname(f)], contents: readFileSync(p, "utf8") });
}
// 큰 것부터 — 고칠 곳은 거의 늘 제일 큰 파일이다. README 는 고칠 게 아니라 **안 보여 준다**(바꾸라고 꼬드기니까).
const full = 모은것.filter((f) => f.language !== "markdown").sort((a, b) => b.contents.length - a.contents.length);
const rest = 모은것.filter((f) => f.language === "markdown");
console.log(`고칠 파일 ${full.length}개 (${full.map((f) => `${f.path} ${(f.contents.length / 1024).toFixed(0)}KB`).join(" · ")})`);

const 기준길 = "C:/Users/az518/Desktop/로키-게임모방/전투.json";
const 기준 = existsSync(기준길) ? (JSON.parse(readFileSync(기준길, "utf8")).기준 as { id: string; when: string; then: string }[]) : [];

const db = createServiceClient();
const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
if (!co) { console.error("회사를 못 찾았다"); process.exit(1); }
const { ai } = meterProviders({ ai: createOpenAIProvider({ judgmentModel: 모델 }) } as any, db, { companyId: (co as any).id, purpose: "copy_patch" } as any);

const t0 = Date.now();
const r = await buildPatch(ai, { title: "길드 경영 + 오늘도 환생식 전투", ask: 불평, criteria: 기준, failedChecks: [], full, rest });
const 초 = Math.round((Date.now() - t0) / 1000);

if (!r.ok) {
  console.error(`\n조각이 안 붙었다 (${r.asked}번 물음 · ${초}초):`);
  for (const f of r.failures) console.error(`  - ${f.path}: ${f.reason} — ${f.find.slice(0, 90)}`);
  process.exit(1);
}
for (const f of r.files) if (모은것.some((o) => o.path === f.path) || !existsSync(join(폴더, f.path))) writeFileSync(join(폴더, f.path), f.contents);
console.log(`\n${모델} — ${초}초 · 물음 ${r.asked}번 · 조각 ${r.patch.edits.length}개 · 바뀐 줄 ${r.changedLines}/${r.totalLines} (${((r.changedLines / r.totalLines) * 100).toFixed(1)}%)`);
for (const e of r.patch.edits) console.log(`  · ${e.path} — ${e.why}`);
const 못지킴 = r.patch.coverage.filter((c) => !c.met);
if (못지킴.length) console.log(`스스로 "못 지켰다": ${못지킴.map((c) => c.criterionId).join("·")}`);
/**
 * **값은 `schemaName` 으로 적힌다.** 내가 scope 에 적은 `purpose` 는 원장이 안 본다(meter.ts 100줄).
 * 그래서 10-03 에 이 줄이 내내 `$0.000` 을 찍었고, 나는 하마터면 "장부에 구멍" 이라고 보고할 뻔했다 —
 * **0 은 "안 썼다" 가 아니라 "그 이름으로는 못 본다" 였다.** 이 판이 쓴 것만 보려고 시각으로 자른다.
 */
const { data: 값 } = await db.from("model_usage").select("cost_usd").eq("purpose", "app_patch").gte("created_at", new Date(t0).toISOString());
console.log(`이 판이 쓴 값 $${((값 ?? []) as any[]).reduce((s, x) => s + Number(x.cost_usd ?? 0), 0).toFixed(3)}`);
console.log(`\n이제 같은 자로 다시 잰다:\n  npx tsx engine/work/ask/메뉴게임자.mts ${폴더}`);
