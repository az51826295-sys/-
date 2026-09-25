import { z } from "zod";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import { step } from "@/lib/execution/steps";
import { createImageProvider, type ImageSize } from "@/lib/providers/images";
import { recordUsage } from "@/lib/costs/meter";
import { storeDeliverableFile } from "@/lib/deliverables/files";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";

/**
 * **외주(Out)** — 로키가 못 하는 것을 바깥 AI 에 맡긴다 (216회차 09-25, 사장님 "못하는 건 다른 AI 한테 맡겨").
 *
 * 첫 조각은 **그림**: 로고·포스터·삽화. 접수 자가 "담당이 없다" 고 거절하던 자리다. 그림은 gpt-image-2 가 그린다 —
 * 로키가 하는 것은 셋뿐: 사람 말을 그림 AI 의 주문(영어 프롬프트)으로 옮기기 · 나온 파일을 **자로 재기**(개수·크기·화소) · 누가 만들었는지 적기.
 * 둘째 조각은 **글**: 광고 문구·슬로건·짧은 글. 글 모델이 쓰고, 로키는 개수·길이·숫자 출처·준 사실 사용을 잰다.
 * 예쁜가·끌리나는 자가 없다 — 사람 칸. 그림 AI 는 글자를 자주 틀리게 그리므로, 글자가 든 주문이면 그렇다고 결과에 적는다.
 */
const brief = z.object({
  prompt: z.string().describe("그림 AI 에 줄 영어 주문. 무엇이 보이나·구도·배경·색·스타일. 사람이 준 사실만. 상표·유명인 금지."),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).describe("정방형이면 1024x1024, 세로 포스터면 1024x1536, 가로면 1536x1024."),
  variants: z.number().int().min(1).max(3).describe("몇 장 뽑을지(1~3). 로고·후보 고르기면 2~3, 하나면 1."),
  textInImage: z.string().describe("그림 안에 넣어 달라는 글자가 있으면 그 글자 그대로. 없으면 빈 문자열."),
  why: z.string().describe("사람이 읽는 한 줄: 이 주문을 왜 이렇게 옮겼나."),
});
type Brief = z.infer<typeof brief>;
type Case = { name: string; result: "Passed" | "Failed"; message: string };

/** 글 외주: 광고 문구·슬로건·짧은 글·초안. 만드는 건 글 모델, 로키는 주문·자·만든 이. */
const textOut = z.object({
  title: z.string().describe("무엇을 냈나 한 줄."),
  items: z.array(z.string()).describe("주문한 개수만큼. 하나에 한 문구/단락. 사람이 준 사실만 — 없는 숫자·이름·약속 금지."),
  why: z.string().describe("사람이 읽는 한 줄: 어떤 결로 썼나."),
});
type TextOut = z.infer<typeof textOut>;

