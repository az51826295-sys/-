/**
 * **로키 자가 고침 고리 — 제안을 코드로 옮기는 손** (221회차 09-25, 사장님 "아니 되게 만들어라").
 *
 * 지금까지 `next_work` 는 제안까지만 하고 코드는 사람이 고쳤다. 이 도구가 그 손이다:
 *   제안 하나 → 로키가 손댈 파일 ≤3 을 고른다(선언) → 조각(find/replace)으로 고친다(patch.ts, 통째 다시 쓰기 금지)
 *   → 문: `tsc --noEmit` + `probe_all --fast`(모델 0 자 시험 전부) + 부탁 심판자(제안 크기와 고침 크기가 맞나)
 *   → 다 지나면 **로컬 커밋만**(push·배포 안 함 — 그건 사람 손가락 하나). 하나라도 걸리면 그 파일들을 원래대로 되돌린다.
 * 손대는 범위: src/lib/{skills,providers,execution,chat,genesis} · engine/tools. 사람이 고치던 중인 파일(git diff 에 있는 것)은 안 건드린다.
 * 기록: engine/docs/genesis/self-fix.md 에 한 줄(제안·파일·바뀐 줄·문 결과·값).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/self_fix.mts --from engine/work/anything/next-work-weekly.json [--pick 1] [--dry]
 *   npx tsx engine/tools/rookery_env.mts engine/tools/self_fix.mts --ask "…고칠 것 한 줄…" --ruler "…기계가 무엇으로 재나…"
 *   --auto: 제안 중 사람손=false 이고 값이 '0' 인 첫 것을 고른다(주간 배치용). --dry: 고치기만 하고 문·커밋은 안 한다(되돌린다).
 */
import { z } from "zod";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
const { seatProviderForCompany } = await import("../../src/lib/skills/appBuild/seats");
const { buildPatch } = await import("../../src/lib/skills/appBuild/patch");
const { changeFacts, judgeAsk } = await import("../../src/lib/genesis/askJudge");
const { createServiceClient } = await import("../../src/lib/supabase/service");

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const NL = String.fromCharCode(10);
const DRY = process.argv.includes("--dry"), AUTO = process.argv.includes("--auto");
const SCOPE = ["src/lib/skills", "src/lib/providers", "src/lib/execution", "src/lib/chat", "src/lib/genesis", "engine/tools"];
const CO = "5925c03a-557f-46d7-8589-7388b769df40";
const t0 = Date.now();
const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" }).trim();
const log = (m: string) => console.log(m);

// 0) 제안 고르기
type Proposal = { 이름: string; 근거: string; 자: string; 사람손: boolean; 값: string };
let p: Proposal;
if (arg("--ask")) p = { 이름: arg("--ask")!, 근거: "사람이 직접", 자: arg("--ruler") ?? "자 없음", 사람손: false, 값: "0" };
else {
  const from = arg("--from") ?? "engine/work/anything/next-work-weekly.json";
  if (!existsSync(from)) { log(`제안 파일이 없다: ${from}`); process.exit(2); }
  const j = JSON.parse(readFileSync(from, "utf8")) as { output: { 일: Proposal[] } };
  const list = j.output.일;
  const pick = AUTO ? list.findIndex((w) => !w.사람손 && /^\s*0\s*$|^\$?0(\.0+)?$|코드만/.test(w.값) && !/자 없음/.test(w.자)) : Number(arg("--pick") ?? 1) - 1;
  if (pick < 0 || !list[pick]) { log("고를 제안이 없다(사람손=false·값 0·자 있음 인 것이 없음)"); process.exit(0); }
  p = list[pick];
}
if (p.사람손) { log(`이 제안은 사람 손이 필요하다고 적혀 있다 — 안 한다: ${p.이름}`); process.exit(0); }
log(`제안: ${p.이름}${NL}근거: ${p.근거}${NL}자: ${p.자}${NL}`);

// 1) 손댈 파일 선언 — 목록만 보고 ≤3 고른다(작은 판 구조, 09-09)
const dirty = new Set(git("diff", "--name-only").split(NL).filter(Boolean).concat(git("diff", "--cached", "--name-only").split(NL).filter(Boolean)));
const candidates = git("ls-files", ...SCOPE).split(NL).filter((f) => /\.(ts|mts)$/.test(f) && !dirty.has(f));
const seat = await seatProviderForCompany(arg("--seat") ?? "gpt-5.6-luna", createServiceClient(), CO);   // 회사 장부에 적히고, 한도에 닿았으면 안 한다
if (!seat.ai) { log(seat.why); process.exit(0); }
const ai = seat.ai;
const pickSchema = z.object({ files: z.array(z.string()).min(1).max(3).describe("고칠 파일 경로(목록에 있는 것 그대로). 적을수록 좋다."), why: z.string() });
const { output: chosen } = await ai.generateStructuredOutput({
  systemInstructions: "너는 로키(AI 회사)의 개발자다. 아래 제안을 코드로 옮기려면 어느 파일을 고쳐야 하는지 **목록에서** 1~3개 고른다. 새 파일은 못 만든다. 파일 이름·경로로 추측하되, 제안이 가리키는 자리(자·프롬프트·재시도·직원)를 우선한다. 답은 JSON 하나.",
  input: `## 제안${NL}${p.이름}${NL}근거: ${p.근거}${NL}자: ${p.자}${NL}${NL}## 파일 목록${NL}${candidates.join(NL)}`,
  schema: pickSchema, schemaName: "pick_files", maxTokens: 16000, tier: "judgment",
});
const files = chosen.files.filter((f) => candidates.includes(f));
if (!files.length) { log(`고른 파일이 목록에 없다: ${chosen.files.join(", ")}`); process.exit(1); }
log(`손댈 파일(${files.length}): ${files.join(", ")} — ${chosen.why}`);

