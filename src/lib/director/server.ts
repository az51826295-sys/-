/**
 * **판단 엔진 MCP 서버 본체** — 저장소 도구(`engine/tools/director_mcp.mts`)와 설치용 꾸러미(`packages/director`)가
 * **같은 이 코드**를 부른다(11-21, 사장님 "C 바로" — 엔진을 바로 상품으로). 두 벌로 베끼면 한쪽만 고치게 된다.
 *
 * 도구 셋: director_decide · director_record · director_scorecard. 일은 부른 쪽이 하고 엔진은 정하고 채점한다.
 * 장부는 손님 컴퓨터의 파일(`home`). 규약: 표준출력은 JSON-RPC 만, 로그는 표준오류.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import type { AIProvider } from "../providers/types";
import { gate, usedThisMonth, type LicenseConfig } from "./license";
import { decide, scorecard, tally, roundsOf, EFFORTS, escalate, type Seat, type LedgerEntry } from "./index";

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
    { id: "haiku", outPerMTok: 0.5, sees: true, note: "제일 싸고 빠르다. 찾기·읽기·작은 고침." },
    { id: "sonnet", outPerMTok: 10, sees: true, note: "보통의 코딩·도구 일." },
    { id: "opus", outPerMTok: 20, sees: true, note: "어렵고 긴 일. 클로드 코드의 기본." },
    { id: "fable", outPerMTok: 40, sees: true, note: "제일 비싸다. 아주 어려운 추론." },
  ],
  openai: [
    { id: "gpt-5.6-luna", outPerMTok: 1.2, sees: true, note: "싸다." },
    { id: "gpt-5-mini", outPerMTok: 2, sees: true, note: "싸다." },
    { id: "gpt-5", outPerMTok: 10, sees: true, note: "형식을 잘 지킨다." },
    { id: "gpt-5.3-codex", outPerMTok: 14, note: "코드 전용. 그림 못 봄." },
  ],
};

function 읽기<T>(f: string, 기본: T): T {
  try { return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : 기본; } catch (e) { throw new Error(`${f} 를 못 읽었다 — 손으로 고친 JSON 이 깨졌나? (${(e as Error).message})`); }
}
function 쓰기(f: string, v: unknown) { const t = `${f}.tmp`; writeFileSync(t, JSON.stringify(v, null, 1)); renameSync(t, f); }

function 자리(): Seat[] {
  if (!existsSync(자리파일)) 쓰기(자리파일, PRESETS[opts.preset ?? "claude-code"] ?? PRESETS["claude-code"]);
  const s = 읽기<Seat[]>(자리파일, []);
  if (!Array.isArray(s) || !s.length) throw new Error(`${자리파일} 에 AI 가 하나도 없다`);
  return s;
}
const 장부 = (): Row[] => 읽기<Row[]>(장부파일, []);

/* ─────────────── 판단자 ─────────────── */

const BRAIN = opts.brainModel;
async function 판단자(): Promise<{ ai: AIProvider; meter: Meter }> {
  if (BRAIN === "mock") return { ai: { name: "mock", model: "mock", async generateStructuredOutput() { throw new Error("mock 판단자 — 모델을 안 부른다"); } } as never, meter: () => 0 };
  const ai = await opts.makeBrain(BRAIN);
  if (!ai) throw new Error(`판단자 ${BRAIN} 를 못 앉혔다 — 열쇠가 없다(OPENAI_API_KEY)`);
  return { ai, meter: opts.meter };
}

/* ─────────────── 도구 ─────────────── */

