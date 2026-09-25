import { z } from "zod";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import { step } from "@/lib/execution/steps";
import { createImageProvider, type ImageSize } from "@/lib/providers/images";
import { recordUsage } from "@/lib/costs/meter";
import { storeDeliverableFile } from "@/lib/deliverables/files";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";

/**
 * **인스타 게시물(Gram)** — 올릴 것을 만든다 (225회차 09-25, 사장님 "하자").
 *
 * 로키가 인스타 자동 업로드 가능성을 조사해 왔고(공식 API·심사 1~4주·사업자 인증), 내 판단은 **순서를 뒤집자** 였다:
 * 심사는 사장님 신분 확인이 걸려 오래 걸리고 내가 대신 못 한다. 올릴 게 없으면 하루 25개 권한도 쓸모가 없다.
 * 그래서 먼저 **만드는 쪽**을 자동으로 한다 — 사장님은 하루 한 번 손으로 올리고, 반응을 다음 판에 먹인다.
 *
 * 한 판이 내는 것: 정사각 그림 1~3장(1080 기준 1024) + 본문(캡션) + 해시태그 + 첫 줄 후보 3개 + 올리는 법.
 * 자(모델 아님): 캡션 2,200자 이하 · 해시태그 3~30개·중복 없음·# 로 시작 · 첫 줄 125자 이하(더 보기 전에 잘리는 자리) ·
 * 준 사실만(주문에 없는 숫자 금지) · 그림 장 수·빈 그림·정사각. 끌리나·예쁜가는 사장님 칸.
 * 자동 업로드는 아직 안 한다 — 붙일 자리는 content.uploadReady 에 그대로 맞춰 두었다(파일·캡션·해시태그).
 */
const plan = z.object({
  title: z.string().describe("이 게시물이 무엇인지 한 줄(사장님이 목록에서 알아볼 이름)."),
  hook: z.string().describe("본문 첫 줄. 125자 이하. 여기서 멈추면 아무도 안 읽는다 — 궁금하게."),
  hookAlts: z.array(z.string()).describe("첫 줄 후보 2개 더. 각 125자 이하. 사장님이 고르게."),
  caption: z.string().describe("본문 전체(첫 줄 포함). 2,200자 이하. 줄바꿈으로 읽기 쉽게. 사람이 준 사실만 — 없는 숫자·약속 금지."),
  hashtags: z.array(z.string()).describe("해시태그 5~15개. '#' 로 시작, 한 단어. 한국어·영어 섞어도 됨. 중복 금지."),
  imagePrompt: z.string().describe("그림 AI 에 줄 영어 주문. 정사각 구도, 글자는 되도록 넣지 마라(그림 AI 는 글자를 자주 틀린다). 상표·유명인 금지."),
  variants: z.number().int().min(1).max(3).describe("그림 몇 장(1~3). 고를 거면 2~3."),
  why: z.string().describe("사장님이 읽는 한 줄: 어떤 결로 썼나."),
});
type Plan = z.infer<typeof plan>;
type Case = { name: string; result: "Passed" | "Failed"; message: string };

const NL = String.fromCharCode(10);
const CAPTION_MAX = 2200, HOOK_MAX = 125, TAG_MIN = 3, TAG_MAX = 30;

export function isSocialAsk(ask: string): boolean {
  return /인스타|instagram|insta\b|게시물|피드|포스팅|릴스|reels|해시태그|sns/i.test(ask);
}
/** 주문의 "- " 줄(쓸 수 있는 사실). Deck·Out 과 같은 읽기. */
export function askFacts(ask: string): string[] {
  return ask.split(NL).map((l) => l.trim()).filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()).filter((l) => l.length >= 4);
}

