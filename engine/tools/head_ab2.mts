/**
 * **판단 엔진 둘째 판** (11-20) — 사전 등록 `engine/docs/head-ab2-design.md`.
 *
 *   npx tsx engine/tools/head_ab2.mts --screen     ← 후보 아홉을 luna·보통으로 한 번씩 → 떨어진 것만 남긴다
 *   npx tsx engine/tools/head_ab2.mts --only h4    ← 한 과제만 세 팔로(틀 점검)
 *   npx tsx engine/tools/head_ab2.mts              ← 본판(걸러진 과제 × 세 팔)
 *
 * 첫 판(`head_ab.mts`)과 같은 틀이다 — 만들기·고리는 운영 코드, 채점은 숨긴 결정적 시험.
 * 다른 것: 과제가 어렵고, **팔이 셋**(끔 · 켬 머리 gpt-5 · 켬 머리 luna), 엔진 팔마다 장부가 따로다.
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
const { entryOf } = await import("../../src/lib/skills/appBuild/run");
const { decideFor, roundsOf, scorecard } = await import("../../src/lib/director/index");
type AIProvider = Awaited<ReturnType<typeof seatProvider>> & {};
type SourceFile = { path: string; language: string; contents: string };
type Seat = { id: string; outPerMTok?: number; sees?: boolean; note?: string };
type LedgerEntry = Parameters<typeof scorecard>[0][number];

const OUT = "engine/work/head-ab2";
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const 자리목록: Seat[] = JSON.parse(readFileSync("engine/work/head-ab/seats.json", "utf8"));   // 첫 판에서 산 것만
const 끔자리 = "gpt-5.6-luna";
const 고리심판 = "gpt-5.6-luna";
type 팔 = "끔" | "켬" | "싼";
const 머리: Record<Exclude<팔, "끔">, string> = { 켬: "gpt-5", 싼: "gpt-5.6-luna" };

/* ─────────────── 계량 ─────────────── */
let 판돈 = 0, 판단돈 = 0;
function metered(ai: AIProvider, 판단 = false): AIProvider {
  return { ...ai, async generateStructuredOutput<T>(a: Parameters<AIProvider["generateStructuredOutput"]>[0]) {
    const r = await ai.generateStructuredOutput<T>(a as never);
    const usd = costOf({ backend: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cachedInputTokens: r.cachedInputTokens });
    판돈 += usd; if (판단) 판단돈 += usd;
    return r;
  } } as AIProvider;
}
async function 자리(id: string, 판단 = false) { const ai = await seatProvider(id); if (!ai) throw new Error(`자리 ${id} 를 못 앉혔다`); return metered(ai, 판단); }
const 가짜DB = { from: () => ({ select: () => ({ eq: async () => ({ data: [{ cost_usd: 판돈 }], error: null }) }), update: () => ({ eq: async () => ({}) }), insert: async () => ({}) }) } as never;

/* ─────────────── 시험 도구 ─────────────── */
type Check = (p: Page) => Promise<{ met: number; total: number; notes: string[] }>;
type Task = { id: string; kind: string; order: string; contract: string; criteria: { id: string; when: string; then: string }[]; check: Check; mobile?: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const st = (p: Page) => p.evaluate(() => { try { return (window as unknown as { __state?: () => unknown }).__state?.() ?? null; } catch { return null; } }) as Promise<Record<string, any> | null>;
const 누름 = async (p: Page, t: string) => { const h = await p.$(`[data-test="${t}"]`); if (!h) return false; await h.click().catch(() => {}); await sleep(200); return true; };
const 넣기 = async (p: Page, t: string, v: string) => p.evaluate((sel, val) => {
  const e = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null; if (!e) return false;
  const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(e, val);
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); return true;
}, `[data-test="${t}"]`, v);
const 부르기 = (p: Page, fn: string, ...a: unknown[]) => p.evaluate((f, xs) => { const g = (window as any)[f]; if (typeof g !== "function") return false; g(...xs); return true; }, fn, a);
function 채점() { let met = 0, total = 0; const notes: string[] = []; return { ok: (c: boolean, n: string) => { total++; if (c) met++; else notes.push(n); }, done: () => ({ met, total, notes }) }; }
const 약속 = (x: string) => `\n\n[시험용 약속 — 꼭 지킨다] ${x} 상태 함수는 \`window.__state = () => ({...})\` 로 전역에 둔다.`;