const TOOLS = [
  {
    name: "director_decide",
    description: "일 하나를 어느 AI 에, 얼마나 공들여(고치기 바퀴 수) 맡길지 정한다. 통과 확률을 먼저 적어 잠근다. " +
      "돌려준 id 로 일이 끝난 뒤 director_record 를 꼭 불러야 판단이 채점되고 다음 판단이 나아진다. " +
      "kind 는 같은 종류끼리 성적을 세는 낱말이다(예: 게임, 고침, 문서, 찾기) — 같은 종류엔 늘 같은 낱말을 써라.",
    inputSchema: { type: "object", properties: {
      task: { type: "string", description: "맡길 일. 한두 문장이면 된다." },
      kind: { type: "string", description: "일의 종류 낱말." },
    }, required: ["task", "kind"] },
  },
  {
    name: "director_record",
    description: "director_decide 로 정한 일의 결과를 적는다. passed 는 확인을 다 통과했나(부른 쪽이 정한 확인 — 자기 보고 말고 실제로 돌려 본 것). " +
      "값을 모르면 outTokens(출력 토큰 수)를 주면 그 AI 단가로 어림한다.",
    inputSchema: { type: "object", properties: {
      id: { type: "string" },
      passed: { type: "boolean" },
      met: { type: "number", description: "통과한 확인 수(선택)" },
      total: { type: "number", description: "전체 확인 수(선택)" },
      usd: { type: "number", description: "일에 든 돈(선택)" },
      outTokens: { type: "number", description: "usd 를 모를 때 출력 토큰 수(선택)" },
      sec: { type: "number", description: "걸린 초(선택)" },
      seat: { type: "string", description: "정해 준 것과 다른 AI 로 했다면 실제로 쓴 것(선택)" },
    }, required: ["id", "passed"] },
  },
  {
    name: "director_scorecard",
    description: "성적표: 판단이 얼마나 맞았나(Brier), 판단에 든 값과 그 몫, 장부로 바로 정한 판, 평소 쓰던 AI 대비 아낀 돈(어림), AI×종류별 성적.",
    inputSchema: { type: "object", properties: {
      baseline: { type: "string", description: "엔진 없이 늘 쓰던 AI 의 id(기본: 목록에서 제일 비싼 것)" },
    } },
  },
];

const 글 = (t: string) => ({ content: [{ type: "text", text: t }] });

/**
 * 종류 낱말이 갈리면 장부가 영영 못 답한다(11-20 첫 판: 10판이 종류 넷으로 갈려 빠른 길 0번).
 * 처음 보는 낱말이면 장부에 있는 낱말을 보여 준다 — 같은 일이면 그걸 쓰라고.
 */
function 종류알림(rows: Row[], kind: string): string {
  const 셈 = new Map<string, number>();
  for (const r of rows) if (r.kind !== kind) 셈.set(r.kind, (셈.get(r.kind) ?? 0) + 1);
  if (!셈.size || rows.some((r) => r.kind === kind && r.passed !== undefined)) return "";
  return `새 종류 "${kind}". 장부에 있는 종류: ${[...셈].map(([k, n]) => `${k}(${n})`).join(" · ")} — 같은 종류의 일이면 그 낱말을 써야 장부가 답한다.`;
}

