/**
 * **판단 엔진 켬/끔 실험** (11-20) — 사전 등록 `engine/docs/head-ab-design.md` 를 DB 없이 돌린다.
 *
 *   npx tsx engine/tools/head_ab.mts --seats            ← 자리마다 한 줄 불러 산 것만 남긴다(값 ~0)
 *   npx tsx engine/tools/head_ab.mts --setup            ← 고침 과제의 원본을 만들고 고장을 심어 본다
 *   npx tsx engine/tools/head_ab.mts --only t1          ← 한 과제만 두 팔로(틀 점검)
 *   npx tsx engine/tools/head_ab.mts                    ← 전부(스무 판)
 *
 * ## 무엇이 같고 무엇이 다른가
 *
 * 두 팔은 **같은 만들기·고리 코드**를 탄다(`WHOLE_BUILD_SYSTEM` · `improveLoop` · `buildPatch` — 로키 운영과 같은 것).
 * 다른 것은 **누가 자리와 바퀴를 정하나** 하나다:
 *  - 켬: 판단 엔진(`src/lib/director`)이 손님 장부를 보고 자리·바퀴·통과확률을 정한다.
 *  - 끔: 기본 자리(`deepseek-v4-pro`) · 보통(3바퀴). 엔진 없이 한 모델만 쓰는 사람.
 *
 * ## 채점은 숨긴 시험이다
 *
 * 고리의 심판은 화면을 보는 AI 다 — 그 판정으로 결과를 매기면 **고리가 스스로 매긴 점수**가 된다.
 * 그래서 마지막 채점은 따로 둔 **결정적 시험**이다: 주문에 "시험용 약속"(data-test 이름 · `window.__state()`)을
 * 두 팔에 똑같이 붙이고, 그 약속으로 헤드리스에서 실제로 누르고 상태를 읽는다. 고리는 이 시험을 모른다.
 *
 * ## 장부
 *
 * 켬 팔의 판단만 엔진 장부에 들어간다(끔 팔은 엔진을 안 쓴 사람이다). 장부는 **빈 채로 시작**한다 — 첫날 손님.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import puppeteer, { type Page } from "puppeteer-core";
const { seatProvider } = await import("../../src/lib/skills/appBuild/seats");
const { costOf } = await import("../../src/lib/costs/pricing");
const { WHOLE_BUILD_SYSTEM, buildSchema, wholeBuildInput } = await import("../../src/lib/skills/appBuild/index");
const { improveLoop } = await import("../../src/lib/skills/appBuild/loop");
const { buildPatch } = await import("../../src/lib/skills/appBuild/patch");
const { entryOf } = await import("../../src/lib/skills/appBuild/run");
const { decideFor, roundsOf, scorecard } = await import("../../src/lib/director/index");
type AIProvider = Awaited<ReturnType<typeof seatProvider>> & {};
type SourceFile = { path: string; language: string; contents: string };
type Seat = { id: string; outPerMTok?: number; sees?: boolean; note?: string };
type LedgerEntry = Parameters<typeof scorecard>[0][number];

const OUT = "engine/work/head-ab";
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

/* ─────────────── 자리 (손님이 가진 AI) ─────────────── */
const 모든자리: Seat[] = [
  { id: "gpt-5", outPerMTok: 10, sees: true, note: "형식을 잘 지킨다." },
  { id: "gpt-5-mini", outPerMTok: 2, sees: true, note: "싸다." },
  { id: "gpt-6-astra", outPerMTok: 50, sees: true, note: "제일 비싸다." },
  { id: "gpt-5.6-luna", outPerMTok: 1.2, sees: true, note: "gpt-5 의 1/8 값." },
  { id: "gpt-5.6-terra", outPerMTok: 12, sees: true, note: "gpt-5 와 값이 비슷한 새 판." },
  { id: "gpt-5.3-codex", outPerMTok: 14, note: "코드 전용. 그림 못 봄." },
];
const 끔자리 = "gpt-5.6-luna";   // 부록 2: 이 기계에서 DeepSeek 이 막혀 있다(DNS 가 127.0.0.1)
const 판단자 = "gpt-5";        // 엔진의 머리 자체. 그 값도 켬 팔에 들어간다.
const 고리심판 = "gpt-5.6-luna"; // 운영 기본(LOOP_JUDGE_MODEL). 두 팔 같다.

