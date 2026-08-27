import { z } from "zod";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";

/**
 * 앱을 만드는 일.
 *
 * 게임 자산과 같은 골격이다 — 여러 개를 뽑고, 재고, 통과한 것만 넘긴다. 다른
 * 것은 **무엇으로 재는가**다. 그림은 색과 대비로 재지만 코드는 그렇게 못 잰다.
 *
 * ## 코드를 무엇으로 재는가
 *
 * "좋은 코드인가"는 우리가 세울 심판이 아니다. 대신 **말한 대로 되는가**는
 * 잴 수 있다. 그래서 이 기술은 코드를 내기 전에 **받아들임 기준**을 먼저 쓰고,
 * 그 기준을 코드와 함께 넘긴다:
 *
 *   - 화면마다 무엇이 보여야 하는가
 *   - 눌렀을 때 무엇이 일어나야 하는가
 *   - 무엇이 저장되고 다시 열었을 때 남아 있어야 하는가
 *
 * 기준이 먼저인 이유는 규율이다. 코드를 본 뒤에 기준을 쓰면 **나온 것에 맞춰
 * 기준이 휘어진다.** 그러면 전부 통과하고, 통과가 아무 뜻도 없어진다.
 *
 * ## 무엇을 하지 않는가
 *
 * **돌려 보지 않는다.** 이 회사에는 아직 코드를 실행할 자리가 없고, 실행 없이
 * "된다"고 말하는 것은 거짓이다. 그래서 산출물은 "작동하는 앱"이 아니라
 * **"이 기준으로 확인해야 하는 앱"** 이다. 그 구분을 흐리지 않는다.
 */

const MIN_CRITERIA = 3;

const plan = z.object({
  /** 무엇을 만드는지 한 줄. 산출물 제목이 된다. */
  title: z.string(),
  /**
   * 받아들임 기준. **코드보다 먼저 쓴다.**
   *
   * 사람이 직접 확인할 수 있는 문장이어야 한다 — "빠르다"가 아니라
   * "목록이 50개일 때 스크롤이 끊기지 않는다".
   */
  criteria: z.array(
    z.object({
      id: z.string(),
      /** 무엇을 하면 */
      when: z.string(),
      /** 무엇이 되어야 하는가 */
      then: z.string(),
    }),
  ),
  /** 잴 수 없어서 사람 눈에 남기는 것. 숨기지 않고 적는다. */
  humanGate: z.array(z.string()),
});

const build = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      language: z.string(),
      contents: z.string(),
    }),
  ),
  /** 어떻게 돌리는지. 이게 없으면 받은 사람이 시작할 수 없다. */
  howToRun: z.string(),
  /** 기준마다 어디서 충족되는지. 못 지킨 것은 못 지켰다고 적는다. */
  coverage: z.array(
    z.object({
      criterionId: z.string(),
      met: z.boolean(),
      where: z.string(),
    }),
  ),
});

export const appBuildSkill: EmployeeSkill = {
  id: "app_build",
  deliverableType: "app_build",
  capabilities: [
    {
      id: "small_app",
      label: "Build a small app or tool from a description",
      produces:
        "Source files with instructions to run them, plus the acceptance criteria " +
        "written before the code — each one marked met or not, so what was skipped " +
        "is visible rather than assumed.",
    },
  ],
  acceptsInternalRequests: true,

  async run(ctx: SkillRunContext) {
    // ── 1. 기준을 먼저 쓴다 ─────────────────────────────────────────
    await setStep(ctx.supabase, ctx.executionId, "planning");

    const { output: spec } = await ctx.providers.ai.generateStructuredOutput({
      systemInstructions:
        "너는 이 회사의 개발자다. **아직 코드를 쓰지 마라.**\n\n" +
        "먼저 이 앱이 무엇을 해야 하는지를 **사람이 직접 확인할 수 있는 문장**으로 " +
        "적는다. '빠르다'가 아니라 '목록이 50개일 때 스크롤이 끊기지 않는다' 처럼.\n\n" +
        `기준은 ${MIN_CRITERIA}개 이상. 확인할 수 없는 것(예쁨·쓰기 편함)은 ` +
        "`humanGate` 에 따로 적는다 — 억지로 기준인 척하지 마라.",
      input:
        `업무: ${ctx.context.assignment.title}\n` +
        `설명: ${ctx.context.assignment.description ?? ""}\n` +
        `기대 결과: ${ctx.context.assignment.expectedOutcome ?? ""}`,
      schema: plan,
      schemaName: "app_plan",
      maxTokens: 6000,
      tier: "judgment",
    });

    if (spec.criteria.length < MIN_CRITERIA) {
      throw new ExecutionError(
        "UNKNOWN_ERROR",
        `확인 가능한 기준이 ${spec.criteria.length}개뿐이다(${MIN_CRITERIA} 필요). ` +
          "업무 설명이 무엇을 만들지 정하기에 모자라다.",
      );
    }

    // ── 2. 그 기준을 놓고 만든다 ────────────────────────────────────
    await setStep(ctx.supabase, ctx.executionId, "generating");

    const { output: made } = await ctx.providers.ai.generateStructuredOutput({
      systemInstructions:
        "아래 기준을 만족하는 앱을 만든다.\n\n" +
        "- 파일 전체를 낸다. `// ...` 로 생략하지 마라 — 받은 사람이 " +
        "붙여 넣어 바로 돌릴 수 있어야 한다.\n" +
        "- `howToRun` 에 시작하는 법을 적는다.\n" +
        "- **못 지킨 기준은 `met: false` 로 적는다.** 지킨 척하면 받은 사람이 " +
        "확인할 때 알게 되고, 그때는 산출물 전체를 못 믿게 된다.",
      input:
        `무엇: ${spec.title}\n\n기준:\n` +
        spec.criteria
          .map((c) => `- [${c.id}] ${c.when} → ${c.then}`)
          .join("\n"),
      schema: build,
      schemaName: "app_build",
      maxTokens: 32000,
      tier: "judgment",
    });

    // ── 3. 기준과 함께 넘긴다 ───────────────────────────────────────
    const met = made.coverage.filter((c) => c.met).length;

    const { data: deliverable } = await ctx.supabase
      .from("deliverables")
      .insert({
        company_id: ctx.execution.company_id,
        assignment_id: ctx.execution.assignment_id,
        company_employee_id: ctx.execution.company_employee_id,
        type: "app_build",
        title: spec.title,
        content: {
          criteria: spec.criteria,
          humanGate: spec.humanGate,
          files: made.files,
          howToRun: made.howToRun,
          coverage: made.coverage,
          summary: { criteria: spec.criteria.length, met },
          note:
            "**돌려 보지 않았습니다.** 이 회사에는 코드를 실행할 자리가 아직 " +
            "없고, 실행 없이 '된다'고 말하는 것은 거짓입니다. 위 기준으로 " +
            "확인해 주십시오 — 기준은 코드보다 먼저 쓰였습니다.",
        },
      })
      .select("id")
      .single();

    if (!deliverable) {
      throw new ExecutionError("UNKNOWN_ERROR", "산출물을 저장하지 못했다.");
    }

    return {
      deliverableId: deliverable.id as string,
      deliverableType: "app_build",
      metrics: { candidateCount: spec.criteria.length, selectedCount: met },
    };
  },
};