/* ─────────────── 후보 아홉 (잠금) ─────────────── */
const H1: Task = { id: "h1", kind: "게임", order: "옆으로 가는 플랫포머. 좌우 이동, 점프, 중력, 발판 셋, 깃발에 닿으면 클리어.",
  contract: 약속("방향키 ←→ 로 움직이고 스페이스로 뛴다. 점프는 **최소 120px** 올라간다. `__state()` 는 { x, y (화면 픽셀, 위가 작은 수), onGround: 참/거짓, cleared: 참/거짓 }. 시작 단추 없이 열면 바로 시작한다."),
  criteria: [{ id: "move", when: "→ 를 누르고 있으면", then: "오른쪽으로 간다" }, { id: "jump", when: "스페이스를 누르면", then: "120px 이상 뛰고 다시 내려온다" }, { id: "plat", when: "발판 위에 서면", then: "떨어지지 않는다" }, { id: "flag", when: "깃발에 닿으면", then: "클리어" }],
  check: async (p) => { const c = 채점(); await sleep(1000); const s0 = await st(p);
    c.ok(!!s0 && typeof s0.x === "number" && typeof s0.y === "number" && typeof s0.onGround === "boolean", "상태 모양");
    c.ok(s0?.onGround === true, "1초 뒤 바닥에 섬");
    const y0 = Number(s0?.y); await p.keyboard.down("Space"); let 최고 = y0;
    for (let i = 0; i < 25; i++) { await sleep(40); const y = Number((await st(p))?.y); if (y < 최고) 최고 = y; if (i === 3) await p.keyboard.up("Space"); }
    c.ok(y0 - 최고 >= 120, `점프 120px 이상 (잰 값 ${Math.round(y0 - 최고)})`);
    await sleep(1200); c.ok((await st(p))?.onGround === true, "다시 착지");
    const x0 = Number((await st(p))?.x); await p.keyboard.down("ArrowRight"); await sleep(1000); await p.keyboard.up("ArrowRight");
    c.ok(Number((await st(p))?.x) - x0 >= 50, "→ 로 간다");
    return c.done(); } };

const H2: Task = { id: "h2", kind: "게임", order: "테트리스. 일곱 조각, 떨어짐, 좌우 이동, 회전, 한 번에 내리기, 줄 지우기, 점수.",
  contract: 약속('판은 가로 10 · 세로 20. 시작 단추에 data-test="start". 키: ←→ 이동, ↑ 회전, 스페이스 한 번에 내리기. `__state()` 는 { board: 20×10 배열(쌓인 칸 1, 빈칸 0), piece: { cells: [[행,열],...] } (지금 떨어지는 조각의 칸), score: 숫자, over: 참/거짓 }.'),
  criteria: [{ id: "fall", when: "시작하면", then: "조각이 내려온다" }, { id: "move", when: "←→", then: "옆으로 간다" }, { id: "rot", when: "↑", then: "돈다" }, { id: "drop", when: "스페이스", then: "바로 바닥에 닿고 다음 조각이 나온다" }, { id: "line", when: "한 줄이 차면", then: "지워지고 점수가 오른다" }],
  check: async (p) => { const c = 채점(); await 누름(p, "start"); await sleep(300);
    const 칸 = (s: any) => (Array.isArray(s?.piece?.cells) ? (s.piece.cells as number[][]) : null);
    const s0 = await st(p); c.ok(!!칸(s0) && 칸(s0)!.length === 4 && Array.isArray(s0?.board) && s0!.board.length === 20, "상태 모양(조각 네 칸·20줄)");
    const r0 = Math.min(...(칸(s0) ?? [[0]]).map((x) => x[0])); await sleep(1600);
    c.ok(Math.min(...(칸(await st(p)) ?? [[0]]).map((x) => x[0])) > r0, "저절로 내려온다");
    const c0 = Math.min(...(칸(await st(p)) ?? [[0, 0]]).map((x) => x[1])); await p.keyboard.press("ArrowLeft"); await sleep(120);
    c.ok(Math.min(...(칸(await st(p)) ?? [[0, 0]]).map((x) => x[1])) === c0 - 1, "← 한 칸");
    let 돌았다 = false;
    for (let k = 0; k < 3 && !돌았다; k++) { const a = JSON.stringify(칸(await st(p))?.map((x) => x[1] - Math.min(...칸(await st(p))!.map((y) => y[1])))); await p.keyboard.press("ArrowUp"); await sleep(120);
      const 지금 = 칸(await st(p)); if (지금) { const m = Math.min(...지금.map((y) => y[1])); if (JSON.stringify(지금.map((x) => x[1] - m)) !== a) 돌았다 = true; }
      if (!돌았다) { await p.keyboard.press("Space"); await sleep(250); } }
    c.ok(돌았다, "↑ 로 돈다(O 조각이면 다음 것으로)");
    const 쌓인 = (s: any) => (s?.board as number[][] | undefined)?.flat().filter((v) => v).length ?? -1;
    const b0 = 쌓인(await st(p)); await p.keyboard.press("Space"); await sleep(300);
    c.ok(쌓인(await st(p)) === b0 + 4 && !!칸(await st(p)), "스페이스: 네 칸이 쌓이고 다음 조각");
    const 안 = (await st(p))?.board?.flat?.().length === 200; c.ok(안, "판 크기 그대로");
    return c.done(); } };

