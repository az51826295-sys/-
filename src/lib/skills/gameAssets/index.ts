import { ExecutionError, setStep } from "@/lib/execution/shared";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";
import { createImageProvider } from "@/lib/providers/images";
import {
  judgeCharacter,
  judgePrompt,
  JudgeUnavailable,
  type CharacterVerdict,
} from "@/lib/providers/judge";
import { z } from "zod";

/**
 * 게임 자산을 만드는 일.
 *
 * 이 회사의 다른 기술과 다른 점이 하나 있다. 조사 산출물은 **출처가 뒷받침하지
 * 않는 주장**을 했을 때 거절되고, 아트 바이블은 **자기 모순**일 때 거절된다.
 * 여기서는 거절 사유가 밖에 있다 — 나온 그림이 **설계도의 수치를 못 맞추면**
 * 떨어진다. 색이 몇 개인지, 명암이 얼마나 벌어지는지, 게임 바닥에 올렸을 때
 * 형태가 읽히는지는 전부 재는 것이지 의견이 아니다.
 *
 * ## 왜 여러 개를 뽑는가
 *
 * 생성기는 확률적이다. 같은 주문이 회차마다 크게 흔들린다 — 자매 프로젝트에서
 * 같은 설정으로 뽑은 캐릭터 둘의 색 수가 10 대 21이었다. 그러니 한 번 뽑아
 * 쓰는 것은 판정이 아니라 도박이고, 그 게임의 자산이 전부 그렇게 만들어져서
 * 화면이 제각각이었다.
 *
 * 그래서 이 기술은 `selects: true` 다. 엔진이 후보 수를 확인하고, 하나에서
 * 골랐으면 "고른 게 아니다"라고 매니저에게 적어 준다.
 *
 * ## 무엇을 하지 않는가
 *
 * **고르지 않는다.** 기계는 못 쓸 것을 걸러 낼 뿐이고, 통과한 것 중 무엇을
 * 쓸지는 사람이 정한다. 순위도 매기지 않는다 — 순위를 매기는 순간 그건 취향을
 * 대신 정하는 것이고, 이 제품이 하지 않기로 한 일이다.
 */

/** 이보다 적게 뽑으면 고를 것이 없다. */
const CANDIDATES = 4;

const briefSchema = z.object({
  /** 그림 생성기에 그대로 갈 문장. 영어. */
  prompt: z.string(),
  /** 이 자산이 무엇인지 한 줄. 산출물 제목이 된다. */
  subject: z.string(),
});

/**
 * 형식 지시. **내용은 위 프롬프트에서 오고 이건 형식만이다.**
 *
 * `"pixel art game sprite"` 만 쓰면 한 장에 20프레임이 들어간 시트가 온다.
 * 게임에 넣을 수 없는 물건이고, 그건 생성기가 아니라 주문이 모자란 것이다.
 */
const FORM =
  "Pixel art sprite for a 2D top-down game. Chunky visible square pixels, " +
  "hard-edged, limited palette, no anti-aliasing, no blur, no gradients. " +
  "ONE single character alone, centered, full body, facing the viewer, " +
  "one standing pose. Completely empty transparent background, nothing else: " +
  "no ground, no floor shadow, no vignette, no frame, no border, no grid, " +
  "no second pose, no text.";