async function 부르기(name: string, a: Record<string, unknown>) {
  if (name === "director_decide") {
    const task = String(a.task ?? "").trim(), kind = String(a.kind ?? "").trim();
    if (!task || !kind) throw new Error("task 와 kind 가 다 있어야 한다");
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
      `맡길 AI: ${d.seat} · 공들이기 ${d.effort}(고치기 ${roundsOf(d.effort)}바퀴) · 통과 예측 ${Math.round(d.predictedPass * 100)}% (잠금)`,
      `정한 길: ${d.via}${d.usd ? ` · 판단 값 $${d.usd.toFixed(4)}` : " · 판단 값 0"}`,
      `어림: ${d.estimate}`,
      `왜: ${d.why}`,
      d.risk ? `틀린다면: ${d.risk}` : "",
      d.guard ? `난간: ${d.guard}` : "",
      종류알림(rows, kind),
      "", `끝나면 director_record 로 id ${id} 의 결과를 적어 주세요.`,
    ].filter(Boolean).join("\n"));
  }
  if (name === "director_record") {
    const rows = 장부(), r = rows.find((x) => x.id === String(a.id));
    if (!r) throw new Error(`id ${a.id} 가 장부에 없다`);
    if (r.passed !== undefined) throw new Error(`id ${a.id} 는 이미 적혔다 — 판단 하나에 결과 하나`);
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
    const 적음 = `적었다: ${r.kind} → ${r.seat} ${r.passed ? "통과" : "실패"} · 예측 ${Math.round(r.predictedPass * 100)}% 의 오차 ${오차.toFixed(3)}${r.usd != null ? ` · $${r.usd.toFixed(4)}` : ""}`;
    if (r.passed) { 쓰기(장부파일, rows); return 글(적음); }
    // 떨어졌다 → 한 칸 위를 정해 **새 판으로** 장부에 연다(판단자 안 부름). 더 갈 데가 없으면 사람에게.
    const up = escalate(seats, rows, r);
    if (!up) { 쓰기(장부파일, rows); return 글(`${적음}\n더 올릴 자리가 없다 — 사람이 볼 때다(주문이 모호하거나, 확인이 틀렸을 수 있다).`); }
    const nid = randomBytes(4).toString("hex");
    rows.push({ id: nid, at: new Date().toISOString(), task: r.task, kind: r.kind, seat: up.seat, effort: up.effort, predictedPass: up.predictedPass, via: up.via, judgeUsd: 0 });
    쓰기(장부파일, rows);
    return 글([적음, "", `다시 시킬 판 id ${nid}`, `맡길 AI: ${up.seat} · 공들이기 ${up.effort}(고치기 ${roundsOf(up.effort)}바퀴) · 통과 예측 ${Math.round(up.predictedPass * 100)}% (잠금)`,
      `왜: ${up.why}`, `틀린다면: ${up.risk}`, "", `끝나면 director_record 로 id ${nid} 의 결과를 적어 주세요.`].join("\n"));
  }
  if (name === "director_scorecard") {
    const seats = 자리(), rows = 장부();
    const 제일비싼 = [...seats].sort((x, y) => (y.outPerMTok ?? 0) - (x.outPerMTok ?? 0))[0]?.id;
    const baseline = String(a.baseline ?? 제일비싼 ?? "");
    const s = scorecard(rows, { seats, baseline });
    const 열린 = rows.filter((r) => r.passed === undefined).length;
    const { bySeatKind } = tally(rows);
    const 줄 = [...bySeatKind.entries()].map(([k, t]) => `  ${k}: ${t.pass}/${t.n}${t.n < 5 ? " (판이 적다)" : ""} · 판당 $${(t.usd / t.n).toFixed(4)}`);
    return 글([
      `끝난 판 ${s.판} · 통과 ${s.통과}${열린 ? ` · 결과 안 적힌 판 ${열린}` : ""}`,
      `판단 맞힘(Brier, 0 이 완벽 · 0.25 가 동전): ${s.brier == null ? "아직 없음" : s.brier.toFixed(3)}` +
        (s.나아지나 ? ` · 앞 절반 ${s.나아지나.앞?.toFixed(3)} → 뒤 절반 ${s.나아지나.뒤?.toFixed(3)}` : ""),
      s.실력 == null
        ? `실력(늘 같은 확률을 찍는 판단자보다 나은가): 못 잼 — ${s.판 ? "아직 실패가 없어 \"늘 통과\" 라고 찍는 쪽이 완벽하다" : "끝난 판이 없다"}`
        : `실력(늘 ${Math.round((s.통과 / s.판) * 100)}% 를 찍는 판단자 대비): ${s.실력 >= 0 ? "+" : ""}${Math.round(s.실력 * 100)}% — ${s.실력 > 0 ? "낫다" : "못하다"} (바보 Brier ${s.바보brier?.toFixed(3)})`,
      `일 값 $${s.달러.toFixed(4)} · 판단 값 $${s.판단값.toFixed(4)}${s.판단몫 != null ? ` (몫 ${Math.round(s.판단몫 * 100)}%)` : ""} · 장부로 바로 정한 판 ${s.장부로} · 떠본 판 ${s.떠본판} · 올린 판 ${s.올린판}`,
      s.아낀어림 != null ? `${baseline} 로 다 돌렸다면 대비 아낀 돈(어림 — 토큰 수가 같다고 본 것): $${s.아낀어림.toFixed(4)}` : "",
      줄.length ? "AI × 종류:\n" + 줄.join("\n") : "",
      `장부: ${장부파일}`, `AI 목록(손으로 고쳐도 된다): ${자리파일}`,
    ].filter(Boolean).join("\n"));
  }
  throw new Error(`모르는 도구 ${name}`);
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
        catch (e) { return 답({ ...글(`못 했다: ${(e as Error).message}`), isError: true }); }
      }
      default:
        if (m.id === undefined) return; // 알림(notifications/*)은 답하지 않는다
        return 틀림(-32601, `모르는 메서드 ${m.method}`);
    }
  } catch (e) { 틀림(-32603, (e as Error).message); }
};
// 부른 쪽이 입력을 닫으면 하던 답을 다 보낸 뒤 끝난다 — 안 그러면 손님 컴퓨터에 고아 프로세스가 남는다(11-21).
let 도는중 = 0, 닫힘 = false;
const 끝나면 = () => { if (닫힘 && 도는중 === 0) process.stdout.write("", () => process.exit(0)); };
rl.on("line", (line) => { 도는중++; void 처리(line).finally(() => { 도는중--; 끝나면(); }); });
rl.on("close", () => { 닫힘 = true; 끝나면(); });
console.error(`[rookery-director] 장부 ${HOME} · 판단자 ${BRAIN} · 노력 ${EFFORTS.join("/")}`);

}