const 스도쿠문제 = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const H3: Task = { id: "h3", kind: "알고리즘", order: "스도쿠 풀이기. 문제를 넣고 풀기를 누르면 답을 채운다.",
  contract: 약속('`window.__load("81자, 빈칸은 0")` 으로 문제를 넣는다. 풀기 단추에 data-test="solve". `__state()` 는 { grid: 9×9 숫자 배열(빈칸 0) }.'),
  criteria: [{ id: "load", when: "문제를 넣으면", then: "칸에 보인다" }, { id: "solve", when: "풀기를 누르면", then: "규칙에 맞게 다 채운다" }, { id: "keep", when: "풀면", then: "처음 숫자는 그대로다" }],
  check: async (p) => { const c = 채점();
    c.ok(await 부르기(p, "__load", 스도쿠문제), "__load 가 있다"); await sleep(300);
    const g0 = (await st(p))?.grid as number[][] | undefined;
    c.ok(!!g0 && g0.flat().join("") === 스도쿠문제, "넣은 문제가 그대로 보인다");
    await 누름(p, "solve"); await sleep(1500);
    const g = (await st(p))?.grid as number[][] | undefined; const f = g?.flat() ?? [];
    const 줄맞음 = (xs: number[]) => xs.slice().sort().join("") === "123456789";
    const ok = !!g && f.length === 81 && [...Array(9).keys()].every((i) => 줄맞음(g[i]) && 줄맞음(g.map((r) => r[i])) && 줄맞음([0, 1, 2].flatMap((a) => [0, 1, 2].map((b) => g[3 * Math.floor(i / 3) + a][3 * (i % 3) + b]))));
    c.ok(ok, "규칙에 맞게 다 채움");
    c.ok(f.length === 81 && [...스도쿠문제].every((ch, i) => ch === "0" || Number(ch) === f[i]), "처음 숫자 유지");
    return c.done(); } };

const H4: Task = { id: "h4", kind: "앱", order: "식을 받아 계산하는 계산기. 사칙연산, 괄호, 우선순위, 음수, 소수. 0으로 나누면 오류.",
  contract: 약속('식 입력칸에 data-test="expr", 계산 단추에 data-test="eq". `__state()` 는 { display: 화면에 보이는 결과 글자 }. 0으로 나누면 display 에 "오류" 가 들어간다. 소수 결과는 사람이 보는 꼴로(0.1+0.2 는 "0.3").'),
  criteria: [{ id: "prec", when: "2+3*4", then: "14" }, { id: "paren", when: "(2+3)*4", then: "20" }, { id: "neg", when: "-3+5", then: "2" }, { id: "dec", when: "0.1+0.2", then: "0.3" }, { id: "div0", when: "1/0", then: "오류" }],
  check: async (p) => { const c = 채점();
    for (const [식, 답] of [["2+3*4", "14"], ["(2+3)*4", "20"], ["10/4", "2.5"], ["-3+5", "2"], ["2*(3+(4-1))", "12"], ["0.1+0.2", "0.3"], ["1/0", "오류"]] as const) {
      await 넣기(p, "expr", 식); await 누름(p, "eq"); const d = String((await st(p))?.display ?? "").replace(/,/g, "").trim();
      c.ok(답 === "오류" ? d.includes("오류") : d === 답, `${식} → ${답} (보인 것 "${d}")`); }
    return c.done(); } };