/** PNG 머리에서 폭·높이. Out 과 같은 자. */
export function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/** 자 — 모델 0. */
export function judgePost(ask: string, p: Plan, imgs: { bytes: Uint8Array }[]): Case[] {
  const c: Case[] = [];
  c.push({ name: "본문_2200자이하", result: p.caption.length <= CAPTION_MAX ? "Passed" : "Failed", message: `${p.caption.length}자 (한도 ${CAPTION_MAX})` });
  const longHooks = [p.hook, ...p.hookAlts].filter((h) => h.length > HOOK_MAX);
  c.push({ name: "첫줄_125자이하", result: longHooks.length ? "Failed" : "Passed", message: longHooks.length ? `${longHooks.length}개가 넘음(가장 긴 것 ${Math.max(...longHooks.map((h) => h.length))}자)` : `첫 줄 ${p.hook.length}자` });
  c.push({ name: "첫줄이_본문_맨앞", result: p.caption.trimStart().startsWith(p.hook.trim().slice(0, 20)) ? "Passed" : "Failed", message: p.caption.trimStart().slice(0, 24) });
  const tags = p.hashtags.map((t) => t.trim());
  const bad = tags.filter((t) => !/^#[^\s#]+$/.test(t));
  const dup = tags.length - new Set(tags.map((t) => t.toLowerCase())).size;
  c.push({ name: "해시태그_개수", result: tags.length >= TAG_MIN && tags.length <= TAG_MAX ? "Passed" : "Failed", message: `${tags.length}개 (${TAG_MIN}~${TAG_MAX})` });
  c.push({ name: "해시태그_모양", result: bad.length || dup ? "Failed" : "Passed", message: bad.length ? `모양이 아닌 것: ${bad.slice(0, 3).join(", ")}` : dup ? `겹친 것 ${dup}개` : "모두 #한단어, 겹침 없음" });
  const shown = `${p.caption}${NL}${tags.join(" ")}`;
  // 숫자는 **본문만** 본다(225회차 자 시험이 잡음): 해시태그의 "#1인창업" 이 "지어낸 숫자 1" 로 걸렸다 —
  // 태그 안의 숫자는 주장이 아니라 이름의 일부다.
  const nums = [...new Set(p.caption.match(/\d+(?:[.,]\d+)?/g) ?? [])];
  const askNums = new Set(ask.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const alien = nums.filter((n) => !askNums.has(n));
  c.push({ name: "숫자_주문에_있는_것만", result: alien.length ? "Failed" : "Passed", message: alien.length ? `주문에 없는 숫자: ${alien.slice(0, 5).join(", ")}` : nums.length ? "숫자 모두 주문에 있음" : "숫자 없음" });
  const facts = askFacts(ask);
  if (facts.length) {
    const text = shown.toLowerCase();
    const used = facts.filter((f) => { const tk = (f.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((w) => w.toLowerCase()); const hit = tk.filter((w) => text.includes(w)).length; return tk.length ? hit / tk.length >= 0.4 : false; });
    c.push({ name: "준_사실_사용", result: used.length * 2 >= facts.length ? "Passed" : "Failed", message: `준 사실 ${facts.length}개 중 ${used.length}개가 쓰임` });
  }
  c.push({ name: "그림_장수", result: imgs.length === p.variants ? "Passed" : "Failed", message: `${imgs.length}장 (계획 ${p.variants})` });
  const blank = imgs.filter((f) => f.bytes.length < 10_000).length;
  c.push({ name: "빈_그림_없음", result: blank ? "Failed" : "Passed", message: blank ? `${blank}장이 10KB 미만` : "모두 10KB 이상" });
  const notSquare = imgs.map((f) => pngSize(f.bytes)).filter((d) => !d || d.w !== d.h).length;
  c.push({ name: "정사각", result: notSquare ? "Failed" : "Passed", message: notSquare ? `${notSquare}장이 정사각이 아님` : `${imgs.length}장 모두 정사각` });
  return c;
}

export const socialPostSkill: EmployeeSkill = {
  id: "social_post",
  deliverableType: "image",
  capabilities: [
    {
      id: "social_post",
      label:
        "인스타그램 게시물 한 벌 만들기 — 정사각 그림 + 본문(캡션) + 해시태그 + 첫 줄 후보 3개. " +
        "'인스타에 올릴 거 만들어 줘'·'게시물 하나'·'피드 올릴 사진이랑 글'·'해시태그까지' 는 여기 / Make an Instagram post",
      produces: "정사각 PNG 1~3장 + 본문(2,200자 이하) + 해시태그 + 첫 줄 후보 + 올리는 법 + 자(길이·해시태그·숫자 출처·그림)",
    },
  ],
  acceptsInternalRequests: true,

  async run(ctx: SkillRunContext) {
    const ask = `${ctx.context.assignment.title}${NL}${ctx.context.assignment.description ?? ""}`;
    if (ask.trim().length < 6) throw new ExecutionError("CONTEXT_INCOMPLETE", "무엇에 대한 게시물인지 한 줄이 필요하다.");

    await setStep(ctx.supabase, ctx.executionId, "planning");
    const write = (failed: string[]) => ctx.providers.ai.generateStructuredOutput({
      systemInstructions: [
        "너는 이 회사의 인스타그램 담당이다. 사장님이 **그대로 올릴 수 있는 게시물 한 벌**을 만든다. 한국어.",
        `이 회사: ${ctx.context.companyKnowledge.companySummary || "(모름)"}`,
        "- 주문에 나오는 이름(예: 로키)은 **이 회사·제품의 이름**이다. 다른 뜻으로 읽지 마라.",
        "- 주문에 '- ' 로 시작하는 사실 줄이 있으면 **그 사실로만** 쓴다. 없는 숫자·기간·약속·후기를 지어내지 마라.",
        `- 첫 줄(hook)은 ${HOOK_MAX}자 이하. 인스타는 첫 줄만 보이고 나머지는 '더 보기' 로 접힌다 — 첫 줄에서 읽을 이유가 나와야 한다.`,
        `- 본문(caption)은 첫 줄로 시작해서 ${CAPTION_MAX}자 이하. 줄바꿈으로 숨 쉬게. 이모지는 적게.`,
        `- 해시태그 5~15개, '#' + 한 단어, 겹치지 않게. 너무 큰 태그만 쓰지 말고 작은 태그를 섞어라.`,
        "- 그림 주문은 영어로, 정사각 구도. **그림 안에 글자를 넣지 마라** — 그림 AI 가 글자를 자주 틀리게 그린다.",
        "- 광고처럼 들리지 않게. 사람이 쓴 것처럼.",
        failed.length ? `지난 판에서 자에 걸린 것(고쳐서 다시): ${failed.join(" / ")}` : "",
      ].filter(Boolean).join(NL),
      input: `주문: ${ask}`,
      schema: plan, schemaName: "instagram_post", maxTokens: 16000, tier: "judgment",
    });
    let p = (await step(ctx.supabase, ctx.executionId, "post", async () => (await write([])).output)) as Plan;

    await setStep(ctx.supabase, ctx.executionId, "generating");
    const drawer = createImageProvider();
    const imgs: { bytes: Uint8Array; model: string }[] = [];
    const errors: string[] = [];
    for (let i = 0; i < p.variants; i++) {
      try {
        const img = await drawer.draw(p.imagePrompt, "low", "1024x1024" as ImageSize);
        imgs.push({ bytes: Uint8Array.from(Buffer.from(img.dataUrl.split(",")[1] ?? "", "base64")), model: img.model });
        await recordUsage(ctx.supabase, { companyId: ctx.execution.company_id, workExecutionId: ctx.executionId, companyEmployeeId: ctx.execution.company_employee_id },
          { model: img.model, purpose: "social_post_image", inputTokens: img.inputTokens, outputTokens: img.outputTokens });
      } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); console.warn(`[gram] 그림 ${i + 1} 못 받음:`, errors.at(-1)); }
    }
    if (!imgs.length) throw new ExecutionError("SOURCE_FETCH_FAILED", `그림 AI 가 한 장도 주지 않았다: ${errors.join(" / ").slice(0, 200)}`);

    await setStep(ctx.supabase, ctx.executionId, "verifying");
    let cases = judgePost(ask, p, imgs);
    // 글만 다시 쓴다 — 그림은 이미 돈이 나갔고, 떨어지는 자는 거의 글 쪽이다.
    if (cases.some((k) => k.result === "Failed" && !/그림|빈_|정사각/.test(k.name))) {
      const failed = cases.filter((k) => k.result === "Failed").map((k) => `${k.name}: ${k.message}`);
      const p2 = (await step(ctx.supabase, ctx.executionId, "post2", async () => (await write(failed)).output)) as Plan;
      p = { ...p2, variants: p.variants, imagePrompt: p.imagePrompt };
      cases = judgePost(ask, p, imgs);
    }
    const passed = cases.filter((k) => k.result === "Passed").length, failedN = cases.length - passed;
    const tags = p.hashtags.join(" ");
    const madeBy = imgs[0]?.model ?? ctx.providers.ai.model;

    const markdown = [
      `## ${p.title}`, "", `_${p.why}_`, "",
      "### 올리는 법", "1. 아래 그림을 내려받아요. 2. 인스타 → 새 게시물 → 그 그림. 3. 본문을 복사해 붙여 넣어요(해시태그까지).", "",
      "### 본문 (그대로 복사)", "```", `${p.caption}`, "", tags, "```", "",
      `### 첫 줄 후보 — 마음에 드는 번호를 말해 주시면 그 결로 다시 써요`,
      `1. ${p.hook}`, ...p.hookAlts.map((h, i) => `${i + 2}. ${h}`), "",
      `그림은 ${madeBy} 가 그렸어요. 자동 업로드는 아직 안 해요 — 인스타 심사(1~4주, 사업자 확인)가 필요해서, 먼저 올려 보고 반응이 쌓이면 붙일게요.`, "",
      `## 자 (${passed}/${cases.length})`, "| 자 | 결과 | 메모 |", "|---|---|---|",
      ...cases.map((k) => `| ${k.name} | ${k.result === "Passed" ? "✅" : "❌"} | ${k.message} |`),
      "", "끌리나·예쁜가는 자가 없어요 — 사장님 눈으로. 올린 뒤 반응(좋아요·저장·댓글)을 말해 주시면 다음 판에 씁니다.",
    ].join(NL);

    const content = {
      kind: "social_post", platform: "instagram", plan: p, madeBy,
      // 나중에 자동 업로드를 붙일 자리 — 인스타 공식 API 가 받는 모양 그대로.
      uploadReady: { caption: `${p.caption}${NL}${NL}${tags}`, images: imgs.length, square: true, posted: false },
      verdict: { verdict: failedN === 0 ? "PASS" : passed >= failedN ? "PARTIAL" : "FAIL", passed, failed: failedN, cases, scales: false, rate: Number((passed / cases.length).toFixed(4)) },
      humanGate: ["끌리나", "그림이 예쁜가", "올릴 만한가"],
    };
    const { data: saved, error } = await ctx.supabase.rpc("submit_generated_deliverable", {
      p_execution_id: ctx.executionId, p_title: p.title, p_deliverable_type: "image",
      p_content_markdown: markdown, p_content_json: content, p_generation_model: madeBy, p_citations: [],
    });
    if (error) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", error.message);
    const rpc = saved as { ok: boolean; reason?: string; deliverableId?: string };
    if (!rpc.ok && !(rpc.reason === "already_submitted" && rpc.deliverableId)) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason ?? "unknown");
    const deliverableId = rpc.deliverableId as string;
    for (const [i, f] of imgs.entries()) {
      await storeDeliverableFile(ctx.supabase, {
        companyId: ctx.execution.company_id, deliverableId, filename: `post-${i + 1}.png`, body: f.bytes,
        kind: "image", mimeType: "image/png", title: `${p.title} ${imgs.length > 1 ? `(${i + 1})` : ""}`.trim(), producedByBackend: f.model,
      });
    }
    return { deliverableId, deliverableType: "image", metrics: { candidateCount: cases.length, selectedCount: passed, images: imgs.length } };
  },
};
