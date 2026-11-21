/**
 * **판단 엔진 MCP 서버 본체** — 저장소 도구(`engine/tools/director_mcp.mts`)와 설치용 꾸러미(`packages/director`)가
 * **같은 이 코드**를 부른다(11-21, 사장님 "C 바로" — 엔진을 바로 상품으로). 두 벌로 베끼면 한쪽만 고치게 된다.
 *
 * 도구 셋: director_decide · director_record · director_scorecard. 일은 부른 쪽이 하고 엔진은 정하고 채점한다.
 * 장부는 손님 컴퓨터의 파일(`home`). 규약: 표준출력은 JSON-RPC 만, 로그는 표준오류.
 *
 * 11-22 사장님 "앞으론 영어로" — 손님에게 보이는 글은 전부 영어. 옛 장부의 한국어 값은 normalizeEntry 가 옮긴다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import type { AIProvider } from "../providers/types";
import { gate, usedThisMonth, type LicenseConfig } from "./license";
import { decide, scorecard, tally, roundsOf, EFFORTS, escalate, normalizeEntry, type Seat, type LedgerEntry } from "./index";

type Row = LedgerEntry & { id: string };
type Meter = (u: { model: string; inputTokens: number; outputTokens: number }) => number;

export type DirectorServerOptions = {
  /** 장부·자리 파일 폴더. */
  home: string;
  /** 판단자 모델 id. "mock" 이면 모델을 안 부른다(시험용). */
  brainModel: string;
  /** 자리 파일이 없을 때 처음 깔 목록 이름. */
  preset?: string;
  makeBrain: (model: string) => Promise<AIProvider | null>;
  meter: Meter;
  version?: string;
  /** 값 받는 문(license.ts). 없거나 buyUrl 이 없으면 판 수 제한 없음. */
  license?: LicenseConfig;
  /** 손님 키(보통 ROOKERY_LICENSE). */
  licenseKey?: string;
};