const MD = "# 제목\n\n**굵게** 와 *기울임*\n\n- 하나\n- 둘\n  - 둘의 하나\n\n1. 첫째\n2. 둘째\n\n`코드`\n\n```\nlet a = 1;\n```\n\n[링크](https://example.com)";
const H5: Task = { id: "h5", kind: "앱", order: "마크다운 미리보기. 쓰는 대로 옆에 그려진다 — 제목, 굵게·기울임, 목록(중첩 포함), 번호 목록, 코드, 코드 블록, 링크.",
  contract: 약속('입력칸(textarea)에 data-test="md", 미리보기 영역에 data-test="preview". 입력하면 바로 미리보기가 바뀐다. (`__state` 는 없어도 된다.)'),
  criteria: [{ id: "h", when: "# 제목", then: "큰 제목" }, { id: "list", when: "중첩 목록", then: "안쪽 목록으로" }, { id: "code", when: "``` 블록", then: "코드 블록" }, { id: "link", when: "[글](주소)", then: "링크" }],
  check: async (p) => { const c = 채점(); c.ok(await 넣기(p, "md", MD), "입력칸이 있다"); await sleep(500);
    const r = await p.evaluate(() => { const v = document.querySelector('[data-test="preview"]'); if (!v) return null; const q = (s: string) => [...v.querySelectorAll(s)].map((e) => (e.textContent ?? "").trim());
      return { h1: q("h1"), strong: q("strong, b"), em: q("em, i"), ulLi: q("ul > li"), nested: [...v.querySelectorAll("ul li ul li, ul li ol li")].map((e) => (e.textContent ?? "").trim()), olLi: q("ol > li"),
        code: q(":not(pre) > code"), pre: q("pre"), a: [...v.querySelectorAll("a")].map((a) => [(a.textContent ?? "").trim(), a.getAttribute("href")]), raw: (v.textContent ?? "").includes("**") }; });
    c.ok(!!r && r.h1.includes("제목"), "제목"); c.ok(!!r && r.strong.includes("굵게") && r.em.includes("기울임"), "굵게·기울임");
    c.ok(!!r && r.ulLi.some((t) => t.startsWith("하나")), "목록"); c.ok(!!r && r.nested.includes("둘의 하나"), "중첩 목록");
    c.ok(!!r && r.olLi.length >= 2 && r.olLi[0].startsWith("첫째"), "번호 목록"); c.ok(!!r && r.code.includes("코드"), "인라인 코드");
    c.ok(!!r && r.pre.some((t) => t.includes("let a = 1;")), "코드 블록"); c.ok(!!r && r.a.some(([t, h]) => t === "링크" && h === "https://example.com"), "링크"); c.ok(!!r && !r.raw, "** 가 남지 않는다");
    return c.done(); } };

const 지뢰 = [[0, 0], [0, 1], [1, 0], [8, 8], [7, 8], [8, 7], [4, 4], [2, 6], [6, 2], [3, 3]];
const H6: Task = { id: "h6", kind: "알고리즘", order: "지뢰찾기 9×9, 지뢰 열 개. 칸 열기, 주변 지뢰 숫자, 빈칸이면 퍼져서 열림, 지뢰를 열면 짐, 안전한 칸을 다 열면 이김.",
  contract: 약속('`window.__setMines([[행,열],...])` 을 부르면 그 자리에 지뢰를 놓는다(첫 클릭 전). 칸마다 data-test="cell-행-열"(0부터). 클릭 = 열기. `__state()` 는 { revealed: 9×9 참/거짓, counts: 9×9 (열린 칸의 주변 지뢰 수, 안 열린 칸 null), lost: 참/거짓, won: 참/거짓 }.'),
  criteria: [{ id: "num", when: "칸을 열면", then: "주변 지뢰 수" }, { id: "flood", when: "0 칸을 열면", then: "이어진 빈칸이 다 열린다" }, { id: "lose", when: "지뢰를 열면", then: "진다" }, { id: "win", when: "안전한 칸을 다 열면", then: "이긴다" }],
  check: async (p) => { const c = 채점(); const 지뢰집합 = new Set(지뢰.map(([r, k]) => `${r},${k}`));
    const 수 = (r: number, k: number) => [-1, 0, 1].flatMap((a) => [-1, 0, 1].map((b) => [r + a, k + b])).filter(([x, y]) => (x !== r || y !== k) && 지뢰집합.has(`${x},${y}`)).length;
    c.ok(await 부르기(p, "__setMines", 지뢰), "__setMines 가 있다"); await sleep(200);
    await 누름(p, "cell-0-8"); await sleep(300); let s = await st(p);
    /* (0,8) 은 주변 지뢰 0 — 이어진 0 칸과 그 테두리가 다 열려야 한다. */
    const 열려야: string[] = []; const 본 = new Set<string>(); const 큐 = [[0, 8]];
    while (큐.length) { const [r, k] = 큐.shift()!; const key = `${r},${k}`; if (본.has(key) || r < 0 || k < 0 || r > 8 || k > 8 || 지뢰집합.has(key)) continue; 본.add(key); 열려야.push(key); if (수(r, k) === 0) for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) 큐.push([r + a, k + b]); }
    c.ok(!!s?.revealed && 열려야.every((key) => { const [r, k] = key.split(",").map(Number); return s!.revealed[r]?.[k] === true; }), `빈칸 퍼짐(${열려야.length}칸)`);
    c.ok(!!s?.counts && 열려야.every((key) => { const [r, k] = key.split(",").map(Number); return Number(s!.counts[r]?.[k]) === 수(r, k); }), "숫자가 맞다");
    for (let r = 0; r < 9; r++) for (let k = 0; k < 9; k++) if (!지뢰집합.has(`${r},${k}`) && !(s?.revealed?.[r]?.[k])) { await 누름(p, `cell-${r}-${k}`); }
    await sleep(300); s = await st(p); c.ok(s?.won === true && s?.lost !== true, "안전한 칸을 다 열면 이긴다");
    await p.reload({ waitUntil: "load" }); await sleep(600); await 부르기(p, "__setMines", 지뢰); await 누름(p, "cell-4-4"); await sleep(300);
    c.ok((await st(p))?.lost === true, "지뢰를 열면 진다");
    return c.done(); } };