/* ─────────────── 계량 — 판마다 돈을 센다 ─────────────── */
let 판돈 = 0;
function metered(ai: AIProvider): AIProvider {
  return {
    ...ai,
    async generateStructuredOutput<T>(a: Parameters<AIProvider["generateStructuredOutput"]>[0]) {
      const r = await ai.generateStructuredOutput<T>(a as never);
      판돈 += costOf({ backend: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cachedInputTokens: r.cachedInputTokens });
      return r;
    },
  } as AIProvider;
}
async function 자리(id: string) { const ai = await seatProvider(id); if (!ai) throw new Error(`자리 ${id} 를 못 앉혔다(열쇠)`); return metered(ai); }
/** 고리는 DB 에서 쓴 돈을 읽는다(`spentUsd`). DB 대신 이 판의 계량을 돌려준다 — 그래야 고리의 돈 상한이 산다. */
const 가짜DB = { from: () => ({ select: () => ({ eq: async () => ({ data: [{ cost_usd: 판돈 }], error: null }) }), update: () => ({ eq: async () => ({}) }), insert: async () => ({}) }) } as never;

/* ─────────────── 과제 (잠금 · 설계 문서와 같다, 7번만 부록대로) ─────────────── */
type Check = (p: Page) => Promise<{ met: number; total: number; notes: string[] }>;
type Task = { id: string; kind: string; order: string; contract: string; criteria: { id: string; when: string; then: string }[]; check: Check; fixOf?: string; plant?: [RegExp, string][]; bug?: string; mobile?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const st = (p: Page) => p.evaluate(() => { try { return (window as unknown as { __state?: () => unknown }).__state?.() ?? null; } catch { return null; } }) as Promise<Record<string, unknown> | null>;
const 누름 = async (p: Page, t: string) => { const h = await p.$(`[data-test="${t}"]`); if (!h) return false; await h.click().catch(() => {}); await sleep(250); return true; };
function 채점(): { ok: (c: boolean, n: string) => void; done: () => { met: number; total: number; notes: string[] } } {
  let met = 0, total = 0; const notes: string[] = [];
  return { ok: (c, n) => { total++; if (c) met++; else notes.push(n); }, done: () => ({ met, total, notes }) };
}

const 약속 = (x: string) => `\n\n[시험용 약속 — 꼭 지킨다] ${x} 상태 함수는 \`window.__state = () => ({...})\` 로 전역에 둔다.`;

const T1: Task = {
  id: "t1", kind: "게임", order: "터치로 하는 두더지 잡기 게임. 20초 제한, 점수 표시.",
  contract: 약속('시작 단추에 data-test="start", 지금 나와 있는(눌러야 하는) 두더지마다 data-test="mole". `__state()` 는 { score: 숫자, timeLeft: 초(숫자), running: 참/거짓 }.'),
  criteria: [
    { id: "start", when: "시작을 누르면", then: "게임이 시작된다" },
    { id: "time", when: "시작 뒤", then: "남은 시간이 20초에서 줄어든다" },
    { id: "score", when: "나온 두더지를 누르면", then: "점수가 1 오른다" },
    { id: "end", when: "시간이 0이 되면", then: "게임이 끝나고 점수가 남는다" },
  ],
  check: async (p) => {
    const c = 채점();
    const s0 = await st(p);
    c.ok(!!s0 && typeof s0.score === "number" && typeof s0.timeLeft === "number" && typeof s0.running === "boolean", "상태 모양");
    c.ok(await 누름(p, "start") && (await st(p))?.running === true, "시작");
    const t0 = Number((await st(p))?.timeLeft); await sleep(2200);
    c.ok(Number((await st(p))?.timeLeft) < t0, "시간이 준다");
    let 올랐다 = false;
    for (let i = 0; i < 20 && !올랐다; i++) {
      const before = Number((await st(p))?.score);
      const m = await p.$$('[data-test="mole"]');
      for (const h of m) { const box = await h.boundingBox(); if (box && box.width > 2) { await h.click().catch(() => {}); break; } }
      await sleep(200);
      if (Number((await st(p))?.score) > before) 올랐다 = true; else await sleep(150);
    }
    c.ok(올랐다, "두더지를 누르면 점수");
    return c.done();
  },
};
const T2: Task = {
  id: "t2", kind: "게임", order: "벽돌깨기 게임. 목숨 셋.",
  contract: 약속('시작 단추에 data-test="start". 시작을 누르면 공이 **바로 위쪽으로** 움직인다(따로 발사하지 않는다). `__state()` 는 { lives: 숫자, bricks: 남은 벽돌 수, running: 참/거짓 }.'),
  criteria: [
    { id: "start", when: "시작을 누르면", then: "공이 움직인다" },
    { id: "bricks", when: "공이 벽돌에 맞으면", then: "벽돌이 깨진다" },
    { id: "lives", when: "공을 놓치면", then: "목숨이 하나 준다(처음 셋)" },
    { id: "over", when: "목숨이 다 없어지면", then: "게임이 끝난다" },
  ],
  check: async (p) => {
    const c = 채점();
    const s0 = await st(p);
    c.ok(!!s0 && typeof s0.lives === "number" && typeof s0.bricks === "number", "상태 모양");
    c.ok(Number(s0?.lives) === 3, "목숨 셋");
    c.ok(Number(s0?.bricks) >= 10, "벽돌 열 개 이상");
    await 누름(p, "start");
    const b0 = Number((await st(p))?.bricks);
    let 깨짐 = false, 줄음 = false;
    for (let i = 0; i < 60 && !(깨짐 && 줄음); i++) { await sleep(500); const s = await st(p); if (Number(s?.bricks) < b0) 깨짐 = true; if (Number(s?.lives) < 3) 줄음 = true; }
    c.ok(깨짐, "벽돌이 깨진다(30초 안)");
    c.ok(줄음, "놓치면 목숨이 준다(30초 안, 입력 없음)");
    return c.done();
  },
};
const T3: Task = {
  id: "t3", kind: "게임", order: "2048 게임. 방향키와 스와이프 둘 다.",
  contract: 약속("`__state()` 는 { board: 4×4 숫자 배열(빈칸 0), score: 숫자 }. 방향키로 움직인다."),
  criteria: [
    { id: "start", when: "처음 열면", then: "4×4 판에 타일이 두 개 있다" },
    { id: "move", when: "방향키를 누르면", then: "타일이 그 쪽으로 밀리고 합쳐진다" },
    { id: "spawn", when: "움직이면", then: "새 타일이 하나 생긴다" },
    { id: "swipe", when: "화면을 쓸면", then: "방향키와 같이 움직인다" },
  ],
  check: async (p) => {
    const c = 채점();
    const b = (s: Record<string, unknown> | null) => (Array.isArray(s?.board) ? (s!.board as number[][]) : null);
    const 판0 = b(await st(p));
    c.ok(!!판0 && 판0.length === 4 && 판0.every((r) => Array.isArray(r) && r.length === 4), "4×4 판");
    const 수 = (x: number[][] | null) => (x ? x.flat().filter((v) => Number(v) > 0).length : -1);
    c.ok(수(판0) === 2, "처음 타일 둘");
    const 전 = JSON.stringify(판0);
    for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"] as const) { await p.keyboard.press(k); await sleep(180); }
    const 판1 = b(await st(p));
    c.ok(JSON.stringify(판1) !== 전 && 수(판1) >= 3, "움직이고 새 타일");
    c.ok(!!판1 && 판1.flat().every((v) => v === 0 || (v >= 2 && (v & (v - 1)) === 0)), "타일이 2의 거듭제곱");
    return c.done();
  },
};
const T4: Task = {
  id: "t4", kind: "앱", order: "타이머 앱: 시작·멈춤·초기화, 랩 기록.",
  contract: 약속('단추에 data-test="start" · "stop" · "reset" · "lap". `__state()` 는 { running: 참/거짓, elapsedMs: 숫자, laps: 숫자 배열 }.'),
  criteria: [
    { id: "start", when: "시작을 누르면", then: "시간이 흐른다" },
    { id: "stop", when: "멈춤을 누르면", then: "시간이 멈춘다" },
    { id: "lap", when: "랩을 누르면", then: "그때 시간이 목록에 쌓인다" },
    { id: "reset", when: "초기화를 누르면", then: "시간과 랩 기록이 지워진다" },
  ],
  check: async (p) => {
    const c = 채점();
    const s0 = await st(p);
    c.ok(!!s0 && typeof s0.elapsedMs === "number" && Array.isArray(s0.laps), "상태 모양");
    await 누름(p, "start"); await sleep(700);
    c.ok(Number((await st(p))?.elapsedMs) > 300, "흐른다");
    await 누름(p, "lap");
    c.ok(((await st(p))?.laps as unknown[] | undefined)?.length === 1, "랩 하나");
    await 누름(p, "stop"); const a = Number((await st(p))?.elapsedMs); await sleep(500);
    c.ok(Math.abs(Number((await st(p))?.elapsedMs) - a) < 30, "멈춘다");
    await 누름(p, "reset"); const s = await st(p);
    c.ok(Number(s?.elapsedMs) === 0 && (s?.laps as unknown[] | undefined)?.length === 0, "초기화가 시간·랩을 지운다");
    return c.done();
  },
};
const T5: Task = {
  id: "t5", kind: "앱", order: "메모 앱: 추가·삭제, 새로고침해도 남게.",
  contract: 약속('입력칸에 data-test="input", 추가 단추에 data-test="add", 메모마다 지우는 단추에 data-test="delete". `__state()` 는 { notes: 글 배열 }.'),
  criteria: [
    { id: "add", when: "글을 쓰고 추가하면", then: "목록에 생긴다" },
    { id: "del", when: "지우기를 누르면", then: "그 메모가 없어진다" },
    { id: "keep", when: "새로고침해도", then: "메모가 남아 있다" },
  ],
  check: async (p) => {
    const c = 채점();
    c.ok(Array.isArray((await st(p))?.notes), "상태 모양");
    const 입력 = await p.$('[data-test="input"]');
    if (입력) { await 입력.click(); await p.keyboard.type("사과"); }
    await 누름(p, "add");
    c.ok(((await st(p))?.notes as string[] | undefined)?.some((n) => String(n).includes("사과")) === true, "추가");
    await p.reload({ waitUntil: "load" }); await sleep(700);
    c.ok(((await st(p))?.notes as string[] | undefined)?.some((n) => String(n).includes("사과")) === true, "새로고침 뒤에도");
    const n0 = ((await st(p))?.notes as unknown[] | undefined)?.length ?? 0;
    await 누름(p, "delete");
    c.ok((((await st(p))?.notes as unknown[] | undefined)?.length ?? 99) < n0, "지운다");
    return c.done();
  },
};
const T9: Task = {
  id: "t9", kind: "페이지", mobile: true, order: "한 쪽짜리 소개 페이지: 제목·설명 세 줄·단추 하나, 폰 폭에서 안 깨지게.",
  contract: 약속('단추에 data-test="cta". (이 페이지는 `__state` 가 없어도 된다.)'),
  criteria: [
    { id: "title", when: "열면", then: "제목이 보인다" },
    { id: "lines", when: "열면", then: "설명 세 줄이 있다" },
    { id: "cta", when: "열면", then: "단추가 하나 있다" },
    { id: "mobile", when: "폰 폭에서", then: "가로로 넘치지 않는다" },
  ],
  check: async (p) => {
    const c = 채점();
    const r = await p.evaluate(() => ({
      h1: (document.querySelector("h1")?.textContent ?? "").trim().length,
      lines: [...document.querySelectorAll("p, li")].filter((e) => (e.textContent ?? "").trim().length >= 8).length,
      cta: !!document.querySelector('[data-test="cta"]'),
      over: document.documentElement.scrollWidth - window.innerWidth,
    }));
    c.ok(r.h1 > 0, "제목"); c.ok(r.lines >= 3, "설명 세 줄"); c.ok(r.cta, "단추"); c.ok(r.over <= 1, "가로 넘침 없음");
    return c.done();
  },
};
const T10: Task = {
  id: "t10", kind: "게임", order: "숫자 맞히기 게임: 1~100, 높다/낮다 알려 주기, 시도 횟수.",
  contract: 약속('입력칸에 data-test="guess", 내기 단추에 data-test="submit". `__state()` 는 { attempts: 숫자, last: 마지막 판정 } — last 는 낸 수가 정답보다 크면 "높다", 작으면 "낮다", 맞으면 "정답", 처음엔 null.'),
  criteria: [
    { id: "hint", when: "수를 내면", then: "높다/낮다를 알려 준다" },
    { id: "count", when: "수를 낼 때마다", then: "시도 횟수가 오른다" },
    { id: "win", when: "맞히면", then: "정답이라고 한다" },
  ],
  check: async (p) => {
    const c = 채점();
    const s0 = await st(p);
    c.ok(!!s0 && Number(s0.attempts) === 0 && s0.last == null, "처음 상태");
    let lo = 1, hi = 100, 맞힘 = false, 첫 = true;
    for (let i = 0; i < 9 && !맞힘; i++) {
      const g = Math.floor((lo + hi) / 2);
      const h = await p.$('[data-test="guess"]'); if (!h) break;
      await h.click({ clickCount: 3 }); await p.keyboard.type(String(g)); await 누름(p, "submit");
      const s = await st(p);
      if (첫) { c.ok(Number(s?.attempts) === 1 && ["높다", "낮다", "정답"].includes(String(s?.last)), "판정과 횟수"); 첫 = false; }
      if (s?.last === "정답") 맞힘 = true; else if (s?.last === "높다") hi = g - 1; else if (s?.last === "낮다") lo = g + 1; else break;
    }
    c.ok(맞힘, "이분 탐색으로 맞힌다(9번 안)");
    return c.done();
  },
};
/* 고침 셋 — 같은 원본에 같은 고장을 심어 두 팔에 준다. */
const T6: Task = { ...T1, id: "t6", kind: "고침", fixOf: "t1", bug: "두더지를 눌러도 점수가 안 올라.",
  plant: [[/score\s*\+=\s*1\b/, "score += 0"], [/score\s*\+\+/, "score += 0"], [/\+\+\s*score\b/, "score += 0"], [/score\s*=\s*score\s*\+\s*1\b/, "score = score + 0"]] };
const T7: Task = { ...T2, id: "t7", kind: "고침", fixOf: "t2", bug: "공을 놓쳐도 목숨이 안 줄어.",
  plant: [[/lives\s*-=\s*1\b/, "lives -= 0"], [/lives\s*--/, "lives -= 0"], [/--\s*lives\b/, "lives -= 0"], [/lives\s*=\s*lives\s*-\s*1\b/, "lives = lives - 0"]] };
const T8: Task = { ...T4, id: "t8", kind: "고침", fixOf: "t4", bug: "초기화 단추를 눌러도 랩 기록이 안 지워져.",
  plant: [[/(?<!(?:let|const|var)\s+)\blaps\s*=\s*\[\]/, "laps = laps"], [/laps\.length\s*=\s*0/, "laps.length = laps.length"], [/laps\.splice\(\s*0\s*\)/, "laps.slice(0)"]] };
const 과제들: Task[] = [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10];

/* ─────────────── 숨긴 시험 실행기 ─────────────── */
const browser = await puppeteer.launch({ executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-first-run", "--allow-file-access-from-files"] });
async function 시험(task: Task, files: SourceFile[]) {
  const 곳 = mkdtempSync(join(tmpdir(), "head-ab-"));
  try {
    for (const f of files) { const p = join(곳, f.path); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, f.contents); }
    const 입구 = entryOf(files as never) as SourceFile | null;
    if (!입구) return { met: 0, total: 1, notes: ["입구 html 없음"] };
    const page = await browser.newPage();
    if (task.mobile) await page.setViewport({ width: 375, height: 760, isMobile: true, hasTouch: true }); else await page.setViewport({ width: 900, height: 760 });
    const 오류: string[] = []; page.on("pageerror", (e) => 오류.push(String(e).slice(0, 80)));
    await page.goto("file:///" + join(곳, 입구.path).split("\\").join("/"), { waitUntil: "load", timeout: 20000 });
    await sleep(800);
    const r = await Promise.race([task.check(page), sleep(60000).then(() => ({ met: 0, total: 1, notes: ["시험 시간 초과"] }))]);
    await page.close();
    return { ...r, notes: [...r.notes, ...(오류.length ? [`페이지 오류: ${오류[0]}`] : [])] };
  } finally { try { rmSync(곳, { recursive: true, force: true }); } catch { /* */ } }
}

/* ─────────────── 만들기 · 고치기 · 고리 (운영과 같은 코드) ─────────────── */
async function 만들기(ai: AIProvider, task: Task): Promise<SourceFile[]> {
  const r = await ai.generateStructuredOutput({
    systemInstructions: WHOLE_BUILD_SYSTEM,
    input: wholeBuildInput({ title: task.order + task.contract, criteria: task.criteria }, task.mobile ? " (폰 화면)" : "", null),
    schema: buildSchema, schemaName: "app_build", maxTokens: 32000, tier: "judgment",
  });
  return (r.output as { files: SourceFile[] }).files;
}
async function 한판(task: Task, 팔: "켬" | "끔", 장부: LedgerEntry[], 원본?: SourceFile[]) {
  판돈 = 0; const t0 = Date.now();
  let seat = 끔자리, effort: "가볍게" | "보통" | "꼼꼼히" = "보통", predictedPass: number | null = null, why = "", guard: string | undefined;
  if (팔 === "켬") {
    const d = await decideFor(await 자리(판단자), { task: task.order + (task.bug ? `\n고칠 것: ${task.bug}` : ""), kind: task.kind, seats: 살아있는자리, ledger: 장부 });
    seat = d.seat; effort = d.effort; predictedPass = d.predictedPass; why = d.why; guard = d.guard;
  }
  const ai = await 자리(seat);
  let files: SourceFile[] = [];
  let 실패: string | null = null;
  try {
    if (원본) {
      /* 고침: 먼저 주문대로 한 번 고치고(운영의 고치는 판), 그다음 고리. */
      const p = await buildPatch(ai, { title: task.order, ask: task.bug!, criteria: task.criteria, failedChecks: [], full: 원본, rest: [] });
      /* 조각이 안 붙으면 원본 그대로 고리로 간다(고리가 다시 고칠 기회가 있다). */
      files = p.ok ? p.files : 원본;
    } else files = await 만들기(ai, task);
    const loop = await improveLoop({ db: 가짜DB, executionId: "head-ab", judgeAi: await 자리(고리심판), fixAi: ai, title: task.order, ask: task.order + task.contract + (task.bug ? `\n고칠 것: ${task.bug}` : ""),
      criteria: task.criteria, files, mobile: !!task.mobile, rounds: roundsOf(effort), usdCap: 0.5 });
    files = loop.files;
  } catch (e) { 실패 = e instanceof Error ? e.message.slice(0, 120) : String(e); }
  const 결과 = files.length ? await 시험(task, files) : { met: 0, total: 1, notes: [`못 만듦: ${실패}`] };
  return { task: task.id, kind: task.kind, 팔, seat, effort, predictedPass, why, guard, 통과: 결과.met === 결과.total, 점수: `${결과.met}/${결과.total}`, 못한것: 결과.notes, 실패,
    usd: Number(판돈.toFixed(4)), sec: Math.round((Date.now() - t0) / 1000) };
}

/* ─────────────── 자리 살피기 ─────────────── */
let 살아있는자리: Seat[] = 모든자리;
const 자리파일 = `${OUT}/seats.json`;
if (args.includes("--seats") || !existsSync(자리파일)) {
  const { z } = await import("zod");
  살아있는자리 = [];
  for (const s of 모든자리) {
    try {
      const ai = await seatProvider(s.id);
      const r = await ai!.generateStructuredOutput({ systemInstructions: "짧게 답한다.", input: "1+1 은?", schema: z.object({ a: z.number() }), schemaName: "ping", maxTokens: 2000, tier: "judgment" });
      console.log(`  ${s.id}: 산다 (${r.model})`); 살아있는자리.push(s);
    } catch (e) { console.log(`  ${s.id}: 못 씀 — ${e instanceof Error ? e.message.slice(0, 90) : e}`); }
  }
  writeFileSync(자리파일, JSON.stringify(살아있는자리, null, 1));
  if (args.includes("--seats")) { await browser.close(); process.exit(0); }
} else 살아있는자리 = JSON.parse(readFileSync(자리파일, "utf8"));
if (!살아있는자리.some((s) => s.id === 끔자리)) { console.log(`끔 팔 자리 ${끔자리} 가 죽어 있다 — 실험이 성립 안 한다`); await browser.close(); process.exit(1); }

/* ─────────────── 원본 만들기(고침 과제용) ─────────────── */
const 원본파일 = `${OUT}/originals.json`;
let 원본들: Record<string, SourceFile[] | null> = existsSync(원본파일) ? JSON.parse(readFileSync(원본파일, "utf8")) : {};
if (args.includes("--setup") || !existsSync(원본파일)) {
  원본들 = {};
  for (const t of 과제들.filter((x) => x.fixOf)) {
    const 바탕 = 과제들.find((x) => x.id === t.fixOf)!;
    let 됨: SourceFile[] | null = null;
    for (let 시도 = 1; 시도 <= 3 && !됨; 시도++) {
      판돈 = 0;
      const f = await 만들기(await 자리("gpt-5.6-luna"), 바탕);
      const 원 = await 시험(바탕, f);
      if (원.met !== 원.total) { console.log(`  ${t.id} 원본 ${시도}번째: 원본이 숨긴 시험을 못 넘음 (${원.met}/${원.total} · ${원.notes[0]})`); continue; }
      /* 심은 고장이 **진짜로** 시험을 떨어뜨리나([[planted-fault-must-be-well-formed]]). */
      let 심음 = f, 어디 = "";
      for (const [re, to] of t.plant!) for (const x of f) { if (!어디 && re.test(x.contents)) { 심음 = f.map((y) => (y === x ? { ...y, contents: y.contents.replace(re, to) } : y)); 어디 = `${x.path} ${re}`; } }
      if (!어디) { console.log(`  ${t.id} 원본 ${시도}번째: 고장 심을 자리를 못 찾음`); continue; }
      const 심은결과 = await 시험(바탕, 심음);
      if (심은결과.met === 심은결과.total) { console.log(`  ${t.id} 원본 ${시도}번째: 심었는데 시험이 그대로 통과 — 심은 게 가짜`); continue; }
      console.log(`  ${t.id}: 원본 ${원.met}/${원.total} · 심은 뒤 ${심은결과.met}/${심은결과.total} (${심은결과.notes[0]}) · ${어디} · $${판돈.toFixed(3)}`);
      됨 = 심음;
    }
    원본들[t.id] = 됨;
  }
  writeFileSync(원본파일, JSON.stringify(원본들));
  if (args.includes("--setup")) { await browser.close(); process.exit(0); }
}

/* ─────────────── 본판 ─────────────── */
const 장부: LedgerEntry[] = [];
const 결과: Awaited<ReturnType<typeof 한판>>[] = [];
const 할것 = 과제들.filter((t) => !only || t.id === only);
for (const [i, t] of 할것.entries()) {
  if (t.fixOf && !원본들[t.id]) { console.log(`${t.id}: 원본이 없어 뺀다(심을 자리를 못 찾았거나 원본이 시험을 못 넘음)`); continue; }
  const 차례: ("켬" | "끔")[] = i % 2 === 0 ? ["켬", "끔"] : ["끔", "켬"];
  for (const 팔 of 차례) {
    const r = await 한판(t, 팔, 장부, t.fixOf ? 원본들[t.id]! : undefined);
    결과.push(r);
    if (팔 === "켬") 장부.push({ at: new Date().toISOString(), task: t.order, kind: t.kind, seat: r.seat, effort: r.effort, predictedPass: r.predictedPass ?? 0.5, passed: r.통과, score: { met: Number(r.점수.split("/")[0]), total: Number(r.점수.split("/")[1]) }, usd: r.usd, sec: r.sec });
    console.log(`${t.id} ${팔} · ${r.seat}/${r.effort}${r.predictedPass != null ? ` · 예측 ${Math.round(r.predictedPass * 100)}%` : ""} → ${r.통과 ? "통과" : "실패"} ${r.점수} · $${r.usd} · ${r.sec}s${r.못한것.length ? ` · ${r.못한것.slice(0, 2).join(" / ")}` : ""}${r.guard ? ` · 난간: ${r.guard}` : ""}`);
    writeFileSync(`${OUT}/results${only ? "-" + only : ""}.json`, JSON.stringify({ 결과, 장부 }, null, 1));
  }
}
await browser.close();

/* ─────────────── 판정(잠근 식 그대로) ─────────────── */
const 팔값 = (팔: "켬" | "끔") => { const xs = 결과.filter((r) => r.팔 === 팔); return { n: xs.length, 통과: xs.filter((r) => r.통과).length, 평균달러: xs.reduce((a, r) => a + r.usd, 0) / Math.max(1, xs.length), 평균초: xs.reduce((a, r) => a + r.sec, 0) / Math.max(1, xs.length) }; };
const 켬 = 팔값("켬"), 끔 = 팔값("끔");
const 기본고른수 = 결과.filter((r) => r.팔 === "켬" && r.seat === 끔자리).length;
let 판정: string;
if (!only && 기본고른수 >= Math.ceil(켬.n * 0.8)) 판정 = `판정 안 냄 — 엔진이 ${켬.n}판 중 ${기본고른수}판을 기본 자리로 골랐다(두 팔이 사실상 같다)`;
else if (켬.통과 - 끔.통과 >= 2) 판정 = "판단이 일을 한다(통과 2건 이상 많다)";
else if (켬.통과 - 끔.통과 >= -1 && 켬.평균달러 <= 끔.평균달러 * 0.85) 판정 = "판단이 일을 한다(통과는 비슷하고 15% 이상 싸다)";
else if (끔.통과 - 켬.통과 >= 2) 판정 = "판단이 해를 끼친다(통과 2건 이상 적다)";
else 판정 = "구분 안 됨";
console.log(`\n켬: ${켬.통과}/${켬.n} 통과 · 판당 $${켬.평균달러.toFixed(3)} · ${Math.round(켬.평균초)}초`);
console.log(`끔: ${끔.통과}/${끔.n} 통과 · 판당 $${끔.평균달러.toFixed(3)} · ${Math.round(끔.평균초)}초`);
console.log(`엔진 성적표: ${JSON.stringify(scorecard(장부))}`);
console.log(`\n**${only ? "(한 과제 점검 — 판정 아님) " : ""}${판정}**`);