export function isImageAsk(ask: string): boolean { return /로고|그림|포스터|썸네일|삽화|이미지|일러스트|아이콘|배너/.test(ask); }
/** "5개"·"3가지"·"7줄"·"문구 4개". 없으면 5. 1~20. */
export function wantedCount(ask: string, fallback = 5): number {
  const m = ask.match(/(\d{1,2})\s*(개|가지|줄|문구|편|안)/);
  return m ? Math.max(1, Math.min(20, Number(m[1]))) : fallback;
}
/** 주문의 "- " 줄(쓸 수 있는 사실). Deck 과 같은 읽기. */
export function askFacts(ask: string): string[] {
  return ask.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()).filter((l) => l.length >= 4);
}
const tok = (t: string) => (t.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((w) => w.toLowerCase());

/** 글 자 — 모델 0: 개수 · 길이(문구는 60자) · 숫자는 주문에 있는 것만 · 준 사실 사용. */
export function judgeText(ask: string, out: TextOut, want: number): Case[] {
  const c: Case[] = [];
  c.push({ name: "개수_주문대로", result: out.items.length === want ? "Passed" : "Failed", message: `${out.items.length}개 (주문 ${want})` });
  const isCopy = /문구|슬로건|카피|한 ?줄|제목/.test(ask);
  if (isCopy) {
    const long = out.items.filter((x) => x.length > 60).length;
    c.push({ name: "문구_60자이하", result: long ? "Failed" : "Passed", message: long ? `${long}개가 60자 넘음` : "모두 60자 이하" });
  }
  const nums = [...new Set(out.items.join(" ").match(/\d+(?:[.,]\d+)?/g) ?? [])];
  const askNums = new Set(ask.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const alien = nums.filter((n) => !askNums.has(n));
  c.push({ name: "숫자_주문에_있는_것만", result: alien.length ? "Failed" : "Passed", message: alien.length ? `주문에 없는 숫자: ${alien.slice(0, 5).join(", ")}` : (nums.length ? "숫자 모두 주문에 있음" : "숫자 없음") });
  const facts = askFacts(ask);
  if (facts.length) {
    const text = out.items.join(" ").toLowerCase();
    const used = facts.filter((f) => { const t = tok(f); const hit = t.filter((w) => text.includes(w)).length; return t.length ? hit >= Math.min(2, t.length) && hit / t.length >= 0.4 : false; });
    c.push({ name: "준_사실_사용", result: used.length * 2 >= facts.length ? "Passed" : "Failed", message: `준 사실 ${facts.length}개 중 ${used.length}개 쓰임` });
  }
  return c;
}

/** PNG 머리에서 가로·세로를 읽는다(IHDR, 16~24 바이트). 모델 0, 라이브러리 0. */
export function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

/** 그림 자 — 모델 0. */
export function judgeImages(b: Brief, files: { bytes: Uint8Array }[]): Case[] {
  const c: Case[] = [];
  c.push({ name: "장수_주문대로", result: files.length === b.variants ? "Passed" : "Failed", message: `${files.length}장 (주문 ${b.variants})` });
  const small = files.filter((f) => f.bytes.length < 10_000).length;
  c.push({ name: "빈_그림_없음", result: small ? "Failed" : "Passed", message: small ? `${small}장이 10KB 미만` : "모두 10KB 이상" });
  const [W, H] = b.size.split("x").map(Number);
  const wrong = files.map((f) => pngSize(f.bytes)).filter((d) => !d || d.w !== W || d.h !== H).length;
  c.push({ name: "화소_주문대로", result: wrong ? "Failed" : "Passed", message: wrong ? `${wrong}장이 ${b.size} 가 아님` : `모두 ${b.size}` });
  return c;
}

const verdictOf = (cases: Case[]) => {
  const passed = cases.filter((k) => k.result === "Passed").length;
  return { verdict: passed === cases.length ? "PASS" : passed * 2 >= cases.length ? "PARTIAL" : "FAIL", passed, failed: cases.length - passed, cases, scales: false, rate: Number((passed / Math.max(1, cases.length)).toFixed(4)) };
};

async function submit(ctx: SkillRunContext, title: string, type: string, markdown: string, content: unknown, model: string): Promise<string> {
  const { data: saved, error } = await ctx.supabase.rpc("submit_generated_deliverable", {
    p_execution_id: ctx.executionId, p_title: title, p_deliverable_type: type,
    p_content_markdown: markdown, p_content_json: content, p_generation_model: model, p_citations: [],
  });
  if (error) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", error.message);
  const rpc = saved as { ok: boolean; reason?: string; deliverableId?: string };
  if (!rpc.ok && !(rpc.reason === "already_submitted" && rpc.deliverableId)) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason ?? "unknown");
  return rpc.deliverableId as string;
}

async function runText(ctx: SkillRunContext, ask: string) {
  const want = wantedCount(ask);
  await setStep(ctx.supabase, ctx.executionId, "planning");
  const write = (failed: string[]) => ctx.providers.ai.generateStructuredOutput({
    systemInstructions: [
      "너는 바깥 글 AI 다. 사람이 시킨 짧은 글(광고 문구·슬로건·소개 글·초안)을 한국어로 쓴다.",
      `- 정확히 ${want}개. 하나에 한 문구/단락.`,
      "- 사람이 준 사실만 쓴다. 주문에 없는 숫자·이름·기간·약속을 넣지 마라. '쓸 수 있는 사실' 줄이 있으면 그것으로만.",
      "- 광고 문구·슬로건이면 60자 이하. 말투는 하나로.",
      failed.length ? `지난 판에서 자에 걸린 것(고쳐서 다시): ${failed.join(" / ")}` : "",
    ].filter(Boolean).join("\n"),
    input: `주문: ${ask}`,
    schema: textOut, schemaName: "text_outsource", maxTokens: 16000, tier: "judgment",
  });
  let r = await step(ctx.supabase, ctx.executionId, "text", async () => await write([]));
  let out = r.output as TextOut;
  await setStep(ctx.supabase, ctx.executionId, "verifying");
  let cases = judgeText(ask, out, want);
  if (cases.some((k) => k.result === "Failed")) {
    const failed = cases.filter((k) => k.result === "Failed").map((k) => `${k.name}: ${k.message}`);
    r = await step(ctx.supabase, ctx.executionId, "text2", async () => await write(failed));
    out = r.output as TextOut; cases = judgeText(ask, out, want);
  }
  const v = verdictOf(cases);
  const madeBy = (r as { model?: string }).model ?? ctx.providers.ai.model;
  const markdown = [
    `## ${out.title}`, "", `**이 글은 ${madeBy} 가 썼어요.** 로키는 주문을 옮기고 결과를 잰 것뿐이에요.`, `왜: ${out.why}`, "",
    ...out.items.map((x, i) => `${i + 1}. ${x}`), "",
    `## 자 (${v.passed}/${cases.length})`, "| 자 | 결과 | 메모 |", "|---|---|---|",
    ...cases.map((k) => `| ${k.name} | ${k.result === "Passed" ? "✅" : "❌"} | ${k.message} |`),
    "", "잘 읽히나·끌리나는 자가 없어요 — 사장님 눈으로. 마음에 드는 번호를 말해 주시면 그 결로 더 써요.",
  ].join("\n");
  const content = { kind: "text", items: out.items, madeBy, want, verdict: v, humanGate: ["잘 읽히나", "끌리나"] };
  const deliverableId = await submit(ctx, out.title, "document", markdown, content, madeBy);
  return { deliverableId, deliverableType: "document", metrics: { candidateCount: cases.length, selectedCount: v.passed, items: out.items.length } };
}

/** 번역·현지화(217회차): 주문의 "- " 줄을 그대로 옮긴다. 만드는 건 글 모델, 로키는 개수·빈 줄·숫자·자리표시자·글자 수 제한·원문 그대로 아님을 잰다. */
const transOut = z.object({
  title: z.string().describe("무엇을 옮겼나 한 줄."),
  items: z.array(z.object({ src: z.string().describe("원문 그대로"), out: z.string().describe("옮긴 글") })).describe("주문의 줄마다 하나, 순서대로."),
  why: z.string().describe("사람이 읽는 한 줄: 어떤 결로 옮겼나."),
});
type TransOut = z.infer<typeof transOut>;
export function isTranslateAsk(ask: string): boolean { return /번역|현지화|영어로|일본어로|중국어로|translate|localiz/i.test(ask); }
/** "24자 이하"·"20 chars" → 24. 없으면 0(제한 없음). */
export function charLimit(ask: string): number { const m = ask.match(/([0-9]{1,3})\s*(자|글자|chars?)\s*(이하|안|이내|max)?/); return m ? Number(m[1]) : 0; }
const PLACEHOLDER = new RegExp("[{][0-9A-Za-z_]+[}]|%[sd]|<[^>]+>", "g");
const DIGITS = new RegExp("[0-9]+", "g");
export function judgeTranslate(ask: string, out: TransOut, srcLines: string[], limit: number): Case[] {
  const c: Case[] = [];
  c.push({ name: "개수_같음", result: out.items.length === srcLines.length ? "Passed" : "Failed", message: `${out.items.length}줄 (원문 ${srcLines.length})` });
  const order = out.items.filter((it, i) => srcLines[i] !== undefined && it.src.trim() !== srcLines[i].trim()).length;
  c.push({ name: "원문_순서대로", result: order ? "Failed" : "Passed", message: order ? `${order}줄의 원문이 주문과 다름` : "원문 줄이 주문과 같음" });
  const empty = out.items.filter((it) => !it.out.trim()).length;
  c.push({ name: "빈_줄_없음", result: empty ? "Failed" : "Passed", message: empty ? `${empty}줄이 비었음` : "빈 줄 없음" });
  const same = out.items.filter((it) => /[가-힣]/.test(it.src) && it.out.trim() === it.src.trim()).length;
  c.push({ name: "원문_그대로_아님", result: same ? "Failed" : "Passed", message: same ? `${same}줄이 원문 그대로` : "모두 옮김" });
  const numBad = out.items.filter((it) => (it.src.match(DIGITS) ?? []).join(",") !== (it.out.match(DIGITS) ?? []).join(",")).length;
  c.push({ name: "숫자_보존", result: numBad ? "Failed" : "Passed", message: numBad ? `${numBad}줄의 숫자가 다름` : "숫자 그대로" });
  const phBad = out.items.filter((it) => (it.src.match(PLACEHOLDER) ?? []).sort().join(",") !== (it.out.match(PLACEHOLDER) ?? []).sort().join(",")).length;
  c.push({ name: "자리표시자_보존", result: phBad ? "Failed" : "Passed", message: phBad ? `${phBad}줄의 {n}·%s·<태그> 가 다름` : "자리표시자 그대로" });
  if (limit) { const long = out.items.filter((it) => it.out.length > limit).length; c.push({ name: `글자수_${limit}자이하`, result: long ? "Failed" : "Passed", message: long ? `${long}줄이 ${limit}자 넘음` : `모두 ${limit}자 이하` }); }
  return c;
}
async function runTranslate(ctx: SkillRunContext, ask: string) {
  const srcLines = askFacts(ask);
  if (!srcLines.length) throw new ExecutionError("CONTEXT_INCOMPLETE", "옮길 문구가 없다. 한 줄에 하나씩 '- ' 로 적어야 한다.");
  const limit = charLimit(ask);
  await setStep(ctx.supabase, ctx.executionId, "planning");
  const write = (failed: string[]) => ctx.providers.ai.generateStructuredOutput({
    systemInstructions: [
      "너는 바깥 번역 AI 다. 주문의 '- ' 줄을 순서대로, 줄마다 하나씩 옮긴다. 합치거나 빼지 마라.",
      "- `src` 는 원문 글자 그대로. `out` 은 옮긴 글. 숫자·{n}·%s·<태그> 는 그대로 둔다.",
      limit ? `- 옮긴 글은 ${limit}자 이하. 넘치면 더 짧은 말을 고른다.` : "",
      "- 주문이 말한 말투(예: 게임 UI, 짧게)를 따른다. 설명을 덧붙이지 마라.",
      failed.length ? `지난 판에서 자에 걸린 것(고쳐서 다시): ${failed.join(" / ")}` : "",
    ].filter(Boolean).join(String.fromCharCode(10)),
    input: `주문: ${ask}`,
    schema: transOut, schemaName: "text_translate", maxTokens: 16000, tier: "judgment",
  });
  let r = await step(ctx.supabase, ctx.executionId, "translate", async () => await write([]));
  let out = r.output as TransOut;
  await setStep(ctx.supabase, ctx.executionId, "verifying");
  let cases = judgeTranslate(ask, out, srcLines, limit);
  if (cases.some((k) => k.result === "Failed")) {
    const failed = cases.filter((k) => k.result === "Failed").map((k) => `${k.name}: ${k.message}`);
    r = await step(ctx.supabase, ctx.executionId, "translate2", async () => await write(failed));
    out = r.output as TransOut; cases = judgeTranslate(ask, out, srcLines, limit);
  }
  const v = verdictOf(cases);
  const madeBy = (r as { model?: string }).model ?? ctx.providers.ai.model;
  const markdown = [
    `## ${out.title}`, "", `**이 번역은 ${madeBy} 가 했어요.** 로키는 주문을 옮기고 결과를 잰 것뿐이에요.`, `왜: ${out.why}`, "",
    "| 원문 | 옮긴 글 |", "|---|---|", ...out.items.map((it) => `| ${it.src} | ${it.out} |`), "",
    `## 자 (${v.passed}/${cases.length})`, "| 자 | 결과 | 메모 |", "|---|---|---|",
    ...cases.map((k) => `| ${k.name} | ${k.result === "Passed" ? "✅" : "❌"} | ${k.message} |`),
    "", "자연스러운가는 자가 없어요 — 사장님 눈으로.",
  ].join(String.fromCharCode(10));
  const content = { kind: "translate", items: out.items, madeBy, limit, verdict: v, humanGate: ["자연스러운가"] };
  const deliverableId = await submit(ctx, out.title, "document", markdown, content, madeBy);
  return { deliverableId, deliverableType: "document", metrics: { candidateCount: cases.length, selectedCount: v.passed, items: out.items.length } };
}

export const outsourceSkill: EmployeeSkill = {
  id: "outsource",
  deliverableType: "image",
  capabilities: [
    {
      id: "outsource_image",
      label:
        "그림·로고·포스터·삽화를 바깥 그림 AI(gpt-image-2)에 맡긴다 — 로키는 주문을 옮기고 결과를 잰다. " +
        "'로고 만들어 줘'·'포스터 그려 줘'·'썸네일 하나'·'그림 하나 뽑아 줘' 는 여기 / Make a logo or picture with an image model",
      produces: "PNG 1~3장(주문한 크기) + 그림 AI 에 준 주문 + 자(장 수·빈 그림·화소) + 누가 만들었는지",
    },
    {
      id: "outsource_text",
      label:
        "광고 문구·슬로건·짧은 글·초안을 바깥 글 AI 에 맡긴다 — 로키는 개수·길이·숫자 출처·준 사실 사용을 잰다. " +
        "'인스타 광고 문구 5개'·'슬로건 3개'·'소개 글 한 단락' 은 여기 / Write ad copy or short text with a text model",
      produces: "주문한 개수의 문구/단락 + 자(개수·길이·주문에 없는 숫자·준 사실) + 누가 만들었는지",
    },
    {
      id: "outsource_translate",
      label:
        "문구 번역·현지화(게임 UI·버튼·오류 메시지 등)를 바깥 번역 AI 에 맡긴다 — 줄마다 옮기고 로키가 개수·숫자·자리표시자·글자 수 제한을 잰다. " +
        "'이 문구들 영어로 번역해 줘'·'버튼 글자 현지화' 는 여기 / Translate or localize UI strings line by line",
      produces: "원문·옮긴 글 표 + 자(개수·순서·빈 줄·원문 그대로 아님·숫자·자리표시자·글자 수) + 누가 만들었는지",
    },
  ],
  acceptsInternalRequests: true,

  async run(ctx: SkillRunContext) {
    const ask = `${ctx.context.assignment.title}\n${ctx.context.assignment.description ?? ""}`;
    if (ask.trim().length < 4) throw new ExecutionError("CONTEXT_INCOMPLETE", "무엇을 만들지 한 줄이 필요하다.");
    // 217회차: 접수가 고른 능력 id 가 오면 그것으로 가른다. 없으면(도구로 넣은 판) 말의 낱말로.
    const capId = (ctx.context.roleInput as { capabilityId?: string | null } | null)?.capabilityId ?? null;
    if (capId === "outsource_translate" || (!capId && isTranslateAsk(ask))) return runTranslate(ctx, ask);
    const image = capId ? capId === "outsource_image" : isImageAsk(ask);
    if (!image) return runText(ctx, ask);

    await setStep(ctx.supabase, ctx.executionId, "planning");
    const b = (await step(ctx.supabase, ctx.executionId, "brief", async () => (await ctx.providers.ai.generateStructuredOutput({
      systemInstructions: [
        "너는 사람 말을 그림 AI 의 주문으로 옮기는 담당이다. 그림은 네가 그리지 않는다 — gpt-image-2 가 그린다.",
        "- `prompt` 는 영어. 보이는 것만 적는다(무엇·구도·배경·색·스타일·빛). 사람이 준 사실만. 상표·유명인·실존 로고 금지.",
        "- 사람이 글자를 넣으라 했으면 `textInImage` 에 그 글자 그대로 적고 prompt 에도 넣는다. 그림 AI 는 글자를 자주 틀리게 그린다 — 그래도 시키는 대로.",
        "- 로고면 배경은 단순하게, 후보를 2~3장. 포스터·삽화면 1~2장.",
        "- 사람이 크기·비율을 말했으면 size 를 그에 맞춘다. 안 말했으면 로고 1024x1024, 세로 포스터 1024x1536.",
        "- `why` 는 사람 말로 한 줄.",
      ].join("\n"),
      input: `주문: ${ask}`,
      schema: brief, schemaName: "image_outsource_brief", maxTokens: 16000, tier: "judgment",
    })).output)) as Brief;

    await setStep(ctx.supabase, ctx.executionId, "generating");
    const drawer = createImageProvider();
    const files: { bytes: Uint8Array; model: string }[] = [];
    const errors: string[] = [];
    for (let i = 0; i < b.variants; i++) {
      try {
        const img = await drawer.draw(b.prompt, "low", b.size as ImageSize);
        const bytes = Uint8Array.from(Buffer.from(img.dataUrl.split(",")[1] ?? "", "base64"));
        files.push({ bytes, model: img.model });
        await recordUsage(ctx.supabase, { companyId: ctx.execution.company_id, workExecutionId: ctx.executionId, companyEmployeeId: ctx.execution.company_employee_id },
          { model: img.model, purpose: "image_outsource", inputTokens: img.inputTokens, outputTokens: img.outputTokens });
      } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); console.warn(`[out] 그림 ${i + 1} 못 받음:`, errors.at(-1)); }
    }
    if (!files.length) throw new ExecutionError("SOURCE_FETCH_FAILED", `그림 AI 가 한 장도 주지 않았다: ${errors.join(" / ").slice(0, 200)}`);

    await setStep(ctx.supabase, ctx.executionId, "verifying");
    const cases = judgeImages(b, files);
    const v = verdictOf(cases);
    const madeBy = files[0]?.model ?? "gpt-image-2";
    const markdown = [
      `## ${ctx.context.assignment.title}`, "",
      `**이 그림은 로키가 아니라 ${madeBy} 가 만들었어요.** 로키는 주문을 옮기고 결과를 잰 것뿐이에요.`, "",
      `그림 AI 에 준 주문: \`${b.prompt}\``, `왜: ${b.why}`,
      b.textInImage ? `그림 안 글자 요청: "${b.textInImage}" — 그림 AI 는 글자를 자주 틀리게 그려요. 글자는 꼭 확인하세요.` : "",
      "", `## 자 (${v.passed}/${cases.length})`, "| 자 | 결과 | 메모 |", "|---|---|---|",
      ...cases.map((k) => `| ${k.name} | ${k.result === "Passed" ? "✅" : "❌"} | ${k.message} |`),
      errors.length ? `\n못 받은 장: ${errors.length} (${errors[0]?.slice(0, 80)})` : "",
      "", "예쁜가·쓸 만한가는 자가 없어요 — 사장님 눈으로. 마음에 드는 장을 말해 주시면 그 방향으로 더 뽑아요.",
    ].join("\n");
    const content = { kind: "image", brief: b, madeBy, variants: files.length, errors, verdict: v, humanGate: ["예쁜가", "쓸 만한가", "글자가 맞나"] };
    const deliverableId = await submit(ctx, ctx.context.assignment.title, "image", markdown, content, madeBy);
    for (const [i, f] of files.entries()) {
      await storeDeliverableFile(ctx.supabase, {
        companyId: ctx.execution.company_id, deliverableId, filename: `image-${i + 1}.png`, body: f.bytes, kind: "image", mimeType: "image/png",
        title: `그림 ${i + 1}/${files.length}`, description: b.prompt.slice(0, 200), producedByBackend: f.model,
      });
    }
    return { deliverableId, deliverableType: "image", metrics: { candidateCount: cases.length, selectedCount: v.passed, images: files.length } };
  },
};