// 2) 조각으로 고친다
const full = files.map((f) => ({ path: f, language: f.endsWith(".mts") ? "typescript" : "typescript", contents: readFileSync(f, "utf8") }));
const r = await buildPatch(ai, {
  title: "로키 자가 고침", ask: `${p.이름}${NL}근거: ${p.근거}${NL}이 일이 됐는지는 이렇게 잰다: ${p.자}`,
  criteria: [{ id: "자", when: "고친 뒤", then: p.자 }, { id: "범위", when: "언제나", then: "제안이 말한 자리만 고친다. 다른 줄은 한 글자도 바꾸지 않는다." }],
  failedChecks: [], full, rest: [],
});
if (!r.ok) { log(`조각이 안 맞았다(${r.failures.length}개): ${r.failures.map((f) => `${f.path} ${f.reason}`).join(", ")}`); record("조각 안 맞음", files, 0, "-", await spent()); process.exit(1); }
const facts = changeFacts(full, r.files.map((f) => ({ path: f.path, contents: f.contents })));
log(`바뀐 줄 ${r.changedLines}/${r.totalLines} (물어본 횟수 ${r.asked})`);
for (const e of r.patch.edits) log(`  · ${e.path}: ${e.why}`);

// 3) 붙이고 문을 지난다
const before = new Map(full.map((f) => [f.path, f.contents]));
for (const f of r.files) if (before.get(f.path) !== f.contents) writeFileSync(f.path, f.contents, "utf8");
const changed = r.files.filter((f) => before.get(f.path) !== f.contents).map((f) => f.path);
const revert = () => { for (const f of changed) writeFileSync(f, before.get(f)!, "utf8"); log("되돌렸다."); };
if (!changed.length) { log("바뀐 것이 없다."); process.exit(0); }
if (DRY) { revert(); record("dry(되돌림)", changed, r.changedLines, "-", await spent()); process.exit(0); }

const gate: string[] = [];
const tsc = spawnSync("npx", ["tsc", "--noEmit", "-p", "."], { encoding: "utf8", shell: true, timeout: 600_000 });
const tsErr = (tsc.stdout + tsc.stderr).split(NL).filter((l) => /error TS/.test(l));
gate.push(`tsc ${tsErr.length ? `오류 ${tsErr.length}` : "0"}`); log(`문 1 tsc: ${tsErr.length ? "오류 " + tsErr.length : "깨끗"}`); if (tsErr.length) log(tsErr.slice(0, 5).join(NL));
let probesOk = false;
if (!tsErr.length) {
  const pr = spawnSync("npx", ["tsx", "engine/tools/rookery_env.mts", "engine/tools/probe_all.mts", "--fast"], { encoding: "utf8", shell: true, timeout: 900_000 });
  probesOk = pr.status === 0; const tail = (pr.stdout + pr.stderr).split(NL).filter((l) => /\d+\/\d+ 통과/.test(l)).pop() ?? "?";
  gate.push(`probe_all ${probesOk ? "통과" : "실패"} (${tail})`); log(`문 2 probe_all: ${tail}`);
}
let judge = "안 봄";
if (!tsErr.length && probesOk) {
  const v = await judgeAsk(ai, { said: `${p.이름} — ${p.근거}`, facts });
  judge = `${v.verdict.verdict}(${v.verdict.sizeMatch}·${v.verdict.fixedTheThing})`;
  gate.push(`심판 ${judge}`); log(`문 3 심판자: ${judge} — ${v.verdict.toPerson}`);
}
const pass = !tsErr.length && probesOk && /내보낸다/.test(judge);
const usd = await spent();
if (!pass) { revert(); record(`문 안 지남: ${gate.join(" · ")}`, changed, r.changedLines, judge, usd); process.exit(1); }

// 4) 로컬 커밋만
git("add", ...changed);
git("commit", "-q", "-m", `self-fix: ${p.이름.slice(0, 60)}${NL}${NL}근거: ${p.근거.slice(0, 200)}${NL}자: ${p.자.slice(0, 200)}${NL}문: ${gate.join(" · ")}${NL}${NL}로키 자가 고침(engine/tools/self_fix.mts)`);
const sha = git("rev-parse", "--short", "HEAD");
record(`커밋 ${sha}`, changed, r.changedLines, judge, usd);
log(`${NL}커밋 ${sha} — push·배포는 안 했다. 배포하려면: sh engine/tools/deploy.sh rookery-worker (웹이면 rookery-web)`);

async function spent() { const db = createServiceClient(); const { data } = await db.from("model_usage").select("cost_usd").eq("company_id", CO).gte("created_at", new Date(t0).toISOString()).limit(500); return ((data ?? []) as { cost_usd: number }[]).reduce((s, u) => s + Number(u.cost_usd ?? 0), 0); }
function record(result: string, fs: string[], lines: number, j: string, usd: number) {
  mkdirSync("engine/docs/genesis", { recursive: true });
  const path = "engine/docs/genesis/self-fix.md";
  if (!existsSync(path)) writeFileSync(path, `# 로키 자가 고침 원장 — 제안 → 코드 (221회차 09-25 시작)${NL}${NL}| 때 | 제안 | 파일 | 바뀐 줄 | 심판 | 결과 | 값 | 소요 |${NL}|---|---|---|---|---|---|---|---|${NL}`, "utf8");
  appendFileSync(path, `| ${new Date().toISOString().slice(0, 16).replace("T", " ")} | ${p.이름.slice(0, 60)} | ${fs.join(", ")} | ${lines} | ${j} | ${result} | $${usd.toFixed(3)} | ${Math.round((Date.now() - t0) / 1000)}초 |${NL}`, "utf8");
}
