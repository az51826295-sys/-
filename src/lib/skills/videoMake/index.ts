import { z } from "zod";
import OpenAI from "openai";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import { step } from "@/lib/execution/steps";
import { createImageProvider } from "@/lib/providers/images";
import { recordUsage } from "@/lib/costs/meter";
import { storeDeliverableFile } from "@/lib/deliverables/files";
import { assemble } from "@/lib/video/assemble";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";

/**
 * 영상 만들기 — 60초 설명 영상 (39회차 09-07, 첫 판).
 *
 * 사장님 목록(과제·게임·유튜브 영상·분석)에서 마지막 남은 자리. 뼈대는 다른 직원과 같다: 계획(대본, 단계 저장) →
 * 만들기(목소리·장면 그림·조립) → **자** → 산출물 → 대화. 자는 ffprobe 숫자다: 길이가 목표 안인가, 소리가 있나,
 * 장면 수·자막 수가 대본과 같나. "재미있나" 는 사람이 본다(첫 5초·중간 사진이 대화에 붙는다).
 *
 * 첫 판의 한계(알고 둔 것): 장면은 정지 그림 한 장(움직임 없음), 자막은 SRT 사이드카(영상에 안 굽힘), 배경음 없음.
 */

const script = z.object({
  title: z.string(),
  /** 유튜브 설명 두 줄. */
  description: z.string(),
  /** 목표 길이(초). 45~75. */
  targetSec: z.number(),
  scenes: z.array(z.object({
    /** 화면에 자막으로 나가는 한 줄(≤ 40자). */
    heading: z.string(),
    /** 목소리로 읽을 말. 1~2문장, 60~120자. 해요체. */
    narration: z.string(),
    /** 장면 그림 지시(영어, 글자 넣지 말 것). */
    visual: z.string(),
  })),
});
type Script = z.infer<typeof script>;

type Case = { name: string; result: "Passed" | "Failed"; message: string };

