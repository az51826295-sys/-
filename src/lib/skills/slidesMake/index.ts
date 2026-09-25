import { z } from "zod";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import { step } from "@/lib/execution/steps";
import { runWeb } from "@/lib/skills/appBuild/run";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";

/**
 * 슬라이드(발표 자료) — 말 한 줄로 **한 파일 HTML 발표 자료**를 낸다 (214회차 09-25).
 *
 * 사장님 "무엇이든 만들 수 있는가 — 광고·영상·게임·ppt": 접수 자가 "PPT 담당이 없다" 고 정직하게 거절하던 자리를 채운다.
 * .pptx 가 아니라 브라우저에서 열리는 HTML 한 장이다 — 로키가 이미 잘 재는 길(헤드리스)로 잴 수 있고, 어디서나 열린다.
 * 뼈대는 분석(Ana)과 같다: 계획(모델) → 렌더(코드, 모델 0) → **자**(코드) → 떨어지면 한 번 다시 → 결과물.
 *
 * 자(모델 아님): 장 수가 주문 안인가 · 글머리 4개 이하 · 글머리 40자 이하 · 첫 장은 제목만 · 헤드리스에서 오류 0 으로 열리고 제목 글자가 보이는가.
 * 예쁜가·설득되는가는 자가 없다 — 사람 칸.
 */
const plan = z.object({
  title: z.string().describe("발표 제목. 짧게."),
  subtitle: z.string().describe("부제 또는 한 줄 설명. 없으면 빈 문자열."),
  audience: z.string().describe("누가 보는 자료인가 한 줄."),
  slides: z.array(z.object({
    heading: z.string().describe("장 제목, 12자 안팎."),
    bullets: z.array(z.string()).describe("글머리 1~4개, 하나에 40자 이하. 첫 장(제목 장)은 0~1개."),
    note: z.string().describe("발표자 노트 한두 문장. 없으면 빈 문자열."),
  })).describe("첫 장은 제목 장. 마지막 장은 맺음(요청·다음 할 일)."),
});
type Plan = z.infer<typeof plan>;
type Case = { name: string; result: "Passed" | "Failed"; message: string };

const MAX_BULLETS = 4, MAX_CHARS = 40;

/** 주문에서 장 수를 읽는다. "10장"·"8페이지"·"12 슬라이드". 없으면 8. 3~30 으로 자른다. */
export function wantedSlides(ask: string): number {
  const m = ask.match(/(\d{1,2})\s*(장|페이지|슬라이드|slides?|pages?)/i);
  const n = m ? Number(m[1]) : 8;
  return Math.max(3, Math.min(30, n));
}

