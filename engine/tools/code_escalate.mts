/**
 * **코딩 증거 판** — 싼 AI + 기계 확인(공개 테스트) + 올려 보내기 vs 비싼 AI (11-23, 사장님 "해" · "GO").
 * 설계·판정식: engine/docs/code-escalate-design.md (돌리기 전 잠금).
 *
 *   npx tsx engine/tools/code_escalate.mts --mock            ← 모델 0: 채점기가 가르는지(심은 답)
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/code_escalate.mts --scout   ← C1(flash) 만 40문제
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/code_escalate.mts --main    ← E1(pro)·D3 추가 flash, 판정
 *
 * 재료: engine/data/lcb/set40.json (engine/tools/py/lcb_pick.py 가 고정 씨앗으로 뽑음).
 * 상한: $2 (사장님 GO 한 어림의 위 끝) — 정찰+본판 합. 닿으면 다음 호출을 안 한다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, "");
}
const MODE = process.argv.includes("--mock") ? "mock" : process.argv.includes("--scout") ? "scout" : process.argv.includes("--main") ? "main" : "";
if (!MODE) { console.error("--mock | --scout | --main"); process.exit(1); }
if (MODE !== "mock" && process.env.GENESIS_SPEND !== "i-approve") { console.error("GENESIS_SPEND=i-approve 없음"); process.exit(1); }

type T = { input: string; output: string };
type P = { id: string; title: string; difficulty: string; question: string; public: T[]; private: T[] };
const 문제들: P[] = JSON.parse(readFileSync("engine/data/lcb/set40.json", "utf8"));
const DIR = "engine/work/code-escalate";
mkdirSync(DIR, { recursive: true });
const 장부파일 = `${DIR}/answers.json`;
type 답 = { code: string | null; inTok: number; outTok: number; cost: number; err?: string; pub?: boolean; all?: boolean; ms?: number };
const 장부: Record<string, Record<string, 답>> = existsSync(장부파일) && MODE !== "mock" ? JSON.parse(readFileSync(장부파일, "utf8")) : {};
const 상한 = 2.0;
const 쓴돈 = () => Object.values(장부).flatMap((x) => Object.values(x)).reduce((s, a) => s + a.cost, 0);

// ── 값: 공시 가격(11-23), 오프피크 반값. 피크 = UTC 01–04·06–10, 월~금 ──
const 가격 = { "deepseek-flash": { in: 0.3, out: 1.2 }, "deepseek-v4-pro": { in: 1.32, out: 3.96 } } as const;
function 피크(d = new Date()) { const h = d.getUTCHours(), w = d.getUTCDay(); return w >= 1 && w <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10)); }
function 값(model: keyof typeof 가격, i: number, o: number) { const k = 피크() ? 1 : 0.5; return (i * 가격[model].in + o * 가격[model].out) / 1e6 * k; }

// ── 코드 돌리기: python -I, 임시 폴더, 테스트당 10초 ──
const 같다 = (a: string, b: string) => a.replace(/\r/g, "").split("\n").map((x) => x.trimEnd()).join("\n").trim() === b.replace(/\r/g, "").split("\n").map((x) => x.trimEnd()).join("\n").trim();
function 돌려(code: string, input: string): Promise<string | null> {
  const d = mkdtempSync(join(tmpdir(), "ce-"));
  writeFileSync(join(d, "sol.py"), code);
  return new Promise((res) => {
    const p = spawn("python", ["-I", "sol.py"], { cwd: d, stdio: ["pipe", "pipe", "pipe"] });
    let out = ""; let 끝 = false;
    const t = setTimeout(() => { if (!끝) { 끝 = true; p.kill(); res(null); } }, 10_000);
    p.stdout.on("data", (x) => { out += x; if (out.length > 5e6) { p.kill(); } });
    p.on("close", () => { if (끝) return; 끝 = true; clearTimeout(t); res(out); });
    p.on("error", () => { if (!끝) { 끝 = true; clearTimeout(t); res(null); } });
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  }).finally(() => { try { rmSync(d, { recursive: true, force: true }); } catch { /* */ } }) as Promise<string | null>;
}
async function 통과(code: string, tests: T[]): Promise<boolean> {
  for (const t of tests) { const o = await 돌려(code, t.input); if (o === null || !같다(o, t.output)) return false; }
  return true;
}

