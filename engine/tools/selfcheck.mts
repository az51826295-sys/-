/**
 * 자가진단 — **회사가 자기 기록을 재는 자.**
 *
 * 사장님 09-08: "이걸로 시행착오학습, 자가진단학습."
 * 그날 엔진의 구멍 넷(자기를 분모에 넣던 조각 자, 안 지어진 씬을 재던 판, C# 을 안 보던 문법 그물,
 * 숫자 자에 참/거짓)을 **내가 로그를 읽어서** 찾았다. 그건 사람이 붙어 있어야만 도는 일이다 —
 * 화면이 그랬듯이. 그래서 자기 기록을 훑는 자를 놓는다.
 *
 * ## 규칙 둘
 * 1. **모델에게 묻지 않는다.** 전부 결정적인 셈이다. 판정이 의견이면 판정이 아니다.
 * 2. **"이상 없음"과 "본 게 없음"을 같이 적지 않는다.** 각 줄은 자기가 **몇 개를 봤는지**를 남긴다.
 *    0개를 보고 통과라고 말하는 자는 오늘 우리가 고친 그 고장(안 지어진 게임이 합격)과 같은 종류다.
 *
 * 실행: npx tsx engine/tools/selfcheck.mts [일수=7]
 */
import fs from "node:fs";