export function startDirectorServer(opts: DirectorServerOptions) {
// 표준출력을 지킨다 — 부르는 모듈이 console.log 를 써도 JSON-RPC 줄과 섞이지 않게.
console.log = (...a: unknown[]) => console.error(...a);
console.info = (...a: unknown[]) => console.error(...a);

/* ─────────────── 장부 · 자리 (손님 파일) ─────────────── */

const HOME = opts.home;
mkdirSync(HOME, { recursive: true });
const 자리파일 = join(HOME, "seats.json"), 장부파일 = join(HOME, "ledger.json");

const PRESETS: Record<string, Seat[]> = {
  // 클로드 코드의 하위 에이전트가 고를 수 있는 모델. 값은 출력 백만 토큰당(11-03 기준 Anthropic 값표).
  "claude-code": [
    { id: "haiku", outPerMTok: 0.5, sees: true, note: "Cheapest and fastest. Search, reading, small fixes." },
    { id: "sonnet", outPerMTok: 10, sees: true, note: "Everyday coding and tool work." },
    { id: "opus", outPerMTok: 20, sees: true, note: "Hard, long tasks. Claude Code's default." },
    { id: "fable", outPerMTok: 40, sees: true, note: "Most expensive. Very hard reasoning." },
  ],
  openai: [
    { id: "gpt-5.6-luna", outPerMTok: 1.2, sees: true, note: "Cheap." },
    { id: "gpt-5-mini", outPerMTok: 2, sees: true, note: "Cheap." },
    { id: "gpt-5", outPerMTok: 10, sees: true, note: "Follows formats well." },
    { id: "gpt-5.3-codex", outPerMTok: 14, note: "Code only. Cannot see images." },
  ],
};

function 읽기<T>(f: string, 기본: T): T {
  try { return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : 기본; } catch (e) { throw new Error(`could not read ${f} — was the JSON broken by a hand edit? (${(e as Error).message})`); }
}
function 쓰기(f: string, v: unknown) { const t = `${f}.tmp`; writeFileSync(t, JSON.stringify(v, null, 1)); renameSync(t, f); }

function 자리(): Seat[] {
  if (!existsSync(자리파일)) 쓰기(자리파일, PRESETS[opts.preset ?? "claude-code"] ?? PRESETS["claude-code"]);
  const s = 읽기<Seat[]>(자리파일, []);
  if (!Array.isArray(s) || !s.length) throw new Error(`${자리파일} has no AIs in it`);
  return s;
}
const 장부 = (): Row[] => 읽기<Row[]>(장부파일, []).map(normalizeEntry);

/* ─────────────── 판단자 ─────────────── */

const BRAIN = opts.brainModel;
async function 판단자(): Promise<{ ai: AIProvider; meter: Meter }> {
  if (BRAIN === "mock") return { ai: { name: "mock", model: "mock", async generateStructuredOutput() { throw new Error("mock judge — no model called"); } } as never, meter: () => 0 };
  const ai = await opts.makeBrain(BRAIN);
  if (!ai) throw new Error(`could not start judge ${BRAIN} — no key (OPENAI_API_KEY)`);
  return { ai, meter: opts.meter };
}

/* ─────────────── 도구 ─────────────── */

const TOOLS = [
  {
    name: "director_decide",
    description: "Decide which AI gets one task and how much effort (number of fix rounds). Locks a pass prediction first. " +
      "After the work is done, call director_record with the returned id — that is how the decision gets scored and later decisions improve. " +
      "`kind` is the word used to group tasks for scoring (e.g. game, fix, docs, search) — always use the same word for the same kind of task.",
    inputSchema: { type: "object", properties: {
      task: { type: "string", description: "The task to assign. One or two sentences is enough." },
      kind: { type: "string", description: "One word for the kind of task." },
    }, required: ["task", "kind"] },
  },
  {
    name: "director_record",
    description: "Record the result of a task decided with director_decide. `passed` = did it pass every check (checks the caller actually ran, not a self-report). " +
      "If you don't know the cost, pass outTokens (output token count) and it is estimated from that AI's price.",
    inputSchema: { type: "object", properties: {
      id: { type: "string" },
      passed: { type: "boolean" },
      met: { type: "number", description: "Number of checks passed (optional)" },
      total: { type: "number", description: "Total number of checks (optional)" },
      usd: { type: "number", description: "Money spent on the work (optional)" },
      outTokens: { type: "number", description: "Output tokens, when usd is unknown (optional)" },
      sec: { type: "number", description: "Seconds taken (optional)" },
      seat: { type: "string", description: "The AI actually used, if different from the one assigned (optional)" },
    }, required: ["id", "passed"] },
  },
  {
    name: "director_scorecard",
    description: "Scorecard: how accurate the decisions were (Brier), what judging cost and its share, runs decided straight from the ledger, money saved vs. your usual AI (estimate), and results per AI × kind.",
    inputSchema: { type: "object", properties: {
      baseline: { type: "string", description: "id of the AI you'd use without the engine (default: the most expensive in the list)" },
    } },
  },
];

const 글 = (t: string) => ({ content: [{ type: "text", text: t }] });
const 줄AI = (d: { seat: string; effort: string; predictedPass: number }) =>
  `Assign to: ${d.seat} · effort ${d.effort} (${roundsOf(d.effort)} fix round${roundsOf(d.effort) > 1 ? "s" : ""}) · predicted pass ${Math.round(d.predictedPass * 100)}% (locked)`;

/**
 * 종류 낱말이 갈리면 장부가 영영 못 답한다(11-20 첫 판: 10판이 종류 넷으로 갈려 빠른 길 0번).
 * 처음 보는 낱말이면 장부에 있는 낱말을 보여 준다 — 같은 일이면 그걸 쓰라고.
 */
function 종류알림(rows: Row[], kind: string): string {
  const 셈 = new Map<string, number>();
  for (const r of rows) if (r.kind !== kind) 셈.set(r.kind, (셈.get(r.kind) ?? 0) + 1);
  if (!셈.size || rows.some((r) => r.kind === kind && r.passed !== undefined)) return "";
  return `New kind "${kind}". Kinds in your ledger: ${[...셈].map(([k, n]) => `${k}(${n})`).join(" · ")} — use the same word for the same kind of task so the ledger can answer.`;
}

async function 부르기(name: string, a: Record<string, unknown>) {
  if (name === "director_decide") {
    const task = String(a.task ?? "").trim(), kind = String(a.kind ?? "").trim();
    if (!task || !kind) throw new Error("both task and kind are required");
    const seats = 자리(), rows = 장부();
    const 문 = await gate(HOME, usedThisMonth(rows), opts.licenseKey, opts.license ?? {});
    if (!문.ok) return { ...글(문.message), isError: true };
    const { ai, meter } = await 판단자();
    const d = await decide(ai, { task, kind, seats, ledger: rows }, meter);
    const id = randomBytes(4).toString("hex");
    rows.push({ id, at: new Date().toISOString(), task: task.slice(0, 500), kind, seat: d.seat, effort: d.effort,
      predictedPass: d.predictedPass, via: d.via, judgeUsd: d.usd });
    쓰기(장부파일, rows);
    return 글([
      `id ${id}`,
      줄AI(d),
      `Decided by: ${d.via}${d.usd ? ` · judge cost $${d.usd.toFixed(4)}` : " · judge cost $0"}`,
      `Estimate: ${d.estimate}`,
      `Why: ${d.why}`,
      d.risk ? `If wrong: ${d.risk}` : "",
      d.guard ? `Guard: ${d.guard}` : "",
      종류알림(rows, kind),
      "", `When done, record the result with director_record (id ${id}).`,
    ].filter(Boolean).join("\n"));
  }
  if (name === "director_record") {
    const rows = 장부(), r = rows.find((x) => x.id === String(a.id));
    if (!r) throw new Error(`id ${a.id} is not in the ledger`);
    if (r.passed !== undefined) throw new Error(`id ${a.id} is already recorded — one result per decision`);
    const seats = 자리();
    if (a.seat && String(a.seat) !== r.seat) r.seat = String(a.seat);
    r.passed = Boolean(a.passed);
    if (typeof a.met === "number" && typeof a.total === "number") r.score = { met: a.met, total: a.total };
    if (typeof a.usd === "number") r.usd = a.usd;
    else if (typeof a.outTokens === "number") {
      const p = seats.find((s) => s.id === r.seat)?.outPerMTok;
      if (p != null) r.usd = (a.outTokens / 1e6) * p;
    }
    if (typeof a.sec === "number") r.sec = a.sec;
    const 오차 = (r.predictedPass - (r.passed ? 1 : 0)) ** 2;
    const 적음 = `Recorded: ${r.kind} → ${r.seat} ${r.passed ? "passed" : "failed"} · predicted ${Math.round(r.predictedPass * 100)}%, error ${오차.toFixed(3)}${r.usd != null ? ` · $${r.usd.toFixed(4)}` : ""}`;
    if (r.passed) { 쓰기(장부파일, rows); return 글(적음); }
    // 떨어졌다 → 한 칸 위를 정해 **새 판으로** 장부에 연다(판단자 안 부름). 더 갈 데가 없으면 사람에게.
    const up = escalate(seats, rows, r);
    if (!up) { 쓰기(장부파일, rows); return 글(`${적음}\nNo higher AI or effort left — time for a person to look (the request may be vague, or the check may be wrong).`); }
    const nid = randomBytes(4).toString("hex");
    rows.push({ id: nid, at: new Date().toISOString(), task: r.task, kind: r.kind, seat: up.seat, effort: up.effort, predictedPass: up.predictedPass, via: up.via, judgeUsd: 0 });
    쓰기(장부파일, rows);
    return 글([적음, "", `Retry as id ${nid}`, 줄AI(up),
      `Why: ${up.why}`, `If wrong: ${up.risk}`, "", `When done, record the result with director_record (id ${nid}).`].join("\n"));
  }
  if (name === "director_scorecard") {
    const seats = 자리(), rows = 장부();
    const 제일비싼 = [...seats].sort((x, y) => (y.outPerMTok ?? 0) - (x.outPerMTok ?? 0))[0]?.id;
    const baseline = String(a.baseline ?? 제일비싼 ?? "");
    const s = scorecard(rows, { seats, baseline });
    const 열린 = rows.filter((r) => r.passed === undefined).length;
    const { bySeatKind } = tally(rows);
    const 줄 = [...bySeatKind.entries()].map(([k, t]) => `  ${k}: ${t.pass}/${t.n}${t.n < 5 ? " (few runs)" : ""} · $${(t.usd / t.n).toFixed(4)} per run`);
    return 글([
      `Finished ${s.판} · passed ${s.통과}${열린 ? ` · not yet recorded ${열린}` : ""}`,
      `Prediction accuracy (Brier; 0 = perfect, 0.25 = coin flip): ${s.brier == null ? "none yet" : s.brier.toFixed(3)}` +
        (s.나아지나 ? ` · first half ${s.나아지나.앞?.toFixed(3)} → second half ${s.나아지나.뒤?.toFixed(3)}` : ""),
      s.실력 == null
        ? `Skill (vs. a judge that always guesses the same rate): not measurable — ${s.판 ? "no failures yet, so guessing \"always pass\" is perfect" : "no finished runs"}`
        : `Skill (vs. always guessing ${Math.round((s.통과 / s.판) * 100)}%): ${s.실력 >= 0 ? "+" : ""}${Math.round(s.실력 * 100)}% — ${s.실력 > 0 ? "better" : "worse"} (baseline Brier ${s.바보brier?.toFixed(3)})`,
      `Work cost $${s.달러.toFixed(4)} · judging cost $${s.판단값.toFixed(4)}${s.판단몫 != null ? ` (share ${Math.round(s.판단몫 * 100)}%)` : ""} · decided from ledger ${s.장부로} · explored ${s.떠본판} · escalated ${s.올린판}`,
      s.아낀어림 != null ? `Saved vs. running everything on ${baseline} (estimate, assuming the same token count): $${s.아낀어림.toFixed(4)}` : "",
      줄.length ? "AI × kind:\n" + 줄.join("\n") : "",
      `Ledger: ${장부파일}`, `AI list (you can edit it): ${자리파일}`,
    ].filter(Boolean).join("\n"));
  }
  throw new Error(`unknown tool ${name}`);
}

/* ─────────────── JSON-RPC over stdio ─────────────── */

const 보내기 = (m: unknown) => process.stdout.write(JSON.stringify(m) + "\n");
const rl = createInterface({ input: process.stdin });
const 처리 = async (line: string) => {
  if (!line.trim()) return;
  let m: { id?: number | string; method?: string; params?: Record<string, unknown> };
  try { m = JSON.parse(line); } catch { return 보내기({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
  const 답 = (result: unknown) => m.id !== undefined && 보내기({ jsonrpc: "2.0", id: m.id, result });
  const 틀림 = (code: number, message: string) => m.id !== undefined && 보내기({ jsonrpc: "2.0", id: m.id, error: { code, message } });
  try {
    switch (m.method) {
      case "initialize":
        return 답({ protocolVersion: (m.params?.protocolVersion as string) ?? "2024-11-05", capabilities: { tools: {} },
          serverInfo: { name: "rookery-director", version: opts.version ?? "0.1.0" } });
      case "ping": return 답({});
      case "tools/list": return 답({ tools: TOOLS });
      case "tools/call": {
        const p = m.params as { name: string; arguments?: Record<string, unknown> };
        try { return 답(await 부르기(p.name, p.arguments ?? {})); }
        catch (e) { return 답({ ...글(`Failed: ${(e as Error).message}`), isError: true }); }
      }
      default:
        if (m.id === undefined) return; // 알림(notifications/*)은 답하지 않는다
        return 틀림(-32601, `unknown method ${m.method}`);
    }
  } catch (e) { 틀림(-32603, (e as Error).message); }
};
// 부른 쪽이 입력을 닫으면 하던 답을 다 보낸 뒤 끝난다 — 안 그러면 손님 컴퓨터에 고아 프로세스가 남는다(11-21).
let 도는중 = 0, 닫힘 = false;
const 끝나면 = () => { if (닫힘 && 도는중 === 0) process.stdout.write("", () => process.exit(0)); };
rl.on("line", (line) => { 도는중++; void 처리(line).finally(() => { 도는중--; 끝나면(); }); });
rl.on("close", () => { 닫힘 = true; 끝나면(); });
console.error(`[rookery-director] ledger ${HOME} · judge ${BRAIN} · effort ${EFFORTS.join("/")}`);

}