// ── 모델 부르기 ──
const 지시 = "Solve the following competitive programming problem in Python 3. Read from standard input and write to standard output. Reply with the complete program in a single ```python code block.";
function 코드뽑기(s: string): string | null { const m = [...s.matchAll(/```(?:python|py)?\s*\n([\s\S]*?)```/g)]; return m.length ? m[m.length - 1][1] : null; }
async function 부르기(model: keyof typeof 가격, p: P): Promise<답> {
  const 생각 = model === "deepseek-v4-pro";
  const t0 = Date.now();
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model, max_tokens: 생각 ? 32000 : 8000, thinking: { type: 생각 ? "enabled" : "disabled" },
        messages: [{ role: "system", content: 지시 }, { role: "user", content: p.question }] }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!r.ok) return { code: null, inTok: 0, outTok: 0, cost: 0, err: `HTTP ${r.status}: ${(await r.text()).slice(0, 120)}` };
    const j = await r.json() as { choices: { message: { content: string } }[]; usage: { prompt_tokens: number; completion_tokens: number } };
    const i = j.usage?.prompt_tokens ?? 0, o = j.usage?.completion_tokens ?? 0;
    return { code: 코드뽑기(j.choices?.[0]?.message?.content ?? ""), inTok: i, outTok: o, cost: 값(model, i, o), ms: Date.now() - t0 };
  } catch (e) { return { code: null, inTok: 0, outTok: 0, cost: 0, err: e instanceof Error ? e.message.slice(0, 120) : "오류" }; }
}

async function 채우기(칸: string, model: keyof typeof 가격, 대상: P[], 동시 = 8) {
  const 할것 = 대상.filter((p) => !장부[p.id]?.[칸]);
  let k = 0;
  const 일꾼 = async () => {
    while (k < 할것.length) {
      const p = 할것[k++];
      if (쓴돈() > 상한) { console.log(`  상한 $${상한} — ${p.id} ${칸} 안 부름`); continue; }
      const a = await 부르기(model, p);
      if (a.code) { a.pub = await 통과(a.code, p.public); a.all = a.pub ? await 통과(a.code, [...p.public, ...p.private]) : false; }
      (장부[p.id] ??= {})[칸] = a;
      writeFileSync(장부파일, JSON.stringify(장부));
      process.stdout.write(a.err ? "x" : a.all ? "O" : a.pub ? "p" : ".");
    }
  };
  await Promise.all(Array.from({ length: 동시 }, 일꾼));
  console.log(`  ${칸} 끝 · 지금까지 $${쓴돈().toFixed(4)}`);
}

if (MODE === "mock") {
  // 심은 답 셋: 맞는 답(모든 입력→출력 표), 공개만 맞는 답(공개 표만), 틀린 답.
  let ok = 0;
  for (const p of 문제들.slice(0, 5)) {
    const 표 = (ts: T[]) => `import sys\nm=${JSON.stringify(Object.fromEntries(ts.map((t) => [t.input.trim(), t.output])))}\nprint(m.get(sys.stdin.read().strip(),'0'),end='')`;
    const 맞음 = await 통과(표([...p.public, ...p.private]), [...p.public, ...p.private]);
    const 공개만_공개 = await 통과(표(p.public), p.public);
    const 공개만_전부 = await 통과(표(p.public), [...p.public, ...p.private]);
    const 틀림 = await 통과("print(0)", p.public);
    const 좋다 = 맞음 && 공개만_공개 && !공개만_전부 && !틀림;
    console.log(`${p.id}: 맞는 답 ${맞음 ? "통과" : "떨어짐"} · 공개만 맞춘 답 공개 ${공개만_공개 ? "통과" : "떨어짐"}/전부 ${공개만_전부 ? "통과" : "떨어짐"} · 틀린 답 ${틀림 ? "통과" : "떨어짐"} → ${좋다 ? "채점기 맞음" : "**채점기 틀림**"}`);
    if (좋다) ok++;
  }
  console.log(`\n채점기 ${ok}/5`);
  process.exit(ok === 5 ? 0 : 1);
}

