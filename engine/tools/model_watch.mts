/**
 * **지금 어떤 AI 들이 있는가** (171회차 09-18, 2단계 첫 조각). 돈 0 — 공급자의 모델 목록 문만 읽는다.
 *   npx tsx engine/tools/model_watch.mts --selftest   — 견주는 규칙만(지어낸 목록, 고장 재현 포함)
 *   npx tsx engine/tools/model_watch.mts              — 진짜 목록을 읽어 지난 장부(engine/docs/model-watch.json)와 견주고 장부를 새로 쓴다
 *   npx tsx engine/tools/model_watch.mts --dry        — 읽고 견주기만(장부 안 씀)
 *
 * 열쇠는 .env.local 의 OPENAI_API_KEY · ANTHROPIC_API_KEY · DEEPSEEK_API_KEY. 값은 찍지 않는다.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
const { compareWatch, watchModels, isWorkModel, family, IN_USE } = await import("../../src/lib/providers/modelWatch");

if (process.argv.includes("--selftest")) {
  let bad = 0, seen = 0;
  const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
  const m = (id: string, vendor: "openai" | "anthropic" | "deepseek" = "openai") => ({ id, vendor });
  const prev = { takenAt: "", models: [m("gpt-5"), m("gpt-5-mini"), m("text-embedding-3"), m("claude-sonnet-5", "anthropic"), m("deepseek-v4-pro", "deepseek")] };
  const now = [m("gpt-5"), m("gpt-5-mini"), m("gpt-7"), m("text-embedding-4"), m("claude-sonnet-5-20260901", "anthropic")];
  const okV = new Set(["openai", "anthropic"] as const);
  const r = compareWatch(prev, now, okV as never, [{ id: "gpt-5", vendor: "openai" }, { id: "gpt-6-astra", vendor: "openai" }, { id: "claude-sonnet-5", vendor: "anthropic" }, { id: "deepseek-v4-pro", vendor: "deepseek" }]);
  check("새 모델을 잡는다(gpt-7)", r.fresh.some((x) => x.id === "gpt-7"), r.fresh);
  check("일에 안 쓰는 새 모델(임베딩)은 안 알린다", !r.fresh.some((x) => x.id.includes("embedding")), r.fresh);
  check("우리가 부르는데 목록에 없는 것을 잡는다(gpt-6-astra)", r.missingInUse.includes("gpt-6-astra"), r.missingInUse);
  check("날짜 꼬리만 붙은 같은 집안은 없어진 게 아니다(claude-sonnet-5)", !r.missingInUse.includes("claude-sonnet-5"), r.missingInUse);
  check("고장: 목록을 못 읽은 공급자(deepseek)를 '없어졌다'로 읽지 않는다", !r.gone.some((x) => x.vendor === "deepseek") && !r.missingInUse.includes("deepseek-v4-pro"), { gone: r.gone, missing: r.missingInUse });
  check("고장: 첫 실행에 전부를 '새로 생김'으로 알리지 않는다", compareWatch(null, now, okV as never, []).fresh.length === 0);
  check("집안 이름: 날짜·판 꼬리를 뗀다", family("gpt-5-2026-03-01") === "gpt-5" && family("claude-sonnet-5-20260601") === "claude-sonnet-5");
  check("일 모델 가르기", isWorkModel("gpt-7") && !isWorkModel("whisper-2") && !isWorkModel("text-embedding-4"));
  console.log(`\n본 줄 ${seen} · 어긋남 ${bad}`);
  process.exit(bad === 0 ? 0 : 1);
}

for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#") && !(l.slice(0, i).trim() in process.env)) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }

// 코드가 실제로 부르는 이름을 훑어 IN_USE 에 빠진 게 없는지 본다(이 목록이 낡으면 '곧 죽을 호출'을 못 잡는다).
const found = new Set<string>();
const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !p.endsWith("modelWatch.ts") && !p.endsWith("pricing.ts")) for (const hit of readFileSync(p, "utf8").matchAll(/"((?:gpt|deepseek|claude|sora|veo|lyria|gemini|imagen|o\d)-[a-z0-9.-]+)"/g)) found.add(hit[1]); } };
walk("src/lib");
const notListed = [...found].filter((id) => !IN_USE.some((u) => u.id === id));
if (notListed.length) console.log(`! 코드에 있는데 IN_USE 에 없는 이름: ${notListed.join(", ")} — modelWatch.ts 에 더할 것\n`);

const FILE = "engine/docs/model-watch.json";
const prev = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null;
const { report, snapshot } = await watchModels(prev);
for (const [v, s] of Object.entries(report.vendors)) console.log(`${v}: ${s.ok ? `${s.count}개` : `못 읽음(${s.why})`}`);
const work = snapshot.models.filter((m) => isWorkModel(m.id));
if (report.firstRun) {
  console.log(`\n첫 장부다 — 견줄 지난 목록이 없다. 일에 쓸 수 있는 모델 ${work.length}개를 적어 둔다.`);
  const newest = work.filter((m) => m.created).sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).slice(0, 12);
  console.log("가장 최근에 나온 것:"); for (const m of newest) console.log(`   ${new Date((m.created ?? 0) * 1000).toISOString().slice(0, 10)}  ${m.vendor}  ${m.id}${IN_USE.some((u) => family(u.id) === family(m.id)) ? "   ← 쓰는 중" : ""}`);
} else {
  console.log(`\n새로 생긴 것 ${report.fresh.length}: ${report.fresh.map((m) => `${m.vendor}/${m.id}`).join(", ") || "없음"}`);
  console.log(`없어진 것 ${report.gone.length}: ${report.gone.map((m) => `${m.vendor}/${m.id}`).join(", ") || "없음"}`);
}
console.log(`\n**우리가 부르는데 목록에 없는 것** ${report.missingInUse.length}: ${report.missingInUse.map((id) => `${id}(${IN_USE.find((u) => u.id === id)?.where})`).join(", ") || "없음"}`);
if (!process.argv.includes("--dry")) { writeFileSync(FILE, JSON.stringify(snapshot, null, 1) + "\n"); console.log(`\n장부를 썼다: ${FILE} (${snapshot.models.length}개)`); }
