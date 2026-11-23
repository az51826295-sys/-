/**
 * 싼 AI + 심판자 + 올리기 vs 싼 혼자 vs 비싼 혼자 — 수능 꼴 65문항(11-23).
 * 설계·판정식: engine/docs/judge-loop-bench-design.md (먼저 잠금).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judge_loop_bench.mts --arm cheap
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judge_loop_bench.mts --arm rest
 *
 * 결과는 engine/work/judge-loop/<팔>.json 에 쌓는다(rest 는 cheap.json 을 읽어 C 를 만든다).
 */
import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
const { costOf } = await import("../../src/lib/costs/pricing");

const arg = (n: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const ARM = arg("--arm") ?? "cheap";
const CHEAP = arg("--cheap") ?? "gpt-5.6-luna";
const BIG = arg("--big") ?? "gpt-5";
const JUDGE = arg("--judge") ?? "gpt-5.6-luna";
const LIMIT = Number(arg("--limit") ?? 0);
const DIR = "engine/work/judge-loop";
mkdirSync(DIR, { recursive: true });

type Q = { 번호: number; 과목: string; 배점: number; 문제: string; 정답: string; 검산방식: string; 시험지: string };
const load = (p: string, tag: string) =>
  (JSON.parse(readFileSync(p, "utf-8")) as { 문항: Q[] }).문항.map((q) => ({ ...q, 시험지: tag }));
let QS: Q[] = [...load("engine/data/suneung-v0.json", "v0"), ...load("engine/data/suneung-killer-v0.json", "killer")];
if (LIMIT) QS = QS.slice(0, LIMIT);
const key = (q: Q) => `${q.시험지}#${q.번호}`;
const 만점 = QS.reduce((a, q) => a + q.배점, 0);

/** suneung_bench 와 같은 말 — 지시문이 다르면 모델이 아니라 프롬프트를 비교한 것이 된다. */
const SYS = [
  "너는 고3 학생에게 알려 준다. 한국어로.",
  "",
  "- **끝까지 풀어라.** 어림잡지 말고, 답이 정해질 때까지 계산한다.",
  "- 계산은 **다른 길로 한 번 더** 확인한다. 두 길이 다르면 어느 쪽이 틀렸는지 찾아라 — 골라잡지 마라.",
  "- 답과 **어떻게 나왔는지**를 같이 쓴다. 학생이 다음 문제를 혼자 풀 수 있을 만큼.",
  "- 끝까지 못 갔으면 **어디서 막혔는지 그대로 말한다.** 짐작을 답처럼 내놓지 마라.",
  "- 짧게. 필요한 단계만.",
  "",
  "`답` 칸에는 **숫자만** 적는다. 분수는 a/b 로. 단위·문장·기호를 넣지 마라.",
].join("\n");
const solveSchema = z.object({ 답: z.string(), 풀이: z.string() });

const JUDGE_SYS = [
  "너는 채점관이다. 학생의 풀이와 답이 맞는지 **스스로 확인**한다. 정답표는 없다.",
  "",
  "- 풀이를 그대로 믿지 마라. 핵심 계산을 **직접 다시** 하고, 가능하면 다른 길(대입·경우 세기·역산)로 답을 확인한다.",
  "- 확인해서 맞으면 `ok`. 틀린 곳을 찾았으면 `wrong`. 끝까지 확인하지 못했으면 `unsure` — 짐작으로 ok 를 주지 마라.",
  "- `이유` 는 한두 문장.",
].join("\n");
const judgeSchema = z.object({ 판정: z.enum(["ok", "wrong", "unsure"]), 이유: z.string() });

function 값(t: string): number | null {
  const s = t
    .replace(/\\d?frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\(left|right|,|;|!|\s)/g, "")
    .replace(/[≈=、,\s개가지원점]/g, "")
    .replace(/[()]/g, "");
  if (/^[+-]?\d+(\.\d+)?\/[+-]?\d+(\.\d+)?$/.test(s)) {
    const [a, b] = s.split("/").map(Number);
    return b === 0 ? null : a / b;
  }
  return /^[+-]?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
const 맞나 = (답: string, q: Q) => {
  const g = 값(답), e = 값(q.정답);
  return g !== null && e !== null && Math.abs(g - e) < 1e-9;
};

type Call = { out: Record<string, string> | null; usd: number; err?: string };
async function call(model: string, sys: string, input: string, schema: z.ZodTypeAny, name: string): Promise<Call> {
  const ai = createOpenAIProvider({ judgmentModel: model });
  try {
    const r = await ai.generateStructuredOutput({ systemInstructions: sys, input, schema, schemaName: name, maxTokens: 16000, tier: "judgment" });
    return { out: r.output as Record<string, string>, usd: costOf({ backend: model, inputTokens: r.inputTokens, outputTokens: r.outputTokens }) };
  } catch (e) {
    const x = e as { inputTokens?: number; outputTokens?: number; message?: string };
    const usd = x.inputTokens != null ? costOf({ backend: model, inputTokens: x.inputTokens ?? 0, outputTokens: x.outputTokens ?? 0 }) : 0;
    return { out: null, usd, err: String(x.message ?? e).slice(0, 60) };
  }
}
async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); } }));
  return out;
}
type Row = { k: string; 배점: number; 답: string; 풀이?: string; ok: boolean; usd: number; 판정?: string; 이유?: string; 올림?: boolean };
const solve = (model: string) => async (q: Q): Promise<Row> => {
  const c = await call(model, SYS, q.문제, solveSchema, "suneung");
  const 답 = c.out?.답 ?? `(떨어짐 ${c.err})`;
  return { k: key(q), 배점: q.배점, 답, 풀이: c.out?.풀이 ?? "", ok: 맞나(답, q), usd: c.usd };
};
const sum = (rs: Row[]) => ({ 점수: rs.filter((r) => r.ok).reduce((a, r) => a + r.배점, 0), usd: rs.reduce((a, r) => a + r.usd, 0) });