/** 재료가 모자라면 장 수를 깎는다(218회차, 사장님이 결정을 위임): 사실 N개면 제목·맺음 더해 N+2 장이 상한. 첫 판이 사실 3개를 8장에 펴 "파일 형식 — mp4·문서" 한 장을 만들었다. */
export function fitWant(ask: string, want: number): { want: number; note: string } {
  const facts = givenFacts(ask);
  if (!facts.length) return { want, note: "" };
  const cap = Math.max(3, facts.length + 2);
  return want > cap + 1 ? { want: cap, note: `재료(쓸 수 있는 사실)가 ${facts.length}개라 주문 ${want}장 대신 ${cap}장으로 줄였어요 — 없는 말을 채워 장을 늘리지 않으려고요.` } : { want, note: "" };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 한 파일 HTML. 바깥 자원 없음. 화살표·클릭으로 넘긴다. 인쇄하면 한 장에 한 슬라이드. */
export function renderDeck(p: Plan): string {
  const slides = p.slides.map((s, i) => {
    const isTitle = i === 0;
    const items = s.bullets.map((b) => `<li>${esc(b)}</li>`).join("");
    return `<section class="slide${isTitle ? " title" : ""}" data-n="${i + 1}">` +
      (isTitle ? `<h1>${esc(s.heading || p.title)}</h1><p class="sub">${esc(p.subtitle)}</p>` : `<h2>${esc(s.heading)}</h2>`) +
      (items ? `<ul>${items}</ul>` : "") +
      (s.note ? `<aside class="note">${esc(s.note)}</aside>` : "") +
      `</section>`;
  });
  return [
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${esc(p.title)}</title>`,
    `<style>`,
    `:root{--bg:#0f1720;--ink:#f3f6fa;--accent:#5bd3ff;--dim:#9fb0c0}`,
    `html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI","Noto Sans KR",sans-serif}`,
    `.slide{display:none;box-sizing:border-box;width:100vw;height:100vh;padding:7vh 9vw;flex-direction:column;justify-content:center}`,
    `.slide.on{display:flex}`,
    `h1{font-size:7vmin;margin:0 0 2vh;line-height:1.15}h2{font-size:5.5vmin;margin:0 0 3vh;color:var(--accent)}`,
    `.sub{font-size:3vmin;color:var(--dim);margin:0}ul{margin:0;padding-left:1.2em;font-size:3.6vmin;line-height:1.6}li{margin:.4em 0}`,
    `.note{display:none}#c{position:fixed;right:2vw;bottom:2vh;color:var(--dim);font-size:2.2vmin}`,
    `#hint{position:fixed;left:2vw;bottom:2vh;color:var(--dim);font-size:2vmin}`,
    `@media print{.slide{display:flex;page-break-after:always;height:100vh}#c,#hint{display:none}}`,
    `</style></head><body>`,
    ...slides,
    `<div id="c"></div><div id="hint">화살표 키 또는 클릭으로 넘김</div>`,
    `<script>`,
    `(function(){var S=[].slice.call(document.querySelectorAll(".slide")),i=0;`,
    `function show(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach(function(s,k){s.classList.toggle("on",k===i)});document.getElementById("c").textContent=(i+1)+" / "+S.length;}`,
    `document.addEventListener("keydown",function(e){if(e.key==="ArrowRight"||e.key===" "||e.key==="PageDown")show(i+1);if(e.key==="ArrowLeft"||e.key==="PageUp")show(i-1);});`,
    `document.addEventListener("click",function(e){show(e.clientX>window.innerWidth/2?i+1:i-1);});`,
    `window.deck={count:S.length,go:show};show(0);})();`,
    `</script></body></html>`,
  ].join("\n");
}

/** 주문의 "쓸 수 있는 사실" 줄들("- " 로 시작). 없으면 빈 배열. */
export function givenFacts(ask: string): string[] {
  const NL = String.fromCharCode(10);
  const lines = ask.split(NL).map((l) => l.trim());
  const start = lines.findIndex((l) => /사실/.test(l) && /:|：|이것뿐/.test(l));
  return lines.slice(start >= 0 ? start + 1 : 0).filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()).filter((l) => l.length >= 4);
}
const tokens = (t: string) => (t.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((w) => w.toLowerCase());
const deckText = (p: Plan) => [p.title, p.subtitle, ...p.slides.flatMap((s) => [s.heading, ...s.bullets, s.note])].join(" ").toLowerCase();

/** 자 — 모델 0. `ask` 를 주면 "준 사실을 썼나"·"확인 필요 비율" 도 잰다(214회차 첫 판: 로키를 북유럽 신으로 알아듣고 전부 '확인 필요'). */
export function judgeDeck(p: Plan, want: number, facts: { ran: boolean; consoleErrors: string[]; text: string } | null, ask = ""): Case[] {
  const c: Case[] = [];
  const given = givenFacts(ask);
  if (given.length) {
    const text = deckText(p);
    const used = given.filter((f) => { const tk = tokens(f); const hit = tk.filter((w) => text.includes(w)).length; return tk.length ? hit >= Math.min(2, tk.length) && hit / tk.length >= 0.4 : false; });
    c.push({ name: "준_사실_사용", result: used.length * 2 >= given.length ? "Passed" : "Failed", message: `준 사실 ${given.length}개 중 ${used.length}개가 장에 쓰임` });
  }
  const bullets = p.slides.flatMap((s) => s.bullets);
  const unknown = bullets.filter((x) => /확인 필요|확인필요|TBD|미정/.test(x)).length;
  c.push({ name: "확인필요_30%이하", result: bullets.length && unknown / bullets.length > 0.3 ? "Failed" : "Passed", message: `글머리 ${bullets.length}개 중 '확인 필요' ${unknown}개` });
  const n = p.slides.length;
  c.push({ name: "장수_목표안", result: Math.abs(n - want) <= 2 ? "Passed" : "Failed", message: `${n}장 (목표 ${want}, ±2)` });
  const tooMany = p.slides.map((s, i) => [i + 1, s.bullets.length] as const).filter(([, k]) => k > MAX_BULLETS);
  c.push({ name: "글머리_4개이하", result: tooMany.length ? "Failed" : "Passed", message: tooMany.length ? `넘친 장: ${tooMany.map(([i, k]) => `${i}장 ${k}개`).join(", ")}` : `모든 장 ${MAX_BULLETS}개 이하` });
  const tooLong = p.slides.flatMap((s, i) => s.bullets.filter((b) => b.length > MAX_CHARS).map((b) => `${i + 1}장 "${b.slice(0, 20)}…"(${b.length}자)`));
  c.push({ name: "글머리_40자이하", result: tooLong.length ? "Failed" : "Passed", message: tooLong.length ? tooLong.slice(0, 3).join(", ") : `모든 글머리 ${MAX_CHARS}자 이하` });
  c.push({ name: "첫장_제목만", result: (p.slides[0]?.bullets.length ?? 9) <= 1 ? "Passed" : "Failed", message: `첫 장 글머리 ${p.slides[0]?.bullets.length ?? "?"}개` });
  if (facts) {
    c.push({ name: "브라우저_오류0", result: facts.ran && facts.consoleErrors.length === 0 ? "Passed" : "Failed", message: facts.ran ? `콘솔 오류 ${facts.consoleErrors.length}` : "열리지 않음" });
    // 헤드리스는 돌려 보는 동안 누르고 키를 쳐서 마지막 장에 가 있다 — 제목 대신 **쪽수 표시 "k / N"** 이 화면에 있는지 본다(대본이 돌았고 장 수가 맞다는 뜻).
    const counterSeen = facts.text.includes(` / ${p.slides.length}`);
    c.push({ name: "화면에_쪽수_보임", result: counterSeen ? "Passed" : "Failed", message: counterSeen ? `쪽수 표시 "/ ${p.slides.length}" 가 화면에 있다` : `쪽수 표시 "/ ${p.slides.length}" 를 화면에서 못 찾음 — 대본이 안 돌았거나 장 수가 다르다` });
  } else c.push({ name: "브라우저_오류0", result: "Failed", message: "헤드리스를 못 열어 못 잼(통과 아님)" });
  return c;
}

function render(p: Plan, cases: Case[], want: number, note = ""): string {
  const passed = cases.filter((k) => k.result === "Passed").length;
  return [
    `## ${p.title}`, p.subtitle ? `_${p.subtitle}_` : "", `보는 사람: ${p.audience} · ${p.slides.length}장 (목표 ${want}장)`, note ? `_${note}_` : "", "",
    "브라우저에서 deck.html 을 열고 화살표 키로 넘깁니다. 인쇄하면 한 장에 한 슬라이드.", "",
    "## 차례", ...p.slides.map((s, i) => `${i + 1}. **${s.heading}**${s.bullets.length ? " — " + s.bullets.join(" · ") : ""}`), "",
    `## 자 (${passed}/${cases.length})`, "| 자 | 결과 | 메모 |", "|---|---|---|",
    ...cases.map((k) => `| ${k.name} | ${k.result === "Passed" ? "✅" : "❌"} | ${k.message} |`),
    "", "예쁜가·설득되는가는 자가 없어요 — 사장님 눈으로.",
  ].join("\n");
}

export const slidesMakeSkill: EmployeeSkill = {
  id: "slides_make",
  deliverableType: "slides",
  capabilities: [
    {
      id: "slide_deck",
      label:
        "발표 자료(슬라이드·PPT) 만들기 — 주제와 장 수를 말하면 브라우저에서 열리는 한 파일 발표 자료를 만든다. " +
        "'발표 자료 10장 만들어 줘'·'PPT 만들어 줘'·'슬라이드로 정리해 줘' 는 여기 / Make a slide deck",
      produces: "한 파일 HTML 슬라이드(화살표로 넘김, 인쇄 가능) + 차례 + 자(장 수·글머리·브라우저 오류) 결과",
    },
  ],
  acceptsInternalRequests: true,

  async run(ctx: SkillRunContext) {
    const ask = `${ctx.context.assignment.title}\n${ctx.context.assignment.description ?? ""}`;
    if (ask.trim().length < 6) throw new ExecutionError("CONTEXT_INCOMPLETE", "무엇에 대한 발표 자료인지 한 줄이 필요하다.");
    const asked = wantedSlides(ask);
    const fitted = fitWant(ask, asked);
    const want = fitted.want;
    if (fitted.note) console.log("[slides] " + fitted.note);

    await setStep(ctx.supabase, ctx.executionId, "planning");
    const write = (failed: string[]) => ctx.providers.ai.generateStructuredOutput({
      systemInstructions: [
        "너는 이 회사의 발표 자료 담당이다. 사람이 한 말로 발표 자료의 뼈대를 짠다. 한국어.",
        `이 회사: ${ctx.context.companyKnowledge.companySummary || "(모름)"} / 고객: ${ctx.context.companyKnowledge.customerSummary || "(모름)"} / 푸는 문제: ${ctx.context.companyKnowledge.problemSummary || "(모름)"}`,
        "- 주문에 나오는 이름(예: 로키)은 **이 회사·제품의 이름**이다. 신화·다른 뜻으로 읽지 마라.",
        "- 주문에 '쓸 수 있는 사실' 이 있으면 **그 사실로만** 장을 짠다. 사실 하나가 한 장이 되어도 좋다. 사실에 없는 칸을 '확인 필요' 로 채워 장을 늘리지 마라 — 모르는 것은 아예 장을 만들지 않는다.",
        `- 장 수는 ${want}장 안팎(±2). 첫 장은 제목 장(글머리 0~1개), 마지막 장은 맺음.`,
        `- 한 장에 글머리 1~${MAX_BULLETS}개, 글머리 하나는 ${MAX_CHARS}자 이하. 문장이 아니라 말머리.`,
        "- 사람이 준 사실만 쓴다. 숫자·이름을 지어내지 마라. 모르는 것은 '확인 필요' 로 적는다.",
        "- 장마다 발표자 노트 한두 문장.",
        failed.length ? `지난 판에서 자에 걸린 것(고쳐서 다시): ${failed.join(" / ")}` : "",
      ].filter(Boolean).join("\n"),
      input: `업무: ${ctx.context.assignment.title}\n설명: ${ctx.context.assignment.description ?? ""}`,
      schema: plan, schemaName: "slide_deck_plan", maxTokens: 8000, tier: "judgment",
    });
    let p = (await step(ctx.supabase, ctx.executionId, "plan", async () => (await write([])).output)) as Plan;

    await setStep(ctx.supabase, ctx.executionId, "generating");
    let html = renderDeck(p);
    await setStep(ctx.supabase, ctx.executionId, "verifying");
    const look = async (h: string) => {
      try {
        const f = await runWeb([{ path: "deck.html", language: "html", contents: h }], { mobile: false, actions: [{ do: "wait", ms: 500 }] });
        return { ran: f.ran, consoleErrors: f.consoleErrors, text: f.text };
      } catch (e) { console.warn("[slides] 헤드리스 못 열음:", e instanceof Error ? e.message : e); return null; }
    };
    let cases = judgeDeck(p, want, await look(html), ask);
    if (cases.some((k) => k.result === "Failed")) {
      const failed = cases.filter((k) => k.result === "Failed").map((k) => `${k.name}: ${k.message}`);
      p = (await step(ctx.supabase, ctx.executionId, "plan2", async () => (await write(failed)).output)) as Plan;
      html = renderDeck(p);
      cases = judgeDeck(p, want, await look(html), ask);
    }
    const passed = cases.filter((k) => k.result === "Passed").length, failedN = cases.length - passed;

    const content = {
      outline: p, want, asked, fitNote: fitted.note,
      files: [{ path: "deck.html", language: "html", contents: html }],
      howToRun: "deck.html 을 브라우저에서 열고 화살표 키로 넘긴다.",
      verdict: { verdict: failedN === 0 ? "PASS" : passed >= failedN ? "PARTIAL" : "FAIL", passed, failed: failedN, cases, scales: false, rate: Number((passed / cases.length).toFixed(4)) },
      humanGate: ["예쁜가", "설득되는가", "빠진 장이 없는가"],
    };
    const { data: saved, error } = await ctx.supabase.rpc("submit_generated_deliverable", {
      p_execution_id: ctx.executionId, p_title: p.title, p_deliverable_type: "slides",
      p_content_markdown: render(p, cases, want, fitted.note), p_content_json: content, p_generation_model: ctx.providers.ai.model, p_citations: [],
    });
    if (error) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", error.message);
    const rpc = saved as { ok: boolean; reason?: string; deliverableId?: string };
    if (!rpc.ok && !(rpc.reason === "already_submitted" && rpc.deliverableId)) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason ?? "unknown");
    return { deliverableId: rpc.deliverableId as string, deliverableType: "slides", metrics: { candidateCount: cases.length, selectedCount: passed, slides: p.slides.length } };
  },
};