const H7: Task = { id: "h7", kind: "앱", order: "달력 앱. 한 달씩 보이고, 이전·다음 달로 넘긴다. 요일 맞춤, 윤년.",
  contract: 약속('`window.__go(연, 월)` 로 그 달을 연다(월은 1~12). 날짜 칸마다 data-test="day-일". 다음 달 단추 data-test="next". `__state()` 는 { year, month(1~12), firstWeekday: 1일의 요일(0=일요일), days: 그 달 날 수 }.'),
  criteria: [{ id: "align", when: "달을 열면", then: "1일이 맞는 요일 칸에 있다" }, { id: "leap", when: "윤년 2월", then: "29일" }, { id: "next", when: "12월에서 다음", then: "다음 해 1월" }],
  check: async (p) => { const c = 채점();
    for (const [y, m] of [[2026, 2], [2028, 2], [2026, 11], [2025, 12]] as const) {
      await 부르기(p, "__go", y, m); await sleep(200); const s = await st(p);
      const 첫 = new Date(y, m - 1, 1).getDay(), 날 = new Date(y, m, 0).getDate();
      const 칸 = await p.evaluate((n) => ({ last: !!document.querySelector(`[data-test="day-${n}"]`), over: !!document.querySelector(`[data-test="day-${n + 1}"]`) }), 날);
      c.ok(Number(s?.firstWeekday) === 첫 && Number(s?.days) === 날 && 칸.last && !칸.over, `${y}-${m}: 요일 ${첫}·${날}일 (보인 것 ${s?.firstWeekday}·${s?.days})`); }
    await 부르기(p, "__go", 2026, 12); await 누름(p, "next"); const s = await st(p);
    c.ok(Number(s?.year) === 2027 && Number(s?.month) === 1, "12월 → 다음 해 1월");
    return c.done(); } };

const H8: Task = { id: "h8", kind: "앱", order: "가계부. 수입·지출을 적고 합계와 잔액을 보여 준다. 금액은 \"1,234원\" 꼴, 새로고침해도 남는다.",
  contract: 약속('금액 입력칸 data-test="amount", 메모 data-test="memo", 종류 고르기 data-test="type"(select, option 의 value 가 "수입" · "지출"), 추가 단추 data-test="add", 잔액 글자 data-test="balance"(예: "7,000원", 음수면 "-1,000원"). `__state()` 는 { items: [...], income, expense, balance } (숫자).'),
  criteria: [{ id: "sum", when: "수입·지출을 적으면", then: "잔액이 맞다" }, { id: "fmt", when: "잔액", then: "\"7,000원\" 꼴" }, { id: "neg", when: "잔액이 음수", then: "\"-1,000원\"" }, { id: "keep", when: "새로고침", then: "남는다" }],
  check: async (p) => { const c = 채점();
    const 적기 = async (종류: string, 금액: string) => { await p.select('[data-test="type"]', 종류).catch(() => {}); await 넣기(p, "amount", 금액); await 넣기(p, "memo", "시험"); await 누름(p, "add"); };
    await 적기("수입", "10000"); await 적기("지출", "3000"); const s = await st(p);
    c.ok(Number(s?.balance) === 7000 && Number(s?.income) === 10000 && Number(s?.expense) === 3000, `합계 (잔액 ${s?.balance})`);
    const 글 = async () => (await p.$eval('[data-test="balance"]', (e) => (e.textContent ?? "").trim()).catch(() => ""));
    c.ok((await 글()) === "7,000원", `"7,000원" (보인 것 "${await 글()}")`);
    await 적기("지출", "8000"); c.ok((await 글()) === "-1,000원", `"-1,000원" (보인 것 "${await 글()}")`);
    await p.reload({ waitUntil: "load" }); await sleep(600); c.ok(Number((await st(p))?.balance) === -1000, "새로고침 뒤에도");
    return c.done(); } };