export const gameAssetsSkill: EmployeeSkill = {
  id: "game_assets",
  deliverableType: "game_assets",
  capabilities: [
    {
      id: "game_character_art",
      label: "Make a game character sprite that meets a written spec",
      produces:
        "Several candidate sprites, each measured against the spec — colour count, " +
        "contrast, how it reads on the game's own ground — with the failures " +
        "named and only the passing ones handed over to choose from.",
    },
  ],
  acceptsInternalRequests: true,
  selects: true,

  async run(ctx: SkillRunContext) {
    await setStep(ctx.supabase, ctx.executionId, "planning");

    // ── 1. 무엇을 그릴지 정한다 ─────────────────────────────────────
    const { output: brief } = await ctx.providers.ai.generateStructuredOutput({
      systemInstructions:
        "너는 게임 아트 발주 담당이다. 아래 업무를 읽고 **그림 한 장의 주문 문장**을 쓴다.\n\n" +
        "규칙:\n" +
        "- 영어로 쓴다.\n" +
        "- **색을 이름이나 16진수로 지목**한다.\n" +
        "- **명암을 위치로 지목**한다 (deep shadow under ~, bright highlight on ~).\n" +
        "- 속성을 '낮춰라/없애라'로 요구하지 마라. 그 극단이 온다 — " +
        "`low saturation` 은 흑백을, `no harsh contrast` 는 평면을 낳는다.",
      input:
        `업무: ${ctx.context.assignment.title}\n` +
        `설명: ${ctx.context.assignment.description ?? ""}\n` +
        `기대 결과: ${ctx.context.assignment.expectedOutcome ?? ""}`,
      schema: briefSchema,
      schemaName: "game_asset_brief",
      maxTokens: 4000,
      tier: "judgment",
    });

    // ── 2. 보내기 전에 문구를 검사한다 ──────────────────────────────
    //
    // 누가 썼든 같은 검사를 받는다. 여기서 막는 것이 그림 넉 장을 그린 뒤에
    // 전부 흑백으로 나오는 것보다 싸다.
    let lint;
    try {
      lint = await judgePrompt(FORM + " " + brief.prompt);
    } catch (error) {
      if (error instanceof JudgeUnavailable) {
        throw new ExecutionError("UNKNOWN_ERROR", error.message);
      }
      throw error;
    }
    if (!lint.ok) {
      throw new ExecutionError(
        "UNKNOWN_ERROR",
        "발주 문구가 검사에 걸렸다: " +
          lint.banned.map((b) => `${b.found} — ${b.why}`).join("; "),
      );
    }

    // ── 3. 여러 개 뽑는다 ───────────────────────────────────────────
    await setStep(ctx.supabase, ctx.executionId, "generating");
    const drawer = createImageProvider();
    const made: { dataUrl: string; index: number }[] = [];
    const drawFailures: string[] = [];
    for (let i = 0; i < CANDIDATES; i++) {
      try {
        const img = await drawer.draw(FORM + " " + brief.prompt);
        made.push({ dataUrl: img.dataUrl, index: i });
      } catch (error) {
        // 한 장이 실패해도 나머지로 계속한다. 넉 장 중 셋이면 아직 고를 수 있다.
        drawFailures.push(
          `${i + 1}번: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (made.length === 0) {
      throw new ExecutionError(
        "UNKNOWN_ERROR",
        "후보를 한 장도 못 그렸다. " + drawFailures.join("; "),
      );
    }

    // ── 4. 거른다 ───────────────────────────────────────────────────
    await setStep(ctx.supabase, ctx.executionId, "judging");
    const judged: { index: number; dataUrl: string; verdict: CharacterVerdict }[] =
      [];
    for (const m of made) {
      const verdict = await judgeCharacter([m.dataUrl.split(",")[1]]);
      judged.push({ ...m, verdict });
    }
    const passed = judged.filter((j) => j.verdict.verdict === "PASS");
    const rejected = judged.filter((j) => j.verdict.verdict === "FAIL");
    const unmeasured = judged.filter((j) => j.verdict.verdict === "UNDEFINED");

    // ── 5. 넘긴다. 순위 없이 ────────────────────────────────────────
    const { data: deliverable } = await ctx.supabase
      .from("deliverables")
      .insert({
        company_id: ctx.execution.company_id,
        assignment_id: ctx.execution.assignment_id,
        company_employee_id: ctx.execution.company_employee_id,
        type: "game_assets",
        title: brief.subject,
        content: {
          prompt: brief.prompt,
          candidates: judged.map((j) => ({
            index: j.index,
            image: j.dataUrl,
            verdict: j.verdict.verdict,
            // 왜 떨어졌는지 없이 탈락만 보여 주면 다음 주문을 못 고친다.
            why: j.verdict.fail ?? j.verdict.undefined ?? [],
            measured: {
              colors: j.verdict.colors,
              saturation: j.verdict.saturation,
              lumaSpread: j.verdict.luma_spread,
              edgeContrast: j.verdict.in_context?.edge_contrast,
            },
          })),
          // 세 값을 나눠 적는다. 미측정을 실패에 섞으면 "판정기가 없어서 못 쟀다"
          // 와 "재 보니 못 쓴다"가 같은 칸에 들어가고, 그 둘은 다음에 할 일이 다르다.
          summary: {
            passed: passed.length,
            rejected: rejected.length,
            unmeasured: unmeasured.length,
          },
          drawFailures,
          note:
            "기계는 걸렀을 뿐 고르지 않았습니다. 통과한 것 중 무엇을 쓸지는 " +
            "사람이 정합니다 — 순위는 매기지 않았습니다.",
        },
      })
      .select("id")
      .single();

    if (!deliverable) {
      throw new ExecutionError("UNKNOWN_ERROR", "산출물을 저장하지 못했다.");
    }

    return {
      deliverableId: deliverable.id as string,
      deliverableType: "game_assets",
      metrics: {
        candidateCount: judged.length,
        selectedCount: passed.length,
      },
    };
  },
};

/** 읽는 쪽이 세 값을 구분할 수 있게 남긴다. 미측정은 실패가 아니다. */
export type GameAssetOutcome = {
  passed: number;
  rejected: number;
  unmeasured: number;
};