export const videoMakeSkill: EmployeeSkill = {
  id: "video_make",
  deliverableType: "video",
  capabilities: [
    {
      id: "video_explainer",
      label:
        "설명 영상 만들기(약 60초) — 주제를 주면 대본·목소리(TTS)·장면 그림·자막·mp4 까지. " +
        "'영상 만들어 줘'·'유튜브 쇼츠로'·'소개 영상' 은 여기 / Make a short explainer video",
      produces: "mp4(1280×720) + 자막(SRT) + 썸네일·첫 5초·중간 사진 + 대본 표 — 길이·소리·장면 수를 자가 잰 결과",
    },
  ],
  acceptsInternalRequests: true,

  async run(ctx: SkillRunContext) {
    const scope = { companyId: ctx.execution.company_id, workExecutionId: ctx.executionId, companyEmployeeId: ctx.execution.company_employee_id };
    const ask = `업무: ${ctx.context.assignment.title}\n설명: ${ctx.context.assignment.description ?? ""}\n기대: ${ctx.context.assignment.expectedOutcome ?? ""}`;

    // ── 재료(44회차): 다른 직원이 만든 것을 이어받는다. 있으면 **그 안의 사실만** 쓰고, 숫자는 자가 대조한다. ──
    const sourceId = (ctx.context.roleInput as { sourceDeliverableId?: string | null } | null)?.sourceDeliverableId ?? null;
    let source: { id: string; title: string; text: string } | null = null;
    if (sourceId) {
      const { data: sd } = await ctx.supabase
        .from("deliverables")
        .select("id, title, content_markdown")
        .eq("id", sourceId)
        .eq("company_id", ctx.execution.company_id)
        .maybeSingle();
      if (sd?.content_markdown) {
        source = { id: sd.id as string, title: (sd.title as string) ?? "", text: (sd.content_markdown as string).slice(0, 40_000) };
        console.log(`[video] 재료: ${source.title.slice(0, 40)} (${source.text.length}자)`);
      }
    }

    // ── 1. 대본 (단계 저장) ──
    await setStep(ctx.supabase, ctx.executionId, "planning");
    const plan = (await step(ctx.supabase, ctx.executionId, "script", async () => (await ctx.providers.ai.generateStructuredOutput({
      systemInstructions:
        "너는 이 회사의 영상 편집자다. 약 60초짜리 설명 영상의 대본을 한국어로 쓴다.\n\n" +
        "- 장면 4~6개. 장면마다 `heading`(자막 한 줄, 40자 이하), `narration`(읽을 말 1~2문장, 60~120자, 해요체), `visual`(그림 지시, 영어, 글자·로고 넣지 말 것, 한 장면에 한 대상).\n" +
        "- `targetSec` 는 45~75. 말하기 속도는 초당 5자쯤이니 narration 글자 수 합 ÷ 5 ≈ 길이가 되게 맞춘다.\n" +
        "- **첫 장면은 짧게**: narration 40자 이하, 무엇인지 한 문장(1판은 첫 장면이 9.8초라 떨어졌다). 마지막 장면은 한 줄로 맺는다.\n" +
        "- 업무에 없는 사실을 지어내지 마라. 모르는 숫자는 쓰지 않는다." +
        (source ? "\n- **아래 '재료' 안의 사실만 쓴다.** 재료에 없는 숫자·이름·주장을 넣지 마라 — 기계가 숫자를 재료와 대조한다." : ""),
      input: ask + (source ? `\n\n## 재료 — ${source.title}\n${source.text}` : ""),
      schema: script,
      schemaName: "video_script",
      // 1판(18:31) 6000 에서 잘렸다(MODEL_OUTPUT_TRUNCATED) — 추론 모델은 생각에 먼저 쓴다. Dev 계획과 같은 값.
      maxTokens: 24000,
      tier: "judgment",
    })).output)) as Script;
    if (plan.scenes.length < 3) throw new ExecutionError("INVALID_DELIVERABLE_OUTPUT", `장면이 ${plan.scenes.length}개뿐이다`);

    // ── 2. 목소리 + 장면 그림 (싸서 단계 저장 안 함 — 죽으면 다시 만든다) ──
    await setStep(ctx.supabase, ctx.executionId, "generating");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ExecutionError("CONTEXT_INCOMPLETE", "OPENAI_API_KEY 가 없다(목소리)");
    const openai = new OpenAI({ apiKey, maxRetries: 2 });
    const drawer = createImageProvider();
    const scenes: { image: Uint8Array; audio: Uint8Array; caption: string }[] = [];
    let imageTokens = { input: 0, output: 0 };
    for (const [i, sc] of plan.scenes.entries()) {
      const speech = await openai.audio.speech.create({ model: "gpt-4o-mini-tts", voice: "alloy", input: sc.narration, response_format: "mp3" });
      const audio = new Uint8Array(await speech.arrayBuffer());
      const made = await drawer.draw(`${sc.visual}. Clean illustration, 16:9, no text, no letters, no watermark.`, "low", "1536x1024");
      imageTokens = { input: imageTokens.input + made.inputTokens, output: imageTokens.output + made.outputTokens };
      const b64 = made.dataUrl.split(",")[1] ?? "";
      scenes.push({ image: new Uint8Array(Buffer.from(b64, "base64")), audio, caption: sc.heading });
      console.log(`[video] 장면 ${i + 1}/${plan.scenes.length} 목소리 ${audio.length} B · 그림 ${b64.length} B`);
    }
    await recordUsage(ctx.supabase, scope, { model: "gpt-image-2", purpose: "video_scene_images", inputTokens: imageTokens.input, outputTokens: imageTokens.output });

    // ── 3. 조립 + 자 ──
    await setStep(ctx.supabase, ctx.executionId, "verifying");
    const a = await assemble(scenes);
    await recordUsage(ctx.supabase, scope, { model: "gpt-4o-mini-tts", purpose: "video_voice", inputTokens: 0, outputTokens: 0, quantity: Math.round(a.durations.reduce((s, d) => s + d, 0)) });
    const cases: Case[] = [];
    const within = a.total >= plan.targetSec * 0.7 && a.total <= plan.targetSec * 1.3;
    cases.push({ name: "길이_목표안", result: within ? "Passed" : "Failed", message: `실측 ${a.total.toFixed(1)}s, 목표 ${plan.targetSec}s (±30%)` });
    cases.push({ name: "소리_있음", result: a.hasAudio ? "Passed" : "Failed", message: a.hasAudio ? "오디오 트랙 있음" : "오디오 트랙이 없다" });
    cases.push({ name: "장면_수", result: plan.scenes.length >= 4 && plan.scenes.length <= 6 ? "Passed" : "Failed", message: `${plan.scenes.length}개 (4~6)` });
    const srtCount = (a.srt.match(/-->/g) ?? []).length;
    cases.push({ name: "자막_수_대본과_같다", result: srtCount === plan.scenes.length ? "Passed" : "Failed", message: `자막 ${srtCount} · 장면 ${plan.scenes.length}` });
    const longest = Math.max(...plan.scenes.map((s) => s.narration.length));
    cases.push({ name: "말_길이", result: longest <= 220 ? "Passed" : "Failed", message: `가장 긴 장면 ${longest}자 (≤220)` });
    cases.push({ name: "첫장면_6초안", result: a.durations[0] <= 6 ? "Passed" : "Failed", message: `첫 장면 ${a.durations[0].toFixed(1)}s` });
    // 재료가 있으면 **숫자가 재료에 있는지** 잰다(44회차). 지어낸 숫자는 사람이 원문을 안 읽으면 못 잡는다.
    if (source) {
      const inSource = (n: string) => source.text.includes(n);
      const numbers = Array.from(new Set(plan.scenes.flatMap((sc) => (sc.narration.match(/\d+(?:[.,]\d+)?/g) ?? []))))
        .filter((n) => n.replace(/[.,]/g, "").length >= 2); // 한 자리(하나·둘)는 세지 않는다
      const missing = numbers.filter((n) => !inSource(n));
      cases.push({
        name: "숫자가_재료에_있다",
        result: missing.length === 0 ? "Passed" : "Failed",
        message: numbers.length === 0 ? "대본에 숫자가 없다" : `숫자 ${numbers.length}개 중 재료에 없는 것 ${missing.length}${missing.length ? ": " + missing.slice(0, 5).join(", ") : ""}`,
      });
    }
    const passed = cases.filter((c) => c.result === "Passed").length;
    const verdict = { verdict: passed === cases.length ? "PASS" : "FAIL", passed, failed: cases.length - passed, cases };

    // ── 4. 산출물 + 파일 ──
    await setStep(ctx.supabase, ctx.executionId, "storing");
    const markdown = [
      `## ${plan.title}`, "", plan.description, "",
      `길이 ${a.total.toFixed(1)}초 · 장면 ${plan.scenes.length} · 1280×720 · 소리 ${a.hasAudio ? "있음" : "없음"}`, "",
      ...(source ? [`재료: ${source.title} — 이 영상의 사실은 여기서 왔어요.`, ""] : []),
      `## 대본`, "", `| # | 자막 | 읽은 말 | 초 |`, `|---|---|---|---|`,
      ...plan.scenes.map((s, i) => `| ${i + 1} | ${s.heading} | ${s.narration} | ${a.durations[i].toFixed(1)} |`), "",
      `## 검사 결과 — 통과 ${verdict.passed} · 실패 ${verdict.failed}`, "",
      ...cases.map((c) => `- ${c.result === "Passed" ? "✅" : "❌"} ${c.name} — ${c.message}`), "",
      `재미와 말맛은 사람이 봐요. 첫 5초·중간 사진이 붙어 있어요. 고칠 장면을 말해 주면 그 장면만 다시 만들어요.`,
    ].join("\n");
    const content = { script: plan, durations: a.durations, total: a.total, verdict, source: source ? { id: source.id, title: source.title } : null, filesPending: true };
    const { data: saved, error } = await ctx.supabase.rpc("submit_generated_deliverable", {
      p_execution_id: ctx.executionId, p_title: plan.title, p_deliverable_type: "video",
      p_content_markdown: markdown, p_content_json: content, p_generation_model: ctx.providers.ai.model, p_citations: [],
    });
    if (error) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", error.message);
    const rpc = saved as { ok: boolean; reason?: string; deliverableId?: string };
    if (!rpc.ok && !(rpc.reason === "already_submitted" && rpc.deliverableId)) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason ?? "unknown");
    const deliverableId = rpc.deliverableId as string;

    const files: [string, Uint8Array, "archive" | "document" | "image", string, string][] = [
      ["video.mp4", new Uint8Array(a.mp4), "archive", "video/mp4", "영상 (mp4)"],
      ["subtitles.srt", new TextEncoder().encode(a.srt), "document", "text/plain", "자막 (SRT)"],
      ["thumbnail.png", scenes[0].image, "image", "image/png", "썸네일 (첫 장면 그림)"],
      ["first5s.png", new Uint8Array(a.first5s), "image", "image/png", "첫 5초"],
      ["mid.png", new Uint8Array(a.mid), "image", "image/png", "중간"],
    ];
    for (const [filename, body, kind, mimeType, title] of files) {
      const r = await storeDeliverableFile(ctx.supabase, { companyId: ctx.execution.company_id, deliverableId, filename, body, kind, mimeType, title, producedByBackend: "ffmpeg-static" });
      if (!r.ok) console.warn(`[video] 파일 저장 실패 ${filename}: ${r.error}`);
    }
    await ctx.supabase.from("deliverables").update({ content_json: { ...content, filesPending: false } }).eq("id", deliverableId);

    return { deliverableId, deliverableType: "video", metrics: { candidateCount: cases.length, selectedCount: passed } };
  },
};