const H9: Task = { id: "h9", kind: "알고리즘", order: "미로 만들기와 길 찾기. 21×21 미로를 만들고, 길 찾기를 누르면 출발에서 도착까지 가장 짧은 길을 보여 준다.",
  contract: 약속('새 미로 단추 data-test="new", 길 찾기 단추 data-test="solve". `__state()` 는 { grid: 21×21 (1=벽, 0=길), start: [행,열], end: [행,열], path: [[행,열],...] (찾기 전엔 빈 배열) }.'),
  criteria: [{ id: "maze", when: "열면", then: "출발에서 도착까지 이어진 미로" }, { id: "solve", when: "길 찾기", then: "가장 짧은 길" }, { id: "new", when: "새 미로", then: "다른 미로" }],
  check: async (p) => { const c = 채점(); const s = await st(p); const g = s?.grid as number[][] | undefined;
    c.ok(!!g && g.length === 21 && g.every((r) => r.length === 21 && r.every((v) => v === 0 || v === 1)), "21×21 0/1");
    const [sr, sc] = (s?.start ?? [-1, -1]) as number[], [er, ec] = (s?.end ?? [-1, -1]) as number[];
    const 길 = (r: number, k: number) => !!g && r >= 0 && k >= 0 && r < 21 && k < 21 && g[r][k] === 0;
    c.ok(길(sr, sc) && 길(er, ec), "출발·도착이 길 위");
    const 거리 = new Map<string, number>([[`${sr},${sc}`, 0]]); const q = [[sr, sc]];
    while (q.length) { const [r, k] = q.shift()!; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const key = `${r + a},${k + b}`; if (길(r + a, k + b) && !거리.has(key)) { 거리.set(key, 거리.get(`${r},${k}`)! + 1); q.push([r + a, k + b]); } } }
    const 최단 = 거리.get(`${er},${ec}`); c.ok(최단 != null, "이어져 있다");
    await 누름(p, "solve"); await sleep(500); const path = ((await st(p))?.path ?? []) as number[][];
    const 이어짐 = path.length > 0 && path[0][0] === sr && path[0][1] === sc && path.at(-1)![0] === er && path.at(-1)![1] === ec && path.every(([r, k], i) => 길(r, k) && (i === 0 || Math.abs(r - path[i - 1][0]) + Math.abs(k - path[i - 1][1]) === 1));
    c.ok(이어짐, "길이 출발→도착으로 이어진다"); c.ok(이어짐 && path.length - 1 === 최단, `가장 짧다 (${path.length - 1} 대 ${최단})`);
    const 전 = JSON.stringify(g); await 누름(p, "new"); await sleep(400); c.ok(JSON.stringify((await st(p))?.grid) !== 전, "새 미로가 다르다");
    return c.done(); } };

const 후보: Task[] = [H1, H2, H3, H4, H5, H6, H7, H8, H9];