const NL = String.fromCharCode(10), CR = String.fromCharCode(13);
for (const raw of fs.readFileSync(".env.local", "utf8").split(NL)) {
  const l = raw.replace(CR, ""); const i = l.indexOf("=");
  if (i < 0 || l.startsWith("#")) continue;
  const k = l.slice(0, i).trim(); if (!(k in process.env)) process.env[k] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("@/lib/supabase/service");
const db = createServiceClient();

const DAYS = Number(process.argv[2] ?? 7);
const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();

type Finding = { what: string; evidence: string };
type Check = { name: string; looked: number; found: Finding[]; unit: string; note?: string };
const checks: Check[] = [];

function add(name: string, unit: string, looked: number, found: Finding[], note?: string) {
  checks.push({ name, unit, looked, found, note });
}

const short = (s: string | null | undefined, n = 60) => (s ?? "").replace(/\s+/g, " ").slice(0, n);

// ────────────────────────────────────────────────────────────────────
type Build = {
  id: string; title: string; created_at: string;
  content_json: {
    files?: { path: string; contents: string }[];
    keep?: string[];
    expectations?: { measure: string; min: number | null; max: number | null; equals: boolean | null }[];
    unityChecks?: { passed?: number; failed?: number; measures?: Record<string, unknown>; cases?: { name: string; result: string }[] };
  } | null;
};

const { data: buildRows } = await db
  .from("deliverables")
  .select("id, title, created_at, content_json")
  .eq("deliverable_type", "app_build")
  .gte("created_at", since)
  .order("created_at", { ascending: false });
const builds = (buildRows ?? []) as Build[];

// 1. 안 바뀐 파일을 다시 냈나 — `keep` 이 있는데 안 쓴다(09-08: 파일 16개, keep 0개).
{
  // `keep` 이 비었는지만 세면 **keep 만 채우고 파일은 그대로 다 내는** 식으로 속일 수 있다.
  // 그래서 지난 판과 **글자까지 같은 파일을 다시 냈는지**를 센다. 이건 못 속인다.
  const found: Finding[] = [];
  let looked = 0;
  const asc = [...builds].reverse();   // 오래된 것부터 — 앞 판과 견준다
  const lastByPath = new Map<string, string>();
  for (const b of asc) {
    const files = b.content_json?.files ?? [];
    if (files.length === 0) continue;
    looked++;
    let same = 0, sameKb = 0;
    for (const f of files) {
      const prev = lastByPath.get(f.path);
      if (prev !== undefined && prev === f.contents) { same++; sameKb += Math.round(f.contents.length / 1024); }
      lastByPath.set(f.path, f.contents);
    }
    if (same > 0) {
      found.push({
        what: `안 바뀐 파일 ${same}개(${sameKb} KB)를 다시 냈다`,
        evidence: `${b.created_at.slice(5, 16)} ${short(b.title, 36)}`,
      });
    }
  }
  found.reverse();   // 최근 것부터 보여 준다
  add("안 바뀐 파일을 다시 낸다", "지난 판과 견줄 수 있는 판", looked, found,
    "바꾸는 파일만 내면 되는데(`keep`) 매번 전부 다시 쓴다 — 시간과 돈이 여기서 샌다");
}

// 2. 한 파일이 너무 크다 — 큰 파일은 매 판 통째로 다시 쓰이고, 꼬리에서 코드가 망가진다.
{
  const found: Finding[] = [];
  const worst = new Map<string, number>();
  let looked = 0;
  for (const b of builds) {
    for (const f of b.content_json?.files ?? []) {
      looked++;
      const kb = Math.round(f.contents.length / 1024);
      if (kb >= 40 && kb > (worst.get(f.path) ?? 0)) worst.set(f.path, kb);
    }
  }
  for (const [path, kb] of [...worst.entries()].sort((a, b) => b[1] - a[1])) {
    found.push({ what: `${kb} KB`, evidence: path });
  }
  add("파일이 너무 크다", "낸 파일", looked, found,
    "40 KB 를 넘으면 한 판에 다시 쓰기 버겁다(≈1만 토큰). 쪼개면 시간·돈·잘림이 같이 좋아진다");
}

// 3. 판이 죽은 이유 — 잘림·시간 초과·연결 끊김은 "일이 커서" 나는 고장이다.
{
  const { data: ex } = await db
    .from("work_executions")
    .select("id, status, current_step, error_message, created_at")
    .eq("status", "failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  const rows = (ex ?? []) as { id: string; current_step: string | null; error_message: string | null; created_at: string }[];
  const found: Finding[] = [];
  for (const r of rows) {
    const m = (r.error_message ?? "").toLowerCase();
    const kind =
      m.includes("truncated") ? "출력 잘림" :
      m.includes("timed out") || m.includes("timeout") ? "시간 초과" :
      m.includes("terminated") || m.includes("fetch failed") ? "연결 끊김" :
      m.includes("balance") || m.includes("insufficient") ? "잔액 없음" : "";
    if (kind) found.push({ what: kind, evidence: `${r.created_at.slice(11, 16)} ${r.current_step ?? ""} — ${short(r.error_message, 70)}` });
  }
  add("일이 커서 죽은 판", "실패한 실행", rows.length, found,
    "이 셋은 증상이 다르고 뿌리가 같다 — 한 판이 너무 크다");
}

// 4. 자가 아무것도 못 잰 판 — 검사는 붙었는데 measures 가 비었다.
{
  // **거짓 경보를 먼저 뺀다.** 컴파일이 깨졌거나 씬을 못 지은 판은 못 재는 것이 맞다 —
  // 그것까지 걸면 이 자는 늑대를 잘못 외치고, 그러면 아무도 안 본다.
  // 그리고 자가 생기기 전(measures 를 아예 안 보내던 시절)의 판도 뺀다.
  const EXPLAINS = ["컴파일이_된다", "씬을_다시_지었다"];
  const everMeasured = builds.filter((b) => Object.keys(b.content_json?.unityChecks?.measures ?? {}).length > 0);
  const firstMeasuredAt = everMeasured.length ? everMeasured[everMeasured.length - 1].created_at : null;
  const withChecks = builds.filter(
    (b) => b.content_json?.unityChecks && (!firstMeasuredAt || b.created_at >= firstMeasuredAt),
  );
  const found: Finding[] = [];
  for (const b of withChecks) {
    const uc = b.content_json?.unityChecks;
    const m = uc?.measures ?? {};
    if (Object.keys(m).length > 0) continue;
    const explained = (uc?.cases ?? []).some((c) => c.result !== "Passed" && EXPLAINS.includes(c.name));
    if (explained) continue;   // 못 잰 이유가 판정에 적혀 있다 — 그건 제대로 된 것이다
    found.push({ what: "measures 가 비었는데 이유가 판정에 없다", evidence: `${b.created_at.slice(5, 16)} ${short(b.title, 40)}` });
  }
  add("자가 아무것도 못 쟀다", "자가 생긴 뒤의 검사 판", withChecks.length, found,
    "재지 못한 판이 통과로 세어지면 그 초록은 거짓이다. 못 잰 이유가 판정에 적혀 있으면 그건 정상이다");
}

// 4b. **아무 소식 없는 판** — 게임 판이 났는데 검사가 끝내 안 붙었다.
// 60회차: 시험 러너가 "씬을 저장할까요?" 창에서 batchmode 로 15분을 굳었다. 결과가 없으니
// **DB 에 행이 아예 안 생긴다** — 실패로도 안 보인다. 자가진단이 못 보던 사각지대가 여기였다.
// 조용히 사라진 판은 실패보다 나쁘다. 없는 것을 세려면 **있어야 할 것**에서 빼야 한다.
{
  const QUIET_MS = 90 * 60_000;   // 유니티가 가져가 재는 데 넉넉잡아
  const old = builds.filter((b) => Date.now() - new Date(b.created_at).getTime() > QUIET_MS);
  const found: Finding[] = [];
  for (const b of old) {
    if (b.content_json?.unityChecks) continue;
    found.push({ what: "판이 났는데 검사가 끝내 안 붙었다", evidence: `${b.created_at.slice(5, 16)} ${short(b.title, 40)}` });
  }
  add("소식 없이 사라진 판", "90분 넘은 게임 판", old.length, found,
    "실패도 아니고 통과도 아닌 판이다. 시험이 창에서 굳거나 유니티가 안 켜져 있으면 이렇게 된다");
}

// 5. 기대치의 모양이 틀렸다 — 숫자 자에 참/거짓(09-08 에 가짜 실패 두 줄을 냈다).
{
  const BOOL_MEASURES = new Set(["hud_score_visible", "part_covers_bone"]);
  let looked = 0;
  const found: Finding[] = [];
  for (const b of builds) {
    for (const e of b.content_json?.expectations ?? []) {
      looked++;
      if (typeof e.equals === "boolean" && !BOOL_MEASURES.has(e.measure)) {
        found.push({ what: `${e.measure} 에 참/거짓`, evidence: `${b.created_at.slice(11, 16)} ${short(b.title, 30)}` });
      }
      if (e.equals == null && e.min == null && e.max == null) {
        found.push({ what: `${e.measure} 에 위아래가 없다`, evidence: `${b.created_at.slice(11, 16)} ${short(b.title, 30)}` });
      }
    }
  }
  add("기대치 모양이 틀렸다", "기대치 줄", looked, found,
    "숫자 자에 참/거짓을 적으면 못 잰다. 위아래가 없으면 아무 값이나 통과한다");
}

// 6. 값이 안 움직인다 — 같은 값이 여러 판 이어지면 (가) 안 지어졌거나 (나) 문턱에 맞춰 굳었다.
{
  const series = new Map<string, { v: number; at: string }[]>();
  const measured = builds.filter((b) => Object.keys(b.content_json?.unityChecks?.measures ?? {}).length > 0);
  for (const b of [...measured].reverse()) {
    for (const [k, v] of Object.entries(b.content_json?.unityChecks?.measures ?? {})) {
      if (typeof v !== "number") continue;
      (series.get(k) ?? series.set(k, []).get(k)!).push({ v, at: b.created_at.slice(11, 16) });
    }
  }
  const found: Finding[] = [];
  for (const [k, xs] of series) {
    if (xs.length < 4) continue;
    const last = xs.slice(-4);
    if (last.every((x) => x.v === last[0].v)) {
      found.push({ what: `${k} 가 ${last.length}판 내리 ${last[0].v}`, evidence: last.map((x) => x.at).join(" · ") });
    }
  }
  add("값이 안 움직인다", "잰 판", measured.length, found,
    "안 바뀐 것이 맞을 수도 있다. 다만 씬이 안 지어졌거나 문턱에 맞춰 굳은 것도 이렇게 보인다 — 눈으로 한 번 본다");
}

// 7. 옆자리가 없다 — 잔액 없음이 최근에 실제로 났나.
{
  const { data: rows } = await db
    .from("work_executions")
    .select("error_message, created_at")
    .gte("created_at", since)
    .not("error_message", "is", null)
    .limit(500);
  const list = (rows ?? []) as { error_message: string; created_at: string }[];
  const found: Finding[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    const m = r.error_message.toLowerCase();
    if (!m.includes("balance") && !m.includes("insufficient")) continue;
    const who = m.includes("anthropic") ? "anthropic" : m.includes("deepseek") ? "deepseek" : "어느 벤더";
    if (seen.has(who)) continue;
    seen.add(who);
    found.push({ what: `${who} 잔액 없음`, evidence: `${r.created_at.slice(5, 16)} — ${short(r.error_message, 60)}` });
  }
  add("옆자리가 비었다", "오류가 적힌 실행", list.length, found,
    "옆자리가 없으면 벤더 하나가 곧 단일 장애점이다");
}

// 8. 막힌 직원 — 돌고 있는 일이 없는데 ready 가 아니다.
{
  const { data: emps } = await db.from("company_employees").select("id, work_status, current_assignment_id");
  const list = (emps ?? []) as { id: string; work_status: string; current_assignment_id: string | null }[];
  const { data: live } = await db.from("work_executions").select("company_employee_id").in("status", ["queued", "running"]);
  const busy = new Set((live ?? []).map((r) => r.company_employee_id as string));
  const found: Finding[] = [];
  for (const e of list) {
    if (e.work_status !== "ready" && !busy.has(e.id)) {
      found.push({ what: `${e.work_status} 인데 도는 일이 없다`, evidence: e.id.slice(0, 8) });
    }
  }
  add("막힌 직원", "직원", list.length, found,
    "이 상태면 다음 업무가 409 로 튕긴다");
}

// 9. 싼 자리가 새고 있나 — **원장에서** 잰다.
//
// 09-09: DeepSeek 잔액이 09-07 저녁에 떨어졌고, 그 뒤 사흘간 싼 자리로 갈 일이 전부
// gpt-5 로 갔다. $17.9. 위의 7번(잔액 없음)은 **실행의 오류 메시지**를 보는데,
// 라우터가 위로 넘겨서 살려 놓으므로 **오류가 아예 안 적힌다.** 그래서 7번은 내내
// 통과였다. 회복되는 고장은 오류 자리에 안 남는다 — **돈이 남는다.**
{
  const { data: rows } = await db
    .from("model_usage")
    .select("model, tier, routing, cost_usd, created_at")
    .gte("created_at", since)
    .limit(5000);
  const list = (rows ?? []) as { model: string; tier: string | null; routing: string | null; cost_usd: number | null; created_at: string }[];
  const leaked = list.filter((r) => r.routing === "up");
  const found: Finding[] = [];
  if (leaked.length) {
    const byModel = new Map<string, { n: number; usd: number; last: string }>();
    for (const r of leaked) {
      const cur = byModel.get(r.model) ?? { n: 0, usd: 0, last: r.created_at };
      cur.n++;
      cur.usd += Number(r.cost_usd ?? 0);
      if (r.created_at > cur.last) cur.last = r.created_at;
      byModel.set(r.model, cur);
    }
    for (const [model, v] of [...byModel].sort((a, b) => b[1].usd - a[1].usd)) {
      found.push({
        what: `${model} 이 싼 자리 일을 대신했다`,
        evidence: `${v.n}회 · $${v.usd.toFixed(2)} · 마지막 ${v.last.slice(5, 16)}`,
      });
    }
  }
  const total = leaked.reduce((t, r) => t + Number(r.cost_usd ?? 0), 0);
  add("싼 자리가 샌다", "원장 줄", list.length, found,
    found.length
      ? `합계 $${total.toFixed(2)}. 벤더 잔액을 채우기 전까지 계속 샌다 — 답은 안 나빠지므로 화면으로는 못 본다`
      : "routing='up' 이 없다");
}

// 10. 싼 자리 지갑 — **쓰기 전에** 본다.
//
// 9번은 원장이라 **이미 쓴 뒤에** 알려 준다. DeepSeek 은 선불이고 자동 충전이 없어서
// (09-09 사장님이 발견) 잔액 0 은 사고가 아니라 예정된 일이다. 지금 얼마 남았는지를
// 여기서 같이 본다.
{
  const { deepSeekWallet, LOW_USD } = await import("../../src/lib/providers/balance");
  const w = await deepSeekWallet();
  const found: Finding[] = [];
  if (w.usd === null) {
    // 못 본 것을 통과로 적지 않는다.
    add("싼 자리 지갑", "벤더", 0, [], `${w.vendor} ${w.note}`);
  } else {
    if (!w.available || w.usd < LOW_USD) {
      found.push({ what: `${w.vendor} 잔액이 낮다`, evidence: `${w.note} (${LOW_USD} 아래) — 자동 충전이 없어 사람이 넣어야 한다` });
    }
    add("싼 자리 지갑", "벤더", 1, found, `지금 ${w.note}`);
  }
}

// ────────────────────────────────────────────────────────────────────
const mark = (c: Check) => (c.looked === 0 ? "◻︎" : c.found.length ? "✗" : "✓");
const lines: string[] = [];
lines.push(`# 자가진단 — 최근 ${DAYS}일 (${new Date().toISOString().slice(0, 16).replace("T", " ")})`);
lines.push("");
lines.push("각 줄은 **몇 개를 봤는지**를 함께 적는다. 0개를 보고 통과라고 말하지 않기 위해서다.");
lines.push("");
for (const c of checks) {
  const head = `## ${mark(c)} ${c.name} — ${c.unit} ${c.looked}개를 봄, 걸린 것 ${c.found.length}개`;
  lines.push(head);
  if (c.note) lines.push(`> ${c.note}`);
  if (c.looked === 0) lines.push("- **못 잼**: 볼 것이 없었다. 통과가 아니다.");
  for (const f of c.found.slice(0, 12)) lines.push(`- ${f.what} — ${f.evidence}`);
  if (c.found.length > 12) lines.push(`- … 그리고 ${c.found.length - 12}개 더`);
  lines.push("");
}
const bad = checks.filter((c) => c.found.length).length;
const blind = checks.filter((c) => c.looked === 0).length;
lines.push(`**요약**: 줄 ${checks.length}개 중 걸린 것 ${bad}개, 못 잰 것 ${blind}개.`);

const out = lines.join(NL);
console.log(out);
fs.mkdirSync("engine/docs", { recursive: true });
fs.writeFileSync("engine/docs/selfcheck-latest.md", out, "utf8");
console.log(NL + "→ engine/docs/selfcheck-latest.md 에 적었다");