console.log(`${MODE} · ${피크() ? "피크" : "오프피크(반값)"} · 지금까지 $${쓴돈().toFixed(4)} / 상한 $${상한}`);
await 채우기("C1", "deepseek-flash", 문제들);
const 비율 = (칸: string) => 문제들.filter((p) => 장부[p.id]?.[칸]?.all).length;
const 못잼 = (칸: string) => 문제들.filter((p) => !장부[p.id]?.[칸] || 장부[p.id][칸].err).length;
console.log(`\nC1 flash 혼자: 통과 ${비율("C1")}/40 · 못 잼 ${못잼("C1")} · 공개 통과·비공개 실패 ${문제들.filter((p) => 장부[p.id]?.C1?.pub && !장부[p.id]?.C1?.all).length}`);
if (MODE === "scout") {
  const r = 비율("C1") / (40 - 못잼("C1") || 1);
  console.log(r >= 0.8 ? "→ 천장(80% 이상) — 설계대로 hard 만으로 다시 뽑는다" : "→ 천장 아님 — 본판(--main) 갈 수 있다");
  process.exit(0);
}

// ── 본판 ──
await 채우기("E1", "deepseek-v4-pro", 문제들, 6);
const C1공개실패 = 문제들.filter((p) => !장부[p.id]?.C1?.pub);
await 채우기("C1b", "deepseek-flash", C1공개실패);
const C1b실패 = C1공개실패.filter((p) => !장부[p.id]?.C1b?.pub);
await 채우기("C1c", "deepseek-flash", C1b실패);

const 셈 = 문제들.map((p) => {
  const a = 장부[p.id] ?? {};
  const c = a.C1, e = a.E1;
  const D = c?.pub ? { all: !!c.all, cost: c.cost } : { all: !!e?.all, cost: (c?.cost ?? 0) + (e?.cost ?? 0) };
  let D3 = { all: false, cost: 0 }, 고름 = false;
  for (const k of ["C1", "C1b", "C1c"]) { const x = a[k]; if (!x) continue; D3.cost += x.cost; if (x.pub) { D3.all = !!x.all; 고름 = true; break; } }
  if (!고름) { D3 = { all: !!e?.all, cost: D3.cost + (e?.cost ?? 0) }; }
  return { id: p.id, C1: { all: !!c?.all, cost: c?.cost ?? 0 }, E1: { all: !!e?.all, cost: e?.cost ?? 0 }, D, D3 };
});
const 합 = (k: "C1" | "E1" | "D" | "D3") => ({ n: 셈.filter((x) => x[k].all).length, cost: 셈.reduce((s, x) => s + x[k].cost, 0) });
const 표 = { C1: 합("C1"), E1: 합("E1"), D: 합("D"), D3: 합("D3") };
for (const [k, v] of Object.entries(표)) console.log(`  ${k.padEnd(3)} 통과 ${String(v.n).padStart(2)}/40 · 값 $${v.cost.toFixed(4)}`);
const 판 = (k: "D" | "D3") => 표[k].n >= 표.E1.n - 2 && 표[k].cost <= 표.E1.cost * 0.5 ? "이김" : "못 이김";
const 무효 = ["C1", "E1"].some((k) => 못잼(k) > 4);
console.log(`\n판정(잠근 식): D ${무효 ? "무효" : 판("D")} · D3 ${무효 ? "무효" : 판("D3")} · 못 잼 C1 ${못잼("C1")} E1 ${못잼("E1")} · 합계 $${쓴돈().toFixed(4)}`);
writeFileSync(`${DIR}/result.json`, JSON.stringify({ at: new Date().toISOString(), 표, 셈, 판정: { D: 판("D"), D3: 판("D3"), 무효 } }, null, 2));