/* ─────────────── 시험 · 만들기 · 한 판 ─────────────── */
const browser = await puppeteer.launch({ executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-first-run", "--allow-file-access-from-files"] });
async function 시험(task: Task, files: SourceFile[]) {
  const 곳 = mkdtempSync(join(tmpdir(), "head-ab2-"));
  try {
    for (const f of files) { const fp = join(곳, f.path); mkdirSync(join(fp, ".."), { recursive: true }); writeFileSync(fp, f.contents); }
    const 입구 = entryOf(files as never) as SourceFile | null;
    if (!입구) return { met: 0, total: 1, notes: ["입구 html 없음"] };
    const page = await browser.newPage();
    if (task.mobile) await page.setViewport({ width: 375, height: 760, isMobile: true, hasTouch: true }); else await page.setViewport({ width: 1000, height: 760 });
    const 오류: string[] = []; page.on("pageerror", (e) => 오류.push(String(e).slice(0, 80)));
    await page.goto("file:///" + join(곳, 입구.path).split("\\").join("/"), { waitUntil: "load", timeout: 20000 });
    await sleep(800);
    const r = await Promise.race([task.check(page).catch((e) => ({ met: 0, total: 1, notes: [`시험이 넘어짐: ${String(e).slice(0, 80)}`] })), sleep(90000).then(() => ({ met: 0, total: 1, notes: ["시험 시간 초과"] }))]);
    await page.close().catch(() => {});
    return { ...r, notes: [...r.notes, ...(오류.length ? [`페이지 오류: ${오류[0]}`] : [])] };
  } finally { try { rmSync(곳, { recursive: true, force: true }); } catch { /* */ } }
}
async function 만들기(ai: AIProvider, task: Task): Promise<SourceFile[]> {
  const r = await ai.generateStructuredOutput({ systemInstructions: WHOLE_BUILD_SYSTEM, input: wholeBuildInput({ title: task.order + task.contract, criteria: task.criteria }, task.mobile ? " (폰 화면)" : "", null),
    schema: buildSchema, schemaName: "app_build", maxTokens: 32000, tier: "judgment" });
  return (r.output as { files: SourceFile[] }).files;
}
async function 한판(task: Task, 팔: 팔, 장부: LedgerEntry[]) {
  판돈 = 0; 판단돈 = 0; const t0 = Date.now();
  let seat = 끔자리, effort: "가볍게" | "보통" | "꼼꼼히" = "보통", predictedPass: number | null = null, guard: string | undefined, why = "";
  if (팔 !== "끔") {
    const d = await decideFor(await 자리(머리[팔], true), { task: task.order, kind: task.kind, seats: 자리목록, ledger: 장부 });
    seat = d.seat; effort = d.effort; predictedPass = d.predictedPass; guard = d.guard; why = d.why;
  }
  let files: SourceFile[] = [], 실패: string | null = null;
  try {
    const ai = await 자리(seat);
    files = await 만들기(ai, task);
    const loop = await improveLoop({ db: 가짜DB, executionId: "head-ab2", judgeAi: await 자리(고리심판), fixAi: ai, title: task.order, ask: task.order + task.contract,
      criteria: task.criteria, files, mobile: !!task.mobile, rounds: roundsOf(effort), usdCap: 0.8 });
    files = loop.files;
  } catch (e) { 실패 = e instanceof Error ? e.message.slice(0, 120) : String(e); }
  const 결과 = files.length ? await 시험(task, files) : { met: 0, total: 1, notes: [`못 만듦: ${실패}`] };
  return { task: task.id, kind: task.kind, 팔, seat, effort, predictedPass, why, guard, 통과: 결과.met === 결과.total, 점수: `${결과.met}/${결과.total}`, 못한것: 결과.notes, 실패,
    usd: Number(판돈.toFixed(4)), 판단usd: Number(판단돈.toFixed(4)), sec: Math.round((Date.now() - t0) / 1000) };
}
const 줄 = (r: Awaited<ReturnType<typeof 한판>>) => `${r.task} ${r.팔} · ${r.seat}/${r.effort}${r.predictedPass != null ? ` · 예측 ${Math.round(r.predictedPass * 100)}%` : ""} → ${r.통과 ? "통과" : "실패"} ${r.점수} · $${r.usd}${r.판단usd ? ` (판단 $${r.판단usd})` : ""} · ${r.sec}s${r.못한것.length ? ` · ${r.못한것.slice(0, 2).join(" / ")}` : ""}${r.guard ? ` · 난간: ${r.guard}` : ""}`;

/* ─────────────── 거르기 ─────────────── */
const 거른파일 = `${OUT}/screen.json`;
if (args.includes("--screen")) {
  const 거른: { id: string; 통과: boolean; 점수: string; usd: number; 못한것: string[] }[] = [];
  for (const t of 후보) { const r = await 한판(t, "끔", []); 거른.push({ id: t.id, 통과: r.통과, 점수: r.점수, usd: r.usd, 못한것: r.못한것 }); console.log("거르기 " + 줄(r)); writeFileSync(거른파일, JSON.stringify(거른, null, 1)); }
  const 떨어진 = 거른.filter((x) => !x.통과).map((x) => x.id);
  console.log(`\n떨어진 것 ${떨어진.length}개: ${떨어진.join(", ") || "없음"} · 거르기 값 $${거른.reduce((a, x) => a + x.usd, 0).toFixed(3)}`);
  console.log(떨어진.length < 4 ? "**넷보다 적다 — 잠근 규칙대로 본판을 안 돌린다**" : "본판 과제가 정해졌다");
  await browser.close(); process.exit(0);
}

/* ─────────────── 본판 ─────────────── */
const 걸러진 = existsSync(거른파일) ? (JSON.parse(readFileSync(거른파일, "utf8")) as { id: string; 통과: boolean }[]).filter((x) => !x.통과).map((x) => x.id) : [];
const 과제들 = only ? 후보.filter((t) => t.id === only) : 후보.filter((t) => 걸러진.includes(t.id));
if (!only && 과제들.length < 4) { console.log(`걸러진 과제 ${과제들.length}개 — 넷보다 적어 본판을 안 돌린다`); await browser.close(); process.exit(0); }
const 장부: Record<Exclude<팔, "끔">, LedgerEntry[]> = { 켬: [], 싼: [] };
const 결과: Awaited<ReturnType<typeof 한판>>[] = [];
const 돌림: 팔[][] = [["끔", "켬", "싼"], ["켬", "싼", "끔"], ["싼", "끔", "켬"]];
for (const [i, t] of 과제들.entries()) for (const 팔 of 돌림[i % 3]) {
  const r = await 한판(t, 팔, 팔 === "끔" ? [] : 장부[팔]);
  결과.push(r); console.log(줄(r));
  if (팔 !== "끔") 장부[팔].push({ at: new Date().toISOString(), task: t.order, kind: t.kind, seat: r.seat, effort: r.effort, predictedPass: r.predictedPass ?? 0.5, passed: r.통과,
    score: { met: Number(r.점수.split("/")[0]), total: Number(r.점수.split("/")[1]) }, usd: r.usd, sec: r.sec });
  writeFileSync(`${OUT}/results${only ? "-" + only : ""}.json`, JSON.stringify({ 결과, 장부 }, null, 1));
}
await browser.close();

/* ─────────────── 판정(잠근 식) ─────────────── */
const 값 = (팔: 팔) => { const xs = 결과.filter((r) => r.팔 === 팔); return { n: xs.length, 통과: xs.filter((r) => r.통과).length, 달러: xs.reduce((a, r) => a + r.usd, 0) / Math.max(1, xs.length), 판단: xs.reduce((a, r) => a + r.판단usd, 0) / Math.max(1, xs.length), 올림: xs.filter((r) => r.seat !== 끔자리), 초: xs.reduce((a, r) => a + r.sec, 0) / Math.max(1, xs.length) }; };
const 끔 = 값("끔");
console.log(`\n끔: ${끔.통과}/${끔.n} · 판당 $${끔.달러.toFixed(3)} · ${Math.round(끔.초)}초`);
for (const 팔 of ["켬", "싼"] as const) {
  const v = 값(팔); const luna = v.n - v.올림.length;
  let 판정: string;
  if (!only && luna >= Math.ceil(v.n * 0.8)) 판정 = `판정 안 냄 — ${v.n}판 중 ${luna}판 luna`;
  else if (v.통과 - 끔.통과 >= 2) 판정 = "일을 한다(통과 2건 이상 많다)";
  else if (v.통과 - 끔.통과 >= -1 && v.달러 <= 끔.달러 * 0.85) 판정 = "일을 한다(통과 비슷 · 15% 이상 싸다)";
  else if (끔.통과 - v.통과 >= 2) 판정 = "해를 끼친다(통과 2건 이상 적다)";
  else 판정 = "구분 안 됨";
  console.log(`${팔 === "켬" ? "켬(머리 gpt-5)" : "켬-싼머리(luna)"}: ${v.통과}/${v.n} · 판당 $${v.달러.toFixed(3)}(판단 $${v.판단.toFixed(3)}) · 위로 올린 판 ${v.올림.length}(통과 ${v.올림.filter((r) => r.통과).length}) · 성적표 ${JSON.stringify(scorecard(장부[팔]))}`);
  console.log(`  **${only ? "(점검 — 판정 아님) " : ""}${판정}**`);
}
