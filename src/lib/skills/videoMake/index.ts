import { z } from "zod";
import OpenAI from "openai";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import { step } from "@/lib/execution/steps";
import { recordUsage } from "@/lib/costs/meter";
import { storeDeliverableFile } from "@/lib/deliverables/files";
import { assemble, type Scene } from "@/lib/video/assemble";
import { judgeAppeal, JUDGE_MAX_IMAGES, type Appeal } from "@/lib/genesis/judge";
import { frameStyle, styleLine } from "@/lib/video/style";
import { lookSchema, safeLook, lookLine } from "@/lib/video/look";
import { makeClip } from "@/lib/providers/sora";
import { makeVeoClip, veoConfigured, nearestVeoSeconds, VEO_USD_PER_SECOND, type VeoTier } from "@/lib/providers/veo";
import { speechRate, speechLine } from "@/lib/video/speechRate";
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
  /** 목표 길이(초). 주문에 숫자가 있으면 그 숫자. 없으면 **이 판에 맞게 네가 정한다** — 158회차: 45~75 는 내가 박은 상수였다. */
  targetSec: z.number(),
  /** 158회차 — 왜 이 길이·이 장면 수인가 한 줄. 사람이 읽고 틀렸다고 말할 수 있어야 한다. */
  sizeWhy: z.string(),
  /**
   * **이 판을 어떻게 보이게 할 것인가** (149회차). 사장님: "이 템포에 이 글자 크기만 정답인 게 아니야."
   * 지금까지 글자 크기·줄 간격·템포·색이 전부 코드에 박힌 상수였다 — 60초 설명 영상과 15초 광고가
   * 같은 크기·같은 템포일 수 없는데도. 이제 **네가 이 판을 보고 정한다.**
   * 어떤 값이 와도 영상은 나온다(깨질 값만 코드가 난간으로 잡는다). 그러니 겁내지 말고 이 판에 맞게 골라라.
   */
  look: lookSchema,
  scenes: z.array(z.object({
    /** 화면 위쪽에 **크게 구워 넣을 제목**(≤ 24자). */
    heading: z.string(),
    /** 화면 가운데에 **구워 넣을 본문 줄.** 1~3줄, 줄마다 28자 이하. */
    bullets: z.array(z.string()),
    /** 화면 아래에 박을 **출처 한 줄**(재료의 쪽수·절). 없으면 "". */
    cite: z.string(),
    /** 목소리로 읽을 말. 해요체. 길이는 `seconds` 에 맞춘다(초당 약 5자). */
    narration: z.string(),
    /** 158회차 — 이 장면에 줄 초. 전 장면의 합이 `targetSec` 이어야 한다. 기계가 장면마다 계획 대 실측을 적는다. */
    seconds: z.number(),
    /**
     * **이 장면에 무엇이 보이나** (154회차 09-16).
     *
     * 사장님: *"그냥 지피티한테 시키기만 해도 멋진 광고 하나 나오는데 이런 쓰레기 연출이 왜 계속 나와?"*
     * 그때까지 이 배관의 그림은 **글자 카드뿐**이었다 — 재료가 글자인데 조판과 움직임만 얹고 있었다.
     * 이 칸에 장면을 적으면 그 장면을 **영상 모델이 실제로 만든다**(sora-2). 빈 칸이면 글자 카드다.
     *
     * 영어로, 보이는 것만 적는다 — 카메라·빛·사람·행동. 글자를 넣으라고 하지 마라(글자는 우리가 얹는다).
     */
    footage: z.string(),
  })),
});
type Script = z.infer<typeof script>;