if (ARM === "cheap") {
  const rs = await pool(QS, 6, solve(CHEAP));
  writeFileSync(`${DIR}/cheap.json`, JSON.stringify({ model: CHEAP, rows: rs }, null, 1));
  const s = sum(rs);
  const 틀림 = rs.filter((r) => !r.ok);
  console.log(`A 싼 혼자 ${CHEAP}: ${s.점수}/${만점} · $${s.usd.toFixed(4)} · 틀린 문항 ${틀림.length}`);
  for (const r of 틀림) console.log(`  틀림 ${r.k}(${r.배점}) "${r.답.slice(0, 20)}"`);
  console.log(틀림.length < 4 ? "→ 잠근 규칙: 4개 미만 — 본판 안 돌림" : "→ 본판 돌림 가능(--arm rest)");
} else if (ARM === "rest") {
  if (!existsSync(`${DIR}/cheap.json`)) throw new Error("cheap.json 먼저");
  const A: Row[] = JSON.parse(readFileSync(`${DIR}/cheap.json`, "utf-8")).rows;
  const byK = new Map(QS.map((q) => [key(q), q]));
  const [B, C] = await Promise.all([
    pool(QS, 4, solve(BIG)),
    pool(A, 4, async (a): Promise<Row> => {
      const q = byK.get(a.k)!;
      // 심판에게는 문제·학생 풀이·답만 준다. 정답·채점 결과는 안 준다(블라인드).
      const 떨어짐 = a.답.startsWith("(떨어짐");
      const j: Call = 떨어짐 ? { out: null, usd: 0 }
        : await call(JUDGE, JUDGE_SYS, `문제:\n${q.문제}\n\n학생의 풀이:\n${a.풀이 ?? ""}\n\n학생의 답: ${a.답}`, judgeSchema, "judge");
      const 판정 = j.out?.판정 ?? "unsure";
      if (판정 === "ok") return { ...a, usd: a.usd + j.usd, 판정, 이유: j.out?.이유, 올림: false };
      const up = await solve(BIG)(q);
      return { k: a.k, 배점: a.배점, 답: up.답, ok: up.ok, usd: a.usd + j.usd + up.usd, 판정, 이유: j.out?.이유, 올림: true };
    }),
  ]);
  writeFileSync(`${DIR}/big.json`, JSON.stringify({ model: BIG, rows: B }, null, 1));
  writeFileSync(`${DIR}/loop.json`, JSON.stringify({ cheap: CHEAP, judge: JUDGE, big: BIG, rows: C }, null, 1));
  const sa = sum(A), sb = sum(B), sc = sum(C);
  const aOk = new Map(A.map((r) => [r.k, r.ok]));
  const 헛통과 = C.filter((r) => r.판정 === "ok" && !aOk.get(r.k)).length;
  const 헛경보 = C.filter((r) => r.판정 !== "ok" && aOk.get(r.k)).length;
  const 올림 = C.filter((r) => r.올림).length;
  console.log(`A 싼 혼자   ${sa.점수}/${만점} · $${sa.usd.toFixed(4)}`);
  console.log(`B 비싼 혼자 ${sb.점수}/${만점} · $${sb.usd.toFixed(4)}`);
  console.log(`C 고리      ${sc.점수}/${만점} · $${sc.usd.toFixed(4)} · 올림 ${올림}/${C.length} · 헛통과 ${헛통과} · 헛경보 ${헛경보}`);
  const ok1 = sc.점수 >= sb.점수 - 4, ok2 = sc.usd <= sb.usd * 0.5, ok3 = 헛통과 <= 1;
  console.log(`판정: ①점수 ${ok1 ? "✓" : "✗"} ②값 ${(sc.usd / sb.usd * 100).toFixed(0)}% ${ok2 ? "✓" : "✗"} ③헛통과 ${ok3 ? "✓" : "✗"} → ${ok1 && ok2 && ok3 ? "선다" : "안 선다"}`);
  for (const r of B.filter((r) => !r.ok)) console.log(`  B 틀림 ${r.k} "${r.답.slice(0, 20)}"`);
  for (const r of C.filter((r) => !r.ok)) console.log(`  C 틀림 ${r.k} 판정=${r.판정} 올림=${r.올림} "${r.답.slice(0, 20)}"`);
}