type Case = { name: string; result: "Passed" | "Failed" | "Inconclusive"; message: string };

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
    // 158회차: 말 속도는 상수("초당 5자")가 아니라 **이 회사 지난 영상의 실측**이다 — 첫 진짜 판이 그 상수 때문에 4초 모자랐다.
    const voice = await speechRate(ctx.supabase, ctx.execution.company_id);
    console.log(`[video] 말 속도: ${speechLine(voice)}`);
    const writeScript = (note: string) => ctx.providers.ai.generateStructuredOutput({
      systemInstructions:
        "너는 이 회사의 영상 편집자다. 약 60초짜리 설명 영상의 대본을 한국어로 쓴다.\n\n" +
        "- **`look` 은 이 판의 연출이다.** 무엇을 만드는 판인지 보고 정해라 — 짧고 눈길을 끌어야 하면 글자를 크게·템포를 짧게, " +
        "차분히 가르치는 판이면 글자를 적당히·쉬는 시간을 길게. 줄이 많으면 본문을 줄이고 줄 간격을 벌려라. " +
        "읽을 거리가 길면 왼쪽 정렬이 눈이 편하고, 한 마디짜리는 가운데가 낫다. **`why` 에 왜 그렇게 정했는지 한 줄** 적어라.\n" +
        // 158회차: "장면 4~6개" 는 내가 박은 상수였다. 15초 광고와 60초 설명이 같은 장면 수일 수 없다 — 크기·모양도 판단이다.
        "- **장면 수는 네가 정한다.** 장면마다 `seconds`(그 장면에 줄 초)를 적고, 합이 `targetSec` 이어야 한다. " + speechLine(voice) + " 모자라면 기계가 늘려 주지 않는다(쉼을 줄여 맞출 뿐이다). `sizeWhy` 에 왜 이 길이·이 장면 수인지 한 줄.\n" +
        // 154회차: 여기가 "쓰레기 연출" 의 뿌리였다. 이 줄은 원래 "화면은 글자 카드다(그림을 그리지 않는다)" 였다 —
        // **재료가 글자뿐이라고 내가 못 박아 둔 것**이다. 그 위에 조판(149)·움직임(153)을 얹어 봐야 슬라이드쇼다.
        "- **`footage` — 이 장면에 무엇이 보이나.** 적으면 영상 모델이 그 장면을 실제로 만든다(글자는 그 위에 얹힌다).\n" +
        "  · 광고·홍보처럼 **보여 줘야 하는 판이면 반드시 쓴다.** 글자만 있는 광고는 광고가 아니다.\n" +
        "  · 영어로, **보이는 것만** 적는다: 누가·어디서·무엇을 하는가, 카메라와 빛. 사람은 특정인이 아니라 일반적인 사람으로.\n" +
        "  · 화면에 글자를 넣으라고 하지 마라(우리가 얹는다). 로고·상표·유명인 금지.\n" +
        "  · 글이 주인공인 차분한 설명은 **빈 문자열** — 그때는 글자 카드가 낫고 값도 안 든다.\n" +
        "  · `heading` 화면 위 제목, 24자 이하. 항목 코드가 있으면 그대로(예: A01 Broken Access Control).\n" +
        "  · `bullets` 화면 가운데 본문 1~3줄, **줄마다 28자 이하**(길면 화면 밖으로 나간다). 문장이 아니라 짧은 구절.\n" +
        "  · `cite` 화면 아래 출처 한 줄. 재료의 쪽수·절을 그대로(예: OWASP Top 10:2021, p.10). 재료에 없으면 빈 문자열.\n" +
        "  · `narration` 읽을 말, 해요체. 길이는 그 장면의 `seconds` 에 맞춘다(60~120자 같은 상수는 없다 — 두 번째 진짜 판에서 대본이 「1장면당 60자 이상 규칙」 때문에 1장면을 골랐다). **화면 글자를 그대로 읽지 말고** 살을 붙여 말한다.\n" +
        "- **주문에 길이가 적혀 있으면 `targetSec` 는 그 숫자다.** '60초' 라고 했으면 60 이다 — 네가 편한 값으로 옮기지 마라(기계가 주문의 숫자로 잰다).\n" +
        "- 안 적혀 있으면 `targetSec` 는 **이 판에 맞게 네가 정한다** — 광고는 짧고, 가르치는 판은 길다. 왜인지 `sizeWhy` 에.\n" +
        "- 1판은 첫 장면이 9.8초라 사람이 나가떨어졌다 — 첫 장면이 길면 그 뒤를 아무도 안 본다. 마지막 장면은 한 줄로 맺는다.\n" +
        "- 업무에 없는 사실을 지어내지 마라. 모르는 숫자는 쓰지 않는다." +
        (source ? "\n- **아래 '재료' 안의 사실만 쓴다.** 재료에 없는 숫자·이름·주장을 넣지 마라 — 기계가 숫자를 재료와 대조한다." : ""),
      input: (note ? "## 대본 심판이 되돌렸다 — 아래를 고쳐서 다시 쓴다" + String.fromCharCode(10) + note + String.fromCharCode(10) + String.fromCharCode(10) : "") + ask + (source ? `\n\n## 재료 — ${source.title}\n${source.text}` : ""),
      schema: script,
      schemaName: "video_script",
      // 1판(18:31) 6000 에서 잘렸다(MODEL_OUTPUT_TRUNCATED) — 추론 모델은 생각에 먼저 쓴다. Dev 계획과 같은 값.
      maxTokens: 24000,
      tier: "judgment",
    });
    let plan = (await step(ctx.supabase, ctx.executionId, "script", async () => (await writeScript("")).output)) as Script;
    // 215회차 09-25: **대본 심판** — 그림(≈$0.6)·목소리를 만들기 전에 대본을 지시문과 대 보고 어겼으면 한 번 다시 쓴다.
    // 완성 영상의 심판(아래 3.5)은 다 만든 뒤 옆에 적힐 뿐이었다. 여기는 싼 자리의 되돌림 한 번. 심판이 죽어도 영상은 간다.
    const { judgeScript } = await import("@/lib/skills/videoMake/scriptJudge");
    let scriptJudge: { first: unknown; redone: boolean; second?: unknown; by?: string } | null = null;
    try {
      const j1 = await judgeScript(ctx.providers.ai, { ask, scenes: plan.scenes });
      scriptJudge = { first: j1.verdict, redone: false, by: j1.model };
      if (j1.verdict.되돌린다) {
        const note = [...j1.verdict.어긴것, ...j1.verdict.지어낸사실.map((f) => "지어낸 사실: " + f), j1.verdict.하나만바꾼다면 ? "하나만 바꾼다면: " + j1.verdict.하나만바꾼다면 : ""].filter(Boolean).join(String.fromCharCode(10));
        console.log("[video] 대본 심판이 되돌렸다 — " + note.slice(0, 160));
        const plan2 = (await step(ctx.supabase, ctx.executionId, "script2", async () => (await writeScript(note)).output)) as Script;
        if (plan2.scenes.length) { plan = plan2; const j2 = await judgeScript(ctx.providers.ai, { ask, scenes: plan.scenes }); scriptJudge = { ...scriptJudge, redone: true, second: j2.verdict }; }
      } else console.log("[video] 대본 심판 통과");
    } catch (e) { console.warn("[video] 대본 심판 못 돌림:", e instanceof Error ? e.message : e); }
    // 158회차: "3개 미만이면 죽인다" 는 내가 박은 문이었다. 첫 진짜 판에서 대본이 20초를 **1장면·99자**로 계획하고 이유까지 적었는데
    // 이 줄이 죽였다. 장면 수는 대본의 판단이다(③). 난간은 **0장면**뿐 — 그건 그릴 게 없는 것이다.
    if (plan.scenes.length === 0) throw new ExecutionError("INVALID_DELIVERABLE_OUTPUT", "장면이 하나도 없다");

    // ── 2. 목소리 + 장면 그림 (싸서 단계 저장 안 함 — 죽으면 다시 만든다) ──
    await setStep(ctx.supabase, ctx.executionId, "generating");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ExecutionError("CONTEXT_INCOMPLETE", "OPENAI_API_KEY 가 없다(목소리)");
    const openai = new OpenAI({ apiKey, maxRetries: 2 });
    // 09-09: **생성 그림을 버렸다.** 1판을 사장님이 보고 "존나 별로" — 화면은 빈 브라우저 창과 녹슨 톱니였고
    // 글자가 하나도 없었다. 주문서에 "글자 크게" 라고 적어도 그림 모델은 글자를 못 쓴다.
    // 검사로 잡지 않고 **구조로 막는다**: 대본의 글자를 ffmpeg 이 직접 그린다 → 없을 수가 없다. 그림값도 0이 된다.
    const scenes: Scene[] = [];
    let soraSeconds = 0;
    // 182회차: Sora 2 API 는 2026-09-24 에 사라진다(OpenAI 폐기표). 열쇠가 있으면 Veo 3.1(초당 ≈$0.05)로, 없으면 그날까지는 Sora 로.
    // `VIDEO_PROVIDER=sora` 로 되돌릴 수 있다(9/24 뒤엔 소용없다).
    const useVeo = veoConfigured() && process.env.VIDEO_PROVIDER !== "sora";
    const veoTier = ((process.env.VEO_TIER as VeoTier | undefined) ?? "lite");
    let footageModel = useVeo ? `veo-3.1-${veoTier}` : "sora-2";
    // 216회차 09-25 사장님 "못하는 건 다른 AI 한테 맡겨, 영상도": **외주 모드** — 장면을 카드+클립 조립이 아니라
    // 영상 AI 가 통째로 만든 화면으로 낸다(글자 카드 없음, 장면 길이만큼 산다). 목소리(TTS)·자막·자·심판은 그대로 우리가.
    // 켜는 법: 주문에 '통째로/외주/영상 AI/맡겨' 또는 VIDEO_OUTSOURCE=1. 값은 VEO_TIER 가 정한다(lite 소리 없음 $0.05/s · fast $0.15 · full $0.40).
    const outsource = /통째로|외주|영상 ?AI|맡겨/.test(ask) || process.env.VIDEO_OUTSOURCE === "1";
    if (outsource) console.log(`[video] 외주 모드: 장면은 영상 AI(${footageModel})가 통째로, 글자 카드 없음`);
    let footageUsd = 0;
    for (const [i, sc] of plan.scenes.entries()) {
      const speech = await openai.audio.speech.create({ model: "gpt-4o-mini-tts", voice: "alloy", input: sc.narration, response_format: "mp3" });
      const audio = new Uint8Array(await speech.arrayBuffer());
      // 자막(SRT)은 **읽은 말**을 싣는다. 제목만 싣던 1판은 소리를 끄면 아무것도 안 남았다.
      /**
       * **대본이 적은 장면을 실제로 산다** (154회차).
       *
       * 09-09 에 생성 그림을 버린 이유는 "그림 모델이 글자를 못 써서" 였다. 그 문제는 이제 없다 —
       * **글자는 우리가 ffmpeg 으로 얹는다.** 그림이 못 하는 일을 그림에게 시키지 않는다.
       *
       * 값이 든다(초당 $0.10). 그래서 `GENESIS_SPEND` 가 켜져 있을 때만 사고, 실패하면 **글자 카드로 돌아간다** —
       * 영상이 아예 안 나오는 것보다 낫다. 문이 아니다.
       */
      let clip: Uint8Array | undefined;
      const wantsFootage = outsource || sc.footage.trim().length > 0;
      // 외주 모드: 대본이 화면을 안 적은 장면도 영상 AI 에게 — 제목·글머리를 장면 설명으로 준다. 길이는 장면의 초(4·6·8 로 맞춤).
      const footagePrompt = sc.footage.trim() || `Cinematic advertisement shot, no on-screen text: ${sc.heading}. ${sc.bullets.join(". ")}`;
      const clipSec = outsource ? nearestVeoSeconds(sc.seconds) : 4;
      if (wantsFootage && process.env.GENESIS_SPEND === "i-approve") {
        try {
          const made = useVeo ? await makeVeoClip({ prompt: footagePrompt, seconds: clipSec, tier: veoTier }) : await makeClip({ prompt: footagePrompt, seconds: clipSec });
          clip = made.mp4;
          soraSeconds += made.seconds;
          footageModel = made.model;
          footageUsd += made.seconds * (useVeo ? VEO_USD_PER_SECOND[veoTier] : 0.1);
          await recordUsage(
            ctx.supabase,
            { companyId: ctx.execution.company_id, workExecutionId: ctx.executionId, companyEmployeeId: ctx.execution.company_employee_id },
            { model: made.model, purpose: "video_footage", inputTokens: 0, outputTokens: 0, quantity: made.seconds },
          );
          console.log(`[video] 장면 ${i + 1} 화면 샀다 ${made.seconds}초 · ${(made.mp4.length / 1024 / 1024).toFixed(2)}MB`);
        } catch (e) {
          console.warn(`[video] 장면 ${i + 1} 화면을 못 샀다 — 글자 카드로 간다:`, e instanceof Error ? e.message : e);
        }
      } else if (wantsFootage) {
        console.log(`[video] 장면 ${i + 1} 화면을 적었지만 지출이 안 켜져 있다 — 글자 카드로 간다`);
      }
      scenes.push({ audio, caption: sc.narration, title: outsource && clip ? "" : sc.heading, lines: outsource && clip ? [] : sc.bullets, cite: outsource && clip ? undefined : (sc.cite || undefined), clip });
      console.log(`[video] 장면 ${i + 1}/${plan.scenes.length} 목소리 ${audio.length} B · 글자 ${sc.heading} / ${sc.bullets.length}줄`);
    }

    // ── 3. 조립 + 자 ──
    await setStep(ctx.supabase, ctx.executionId, "verifying");
    // 158회차: 주문의 길이는 조립 **전에** 안다 — 쉼을 줄여 맞추려면.
    const askedSec = (() => {
      const t = `${ctx.context.assignment.title} ${ctx.context.assignment.description ?? ""} ${ctx.context.assignment.expectedOutcome ?? ""}`;
      const m = t.match(/(\d{1,3})\s*초/) ?? t.match(/(\d{1,2})\s*분/);
      if (!m) return null;
      const n = Number(m[1]);
      return /분/.test(m[0]) ? n * 60 : n;
    })();
    const look = safeLook(plan.look);
    const a = await assemble(scenes, { look, fitSec: askedSec ?? undefined });
    await recordUsage(ctx.supabase, scope, { model: "gpt-4o-mini-tts", purpose: "video_voice", inputTokens: 0, outputTokens: 0, quantity: Math.round(a.durations.reduce((s, d) => s + d, 0)) });
    const cases: Case[] = [];
    const within = a.total >= plan.targetSec * 0.7 && a.total <= plan.targetSec * 1.3;
    cases.push({ name: "길이_목표안", result: within ? "Passed" : "Failed", message: `실측 ${a.total.toFixed(1)}s, 목표 ${plan.targetSec}s (±30%)` });
    // 158회차: 대본이 장면마다 초를 **계획**했으니 기계는 장면마다 **실측**을 댄다. 어느 장면이 넘쳤는지가 보여야 다음 판에 손댈 데를 안다.
    {
      // 첫 진짜 판: 계획 20 → 실측 15.7 인데 "장면마다 계획 안" 이라 적혔다 — 넘친 것만 봤다. 모자란 것도 어긋남이다.
      const over = plan.scenes.map((sc, i) => ({ i: i + 1, plan: sc.seconds, got: a.durations[i] })).filter((x) => Math.abs(x.got - x.plan) > 1);
      const planned = plan.scenes.reduce((x, sc) => x + sc.seconds, 0);
      cases.push({
        name: "장면_계획_대비", result: over.length === 0 ? "Passed" : "Failed",
        message: `계획 ${planned}s → 실측 ${a.total.toFixed(1)}s` + (over.length ? ` · 계획과 1초 넘게 어긋난 장면 ${over.map((x) => `${x.i}(${x.plan}→${x.got.toFixed(1)})`).join(", ")}` : " · 장면마다 계획 안"),
      });
    }
    cases.push({ name: "소리_있음", result: a.hasAudio ? "Passed" : "Failed", message: a.hasAudio ? "오디오 트랙 있음" : "오디오 트랙이 없다" });
    // 158회차: `장면_수 (4~6)` 검사를 뗐다 — 4~6 은 내 상수였고, 장면 수는 이제 대본이 정한다(본문 "크기:" 줄에 적힌다).
    const srtCount = (a.srt.match(/-->/g) ?? []).length;
    cases.push({ name: "자막_수_대본과_같다", result: srtCount === plan.scenes.length ? "Passed" : "Failed", message: `자막 ${srtCount} · 장면 ${plan.scenes.length}` });
    // 09-09 새 자 셋 — "화면에 글자가 있나" 를 재는 자가 없어서 빈 화면이 통과했다.
    const noText = plan.scenes.filter((s) => !s.heading.trim() || s.bullets.filter((b) => b.trim()).length === 0);
    cases.push({ name: "화면_글자_있음", result: noText.length === 0 ? "Passed" : "Failed", message: `제목·본문이 빈 장면 ${noText.length}/${plan.scenes.length}` });
    const tooLong = plan.scenes.flatMap((s) => [...(s.heading.length > 24 ? [s.heading] : []), ...s.bullets.filter((b) => b.length > 28)]);
    cases.push({ name: "화면_글자_안_넘침", result: tooLong.length === 0 ? "Passed" : "Failed", message: tooLong.length === 0 ? "제목 ≤24자 · 본문 줄 ≤28자" : `넘친 줄 ${tooLong.length}: ${tooLong[0].slice(0, 30)}` });
    if (source) {
      const noCite = plan.scenes.filter((s) => !s.cite.trim());
      cases.push({ name: "출처_화면표기", result: noCite.length === 0 ? "Passed" : "Failed", message: `출처가 안 박힌 장면 ${noCite.length}/${plan.scenes.length}` });
    }
    const longest = Math.max(...plan.scenes.map((s) => s.narration.length));
    cases.push({ name: "말_길이", result: longest <= 220 ? "Passed" : "Failed", message: `가장 긴 장면 ${longest}자 (≤220)` });
    // 158회차: `첫장면_6초안` 을 뗐다 — 6초는 내 상수고, 1장면짜리 판에선 뜻이 없다. 첫 장면이 긴 게 문제면 심판자가 본다.
    // 135회차: **주문이 말한 길이**를 잰다. 위의 `길이_목표안` 은 모델이 **스스로 정한** targetSec 과 비교하므로
    // 모델이 목표를 옮겨 버리면 영원히 통과한다 — 첫 실사용 판이 정확히 그랬다(주문 60초 → 모델이 69초로 잡고 68.8초 달성, ✅).
    // 자가 자기 눈을 가린 것이다(09-08 같은 자리). 주문에 숫자가 있으면 **그 숫자**로 잰다. 없으면 '못 잼'.
    //
    // **±15% 를 심판자에 맞춰 조이지 않았다.** 그 판에서 심판자는 68.8초를 '치명' 이라 했는데, 나는 자를
    // 그 한 판에 맞춰 깎지 않는다(그건 오늘 내내 하지 말자고 한 짓이다). 이 자가 막는 것은 **골대 옮기기**다 —
    // 전에는 모델이 targetSec 을 120 으로 잡아도 통과했고, 이제는 51~69 를 벗어날 수 없다.
    // 69초가 이 주문에 괜찮은가는 **판단**이고, 그건 심판자 몫이다. 둘이 갈리면 그 기록이 남는다(judge_routing.mts).
    cases.push({
      name: "주문_길이_지킴",
      result: askedSec === null ? "Inconclusive" : Math.abs(a.total - askedSec) <= askedSec * 0.15 ? "Passed" : "Failed",
      message: askedSec === null ? "주문에 길이가 안 적혀 재지 못했다" : `실측 ${a.total.toFixed(1)}s · **주문** ${askedSec}s (±15%)`,
    });
    // 재료가 있으면 **숫자가 재료에 있는지** 잰다(44회차). 지어낸 숫자는 사람이 원문을 안 읽으면 못 잡는다.
    if (source) {
      const inSource = (n: string) => source.text.includes(n);
      const numbers = Array.from(new Set(plan.scenes.flatMap((sc) => (sc.narration.match(/\d+(?:[.,]\d+)?/g) ?? []))))
        .filter((n) => n.replace(/[.,]/g, "").length >= 2); // 한 자리(하나·둘)는 세지 않는다
      const missing = numbers.filter((n) => !inSource(n));
      // 44회차 1판: 대본이 "네 가지" 처럼 한글로만 써서 대조할 숫자가 0개였는데 **통과**로 찍혔다 —
      // 재지 못한 것을 통과로 적는 것이 오늘 계속 잡은 병이다. 잴 게 없으면 잴 게 없었다고 적는다.
      cases.push({
        name: "숫자가_재료에_있다",
        result: numbers.length === 0 ? "Inconclusive" : missing.length === 0 ? "Passed" : "Failed",
        message: numbers.length === 0 ? "대본에 아라비아 숫자가 없어 대조하지 못했다" : `숫자 ${numbers.length}개 중 재료에 없는 것 ${missing.length}${missing.length ? ": " + missing.slice(0, 5).join(", ") : ""}`,
      });
    }
    const passed = cases.filter((c) => c.result === "Passed").length;
    const failedN = cases.filter((c) => c.result === "Failed").length;
    const verdict = { verdict: failedN === 0 ? "PASS" : "FAIL", passed, failed: failedN, inconclusive: cases.length - passed - failedN, cases };

    // ── 3.5 심판자 (132회차 09-16). 사장님: "재는 자는 의미없다. 재는자 대신 심판자 ai를 만들어라."
    //
    // 위의 자 열 개는 **전부 세는 것**이다 — 길이·장면 수·자막 수·글자 길이. 하나도 "보고" 판단하지 않는다.
    // 그래서 09-07~09-15 여드레 동안 `drawtext` 가 없어 **글자가 한 자도 안 그려진** 영상에
    // `화면_글자_있음` 이 ✅ 를 줬다. 대본의 글자를 셌기 때문이다. 심판자는 **그려진 화면**을 본다.
    //
    // **막지 않는다(132회차).** 판정은 그대로 기계 자가 내고, 심판자 말은 옆에 적어만 둔다.
    // 먼저 같이 돌려 어긋나는 곳을 모으고, 그 기록으로 승격할지 사장님이 정한다 —
    // 재 보지도 않고 문을 넘기는 것이 우리가 제일 자주 한 실수다.
    let judgeNote: Appeal | null = null;
    // 133회차: 판정을 **누가 한 일에 대한 것인지**와 함께 남긴다.
    // 사장님 09-16: "판단자 ai 잘 만들면 모든 AI를 적재적소에 쓰며 더 높은 효율을 낼 수 있다."
    // 그러려면 (자리, 모델)별로 판정이 쌓여야 한다 — 지금 모델 배치표는 내가 손으로 적은 고정표다.
    // 여기서 시작한다: 일한 모델(generation_model)과 심판한 모델을 판정 옆에 적어 둔다.
    let judgeBy: string | null = null;
    try {
      // 133회차: **장면마다 한 장**(경계 인식 고르기). 첫 장면·가운데 둘만 보내면 장면이 다섯일 때 셋은 아무도 안 본다.
      // 장면이 5개를 넘으면 **가장 긴 장면부터** 고른다 — 오래 떠 있는 화면이 사람 눈에 제일 오래 남는다.
      const shotIdx = a.shots.map((_, i) => i).sort((x, y) => a.durations[y] - a.durations[x]).slice(0, JUDGE_MAX_IMAGES).sort((x, y) => x - y);
      const facts: string[] = [];
      for (const i of shotIdx) {
        try { facts.push(styleLine(`장면 ${i + 1}`, await frameStyle(a.shots[i]), a.durations[i])); } catch { /* 못 재면 안 적는다 */ }
      }
      facts.push(`장면 길이: ${a.durations.map((d) => d.toFixed(1)).join(" · ")}초 (전체 ${a.total.toFixed(1)}초)`);
      const j = await judgeAppeal(ctx.providers.ai, {
        what:
          "이 회사의 AI 가 만든 60초 설명 영상이다. 주문은 이랬다:\n" +
          [ctx.context.assignment.title, ctx.context.assignment.description ?? ""].filter(Boolean).join("\n").slice(0, 1200) +
          "\n\n화면은 글자 카드다(그림을 안 쓴다 — 09-09 에 일부러 정한 설계라 그림이 없는 것 자체는 흠이 아니다). " +
          `연출은 이 판에 맞춰 정했다: ${look.why}`,
        frames: shotIdx.map((i) => ({ label: `장면 ${i + 1}`, b64: Buffer.from(a.shots[i]).toString("base64") })),
        seconds: a.total,
      });
      judgeNote = j.appeal;
      judgeBy = j.model;
      await recordUsage(ctx.supabase, scope, { model: j.model, purpose: "video_appeal", inputTokens: j.inputTokens, outputTokens: j.outputTokens });
    } catch (e) {
      // 심판자가 죽어도 영상은 나간다. 아직 문이 아니다.
      console.log(`[video] 심판자 못 돌림: ${(e as Error).message}`);
    }

    // ── 4. 산출물 + 파일 ──
    await setStep(ctx.supabase, ctx.executionId, "storing");
    const markdown = [
      `## ${plan.title}`, "", plan.description, "",
      `길이 ${a.total.toFixed(1)}초 · 장면 ${plan.scenes.length} · 1280×720 · 소리 ${a.hasAudio ? "있음" : "없음"}`, "",
      lookLine(look), "",
      `크기: 목표 ${plan.targetSec}초 · 장면 ${plan.scenes.length}개 · 쉼 ${a.padUsed.toFixed(2)}초${askedSec !== null && a.padUsed < look.pad ? " (주문 길이에 맞춰 쉼을 줄였어요)" : ""}`,
      `  왜: ${plan.sizeWhy}`, "",
      // 154회차: 화면을 샀으면 **얼마를 썼는지 결과물에 적는다.** 값이 글자 카드의 열 배가 넘는다 —
      // 원장에만 있으면 사장님은 다음 달에야 안다.
      ...(soraSeconds > 0
        ? [`화면: 영상 모델이 만든 ${soraSeconds}초 (${footageModel}, 약 $${footageUsd.toFixed(2)})`, ""]
        : ["화면: 글자 카드 (영상 모델 안 씀, 화면값 $0)", ""]),
      ...(source ? [`재료: ${source.title} — 이 영상의 사실은 여기서 왔어요.`, ""] : []),
      `## 대본`, "", `| # | 화면 글자 | 읽은 말 | 출처 | 초(계획→실측) |`, `|---|---|---|---|---|`,
      ...plan.scenes.map((s, i) => `| ${i + 1} | **${s.heading}**<br>${s.bullets.join("<br>")} | ${s.narration} | ${s.cite || "—"} | ${s.seconds}→${a.durations[i].toFixed(1)} |`), "",
      // 157회차: **딱지를 뗐다.** "통과 N · 실패 M" 은 판정처럼 읽히는데, 이건 길이·장면 수·자막 수를 **센 것**이지 좋은지 아닌지가 아니다
      // (144회차 "7/9 통과 + 광고는 쓰레기"). 기계는 잰 값과 어긋남만 대고, 판정은 아래 심판자와 사장님 몫이다. 못 잰 줄은 세지 않는다.
      `## 잰 것 ${verdict.passed + verdict.failed}개 · 어긋난 것 ${verdict.failed}개 (판정이 아니라 잰 값이에요)`, "",
      ...cases.map((c) => `- ${c.result === "Failed" ? "≠" : c.result === "Passed" ? "·" : "– (못 잼)"} ${c.name} — ${c.message}`), "",
      // 150회차: 칸(통과/치명/점수)을 걷어냈다 — **읽는 곳이 하나도 없었다.** `shouldRedo` 는 죽은 코드였고
      // 판정 2건 중 "치명" 1건에도 다시 만든 판은 0건이었다. 칸이 아무 일도 안 하면서 판단만 뭉개고 있었다.
      // 이제 심판자가 **자기 말로** 말한다. 여전히 아무것도 막지 않는다 — 읽는 것은 사람이다.
      ...(judgeNote ? [
        `## 처음 보는 사람이라면 (심판자 — 아무것도 막지 않아요, 읽고 사장님이 정하세요)`, "",
        `- **3초만 봤을 때** — ${judgeNote.firstGlance}`,
        `- **멈출까 넘길까** — ${judgeNote.wouldStop}`,
        `- **어색한 곳** — ${judgeNote.awkward}`,
        `- **고른 흔적이 있나** — ${judgeNote.soulless}`,
        `- **하나만 바꾼다면** — ${judgeNote.oneChange}`, "",
        `이 말대로 고치려면 그대로 대화에 붙여 넣으세요 — 그 부분만 다시 만들어요.`, "",
      ] : []),
      `재미와 말맛은 사람이 봐요. 첫 5초·중간 사진이 붙어 있어요. 고칠 장면을 말해 주면 그 장면만 다시 만들어요.`,
    ].join("\n");
    const content = { script: plan, durations: a.durations, total: a.total, verdict, look, judge: judgeNote, judgeBy, scriptJudge, outsourced: outsource ? { model: footageModel, tier: useVeo ? veoTier : "sora" } : null, workModel: ctx.providers.ai.model, source: source ? { id: source.id, title: source.title } : null, filesPending: true };
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
      ["thumbnail.png", new Uint8Array(a.first5s), "image", "image/png", "썸네일 (첫 장면 화면)"],
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
