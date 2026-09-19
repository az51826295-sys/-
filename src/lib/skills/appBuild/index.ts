import { widenExpectation, type Expectation } from "@/lib/skills/appBuild/measures";
import { z } from "zod";
import { renderGamedevLessons, unityRules } from "@/lib/knowledge/skillFiles";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import { step } from "@/lib/execution/steps";
import { askApproval } from "@/lib/execution/approval";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";
import { checkFiles, repairBrief, summarise } from "@/lib/skills/appBuild/verify";
import { buildPatch } from "@/lib/skills/appBuild/patch";
import { improveLoop, roundsFor, isThorough, type LoopResult } from "@/lib/skills/appBuild/loop";
import { factLines } from "@/lib/skills/appBuild/run";

/**
 * **고치는 자리** (172회차 09-18, 사장님 "A로 가"). 조각 고침은 gpt-5 가 아니라 `FIX_SEAT_MODEL`(기본 gpt-5.6-luna)에 앉힌다.
 * 근거: 09-17 실제 고장(부호 두 줄, 859줄 파일)을 gpt-5 · 5.6-luna · 5.6-terra · 5.3-codex 에 시켰더니 **넷 다 같은 두 줄**을 고쳤고
 * luna 는 57초 → 6초, 값은 gpt-5 의 1/8 이다. 문제 하나로 잰 것이라 "같은 실력" 이 아니라 "이 일에선 같았다" 다 — 심판자가 매 판 본다.
 * 처음 만드는 판(buildWhole)은 아직 안 재 봐서 그대로 둔다. 되돌리기: 환경변수 `FIX_SEAT_MODEL=gpt-5`.
 */
async function fixSeat(ctx: SkillRunContext) {
  // 183회차 섞어 보내기: 환경변수가 없으면 후보(luna·deepseek-v4-flash) 중 성적표로 고른다(seats.ts). 한 판 안에서는 한 자리.
  const picked = await pickedFixSeat(ctx);
  if (picked.provider) return picked.provider;
  return seat(ctx, "gpt-5.6-luna", "고치는");
}
const fixPicks = new WeakMap<SkillRunContext, { model: string; why: string; provider: import("@/lib/providers/types").AIProvider | null }>();
async function pickedFixSeat(ctx: SkillRunContext) {
  const had = fixPicks.get(ctx);
  if (had) return had;
  const { pickFixSeat, seatProvider, recordLine, whyForPerson } = await import("@/lib/skills/appBuild/seats");
  const pick = await pickFixSeat(ctx.supabase);
  // 184회차 (2단계 1번): "왜 이 AI인가" 를 사람 말로 계획 카드에 — 머리의 결정 칸(metrics_json.decision.whyAi)에 얹는다. 모델 이름은 없다.
  try {
    const whyAi = whyForPerson(pick);
    const { data: cur } = await ctx.supabase.from("work_executions").select("metrics_json").eq("id", ctx.executionId).maybeSingle();
    const m = ((cur?.metrics_json as Record<string, unknown> | null) ?? {});
    const decision = { ...((m.decision as Record<string, unknown> | null) ?? {}), whyAi };
    await ctx.supabase.from("work_executions").update({ metrics_json: { ...m, decision } }).eq("id", ctx.executionId);
    console.log(`[자리] 사장님 줄: ${whyAi}`);
  } catch { /* 못 적어도 일은 간다 */ }
  let provider: import("@/lib/providers/types").AIProvider | null = null;
  if (ctx.providers.ai.name !== "mock" && pick.model !== "router") {
    const raw = await seatProvider(pick.model);
    if (raw) {
      const { meterProviders } = await import("@/lib/costs/meter");
      provider = meterProviders({ ...ctx.providers, ai: raw }, ctx.supabase, { companyId: ctx.execution.company_id, workExecutionId: ctx.executionId, companyEmployeeId: ctx.execution.company_employee_id }).ai;
    }
  }
  console.log(`[자리] 고치는 자리 → ${pick.model} (${pick.why})` + (pick.records.length ? String.fromCharCode(10) + pick.records.map((r) => "  " + recordLine(r)).join(String.fromCharCode(10)) : ""));
  const out = { model: provider ? pick.model : ctx.providers.ai.model, why: pick.why, provider };
  fixPicks.set(ctx, out);
  return out;
}
/**
 * **만드는 자리** (174회차 09-18). 같은 계획(데모 회사 벽돌깨기, 기준 10개, 아이패드 기기 줄)을 셋에 시켜 브라우저(태블릿 화면)에서 돌렸다:
 * gpt-5 328초·출력 13,393토큰(≈$0.13)·759줄 / **luna 25초·4,594토큰(≈$0.006)·306줄** / terra 39초·4,230토큰(≈$0.05)·190줄 — 셋 다 콘솔 오류 0, 터치 조작 됨.
 * 표본 하나. 되돌리기: `BUILD_SEAT_MODEL=gpt-5`. 심판자가 매 판 본다.
 */
async function buildSeat(ctx: SkillRunContext) { return seat(ctx, process.env.BUILD_SEAT_MODEL ?? "gpt-5.6-luna", "만드는"); }
/** 고리의 심판 자리(179회차). luna 가 그림을 본다(시험: 파랑 바탕·노랑 네모·왼쪽 맞춤, 1.8초 vs gpt-5 10초). 바퀴값이 $0.04 → $0.005. 되돌리기: `LOOP_JUDGE_MODEL=router`. */
async function loopJudgeSeat(ctx: SkillRunContext) { return seat(ctx, process.env.LOOP_JUDGE_MODEL ?? "gpt-5.6-luna", "심판"); }
async function seat(ctx: SkillRunContext, model: string, what: string) {
  if (!model || model === "router" || ctx.providers.ai.name === "mock" || !process.env.OPENAI_API_KEY) return ctx.providers.ai;
  try {
    const { createOpenAIProvider } = await import("@/lib/providers/openai");
    const { meterProviders } = await import("@/lib/costs/meter");
    // 계량을 다시 씌운다 — 자리를 갈아 끼우고 장부에 안 남으면 그 돈은 없는 돈이 된다(152회차의 교훈).
    return meterProviders({ ...ctx.providers, ai: createOpenAIProvider({ judgmentModel: model }) }, ctx.supabase, {
      companyId: ctx.execution.company_id, workExecutionId: ctx.executionId, companyEmployeeId: ctx.execution.company_employee_id,
    }).ai;
  } catch (e) {
    console.warn(`[app_build] ${what} 자리를 못 앉혔다 — 하던 자리로:`, e instanceof Error ? e.message : e);
    return ctx.providers.ai;
  }
}
import { changeFacts, judgeAsk, type AskVerdict } from "@/lib/genesis/askJudge";

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
   * 자가 숫자로 재는 기대치(32회차 09-07). 자가 재는 값: player_viewport_x(0~1, 화면 가로 위치), player_viewport_y,
   * jump_height_m, hud_score_visible(true/false), coin_count. 이번 주문에 걸리는 것만 적는다 — 어긋나면 실패 줄이 되어
   * 스스로 다시 고친다. 없으면 빈 배열.
   */
  /**
   * 이번 판이 어느 단계인가 (46회차 09-08, 사장님 지시).
   * 게임은 한 번에 완성되지 않는다: **프로토타입 → 맵 → 캐릭터 → 다듬기**. 단계마다 사장님이 체험하고 확정해야
   * 다음으로 간다 — 그래야 "이게 아닌데" 를 맵 다 깔고 캐릭터 다 넣은 뒤에 듣지 않는다.
   * prototype: 조작·규칙이 되는 최소한 / map: 지형·구역·동선 / character: 캐릭터·애니메이션 / polish: 소리·연출·다듬기.
   * 주문에 단계가 드러나면 그것을, 아니면 지난 판 다음 단계를, 처음이면 prototype.
   */
  stage: z.enum(["prototype", "map", "character", "polish"]),
  /**
   * 이번 판에 **손댈 파일** (지난 판 경로 그대로). 09-09 사장님: "돈만 갖다 쓰지 마라."
   * 자가 세어 보니 73판 중 68판이 **안 바뀐 파일을 통째로 다시 냈다**(한 판 최대 139 KB).
   * 출력은 입력의 8배 값이라 새는 돈의 대부분이 여기였다. 말로 부탁해도 안 지켜져서(`keep` 5/73)
   * **구조로 막는다**: 여기 적은 파일만 내용을 받고, 여기 적은 파일만 낸다. 나머지는 그대로 이어 붙는다.
   * **줄어드는 파일·쪼개지는 파일도 반드시 여기 넣는다.** 09-09 에 씬 빌더를 쪼개라고 시켰더니
   * 원본이 여기 없어서 "손대지 않는 파일" 로 분류됐고, Dev 는 `#if false` 로 감싼 **빈 껍데기 5개**를 내고 끝냈다.
   * 그 판은 아무것도 안 바뀌었다 — 지시가 모순이었기 때문이다(쪼개라 + 원본은 건드리지 마라).
   * 처음 만드는 판이면 빈 배열.
   */
  touch: z.array(z.string()),
  /**
   * 고치는 판에서, 사람의 말이 **고장 하나(또는 작은 손질 하나)** 를 가리키는가 (165회차 09-17).
   * 참이면 계획을 보이고 '시작' 을 기다리지 않는다 — 사장님은 "오른쪽 눌렀는데 왼쪽으로 가" 라고 말한 뒤
   * 기준 26개짜리 계획 카드를 받고 다섯 시간 뒤에야 '시작' 을 눌렀다. 고쳐 달라는 말이 이미 지시다.
   * 새 단계·새 화면·새 기능처럼 큰 일이면 거짓(계획을 보이고 묻는다). 처음 만드는 판이면 거짓.
   */
  small: z.boolean(),
  expectations: z.array(z.object({ measure: z.enum(["player_viewport_x", "player_viewport_y", "jump_height_m", "hud_score_visible", "coin_count", "level_extent_m", "landmark_count", "camera_distance_m", "ground_color_count", "parts_attached", "part_offset_m", "part_size_ratio", "part_covers_bone", "body_height_m", "head_count", "part_offset_ratio", "part_triangles"]), min: z.number().nullable(), max: z.number().nullable(), equals: z.boolean().nullable(), why: z.string() })),
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
  /**
   * 어디에 짓는가. 09-05 사장님: "HTML 말고, 엔진에 넣어야지, 유니티로." 게임·3D·
   * 유니티 이야기면 unity, 웹 도구·페이지면 web. 모르면 unity — 이 회사의 게임은
   * 유니티 안에서 산다.
   */
  target: z.enum(["unity", "web"]),
});

/**
 * 유니티로 지을 때의 규칙. 09-05 사장님: "엔진에 넣어야지, 유니티로."
 *
 * 파일은 유니티 창(Window → Rookery → 가져오기)이 `Assets/Rookery/Scripts/<제목>/`
 * 에 그대로 놓는다. 씬은 에디터 스크립트가 짓는다 — 씬 파일(.unity)을 글로 내지
 * 않는다(생성기가 낸 YAML 은 거의 항상 깨진다).
 */
// UNITY_RULES 는 이제 파일이다: src/skills/unity-rules.md (계획 4, 09-07). 저장소 버킷 _skills/ 가 이긴다.

const build = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      language: z.string(),
      contents: z.string(),
    }),
  ),
  /**
   * 고치는 판에서 **안 바꾸는** 지난 파일의 경로. contents 를 되쓰지 않는다 — 코드가
   * 지난 판에서 이어 붙인다. 파일 9개를 매번 되쓰다 20분을 넘겨 죽었다(00:19).
   */
  keep: z.array(z.string()).optional().nullable(),
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

/** 처음 만드는 판의 프롬프트 (174회차에 밖으로 뺌 — 자리 시험 `build_seat_probe.mts` 가 같은 글로 여러 모델을 잰다). */
export const WHOLE_BUILD_SYSTEM =
  "아래 기준을 만족하는 앱을 만든다.\n\n" +
  "- 파일 전체를 낸다. `// ...` 로 생략하지 마라 — 받은 사람이 " +
  "붙여 넣어 바로 돌릴 수 있어야 한다.\n" +
  "- `howToRun` 에 시작하는 법을 적는다.\n" +
  "- **못 지킨 기준은 `met: false` 로 적는다.** 지킨 척하면 받은 사람이 " +
  "확인할 때 알게 되고, 그때는 산출물 전체를 못 믿게 된다.";
export const buildSchema = build;

export function wholeBuildInput(spec: { title: string; criteria: { id: string; when: string; then: string }[]; touch?: string[] | null }, deviceNote: string, previous: Previous | null): string {
  const criteria = spec.criteria.map((c) => `- [${c.id}] ${c.when} → ${c.then}`).join("\n");
  let prev = "";
  if (previous) {
    // 09-09: 지난 파일을 **전부** 붙이던 자리. 이제 계획이 고른 것만 전문으로 주고, 나머지는 경로와 크기만 알려 준다.
    const touch = new Set(spec.touch ?? []);
    const full = touch.size === 0 ? previous.files : previous.files.filter((f) => touch.has(f.path));
    const rest = previous.files.filter((f) => !full.includes(f));
    const failed = previous.failedChecks.length ? "유니티 시험에서 떨어진 줄(이것을 고치는 것이 이번 판이다):\n" + previous.failedChecks.map((f) => `- ${f}`).join("\n") + "\n\n" : "";
    const head = full.map((f) => `--- ${f.path} (${f.language})\n${f.contents}`).join("\n\n");
    const tail = rest.length ? "\n\n## 손대지 않는 파일 (그대로 이어 붙는다 — 내지 마라)\n" + rest.map((f) => `- ${f.path} (${Math.round(f.contents.length / 1024)} KB)`).join("\n") : "";
    prev = "\n\n## 지난 판의 파일 — 이것을 바탕으로 고친다.\n" +
      "**계획이 고른 파일만 `files` 에 전체를 낸다.** 아래 '손대지 않는 파일' 은 내지 마라 — " +
      "코드가 지난 판에서 그대로 이어 붙인다. 지난 파일을 되쓰지 마라(그러다 20분을 넘겨 죽는다).\n" + failed + head + tail;
  }
  return `무엇: ${spec.title}${deviceNote}\n\n기준:\n` + criteria + prev;
}

type Previous = {
  title: string;
  criteria: { id: string; when: string; then: string }[];
  files: { path: string; language: string; contents: string }[];
  /** 유니티 창이 재 본 결과 중 떨어진 줄. 없으면 빈 배열. */
  failedChecks: string[];
  /** 지난 판의 기대치(33회차). 재시도 판의 계획은 떨어진 줄만 적어 레벨 기대치 셋이 사라졌다 — 기준처럼 코드가 이어 붙인다. */
  expectations: { measure: string; min: number | null; max: number | null; equals: boolean | null; why: string }[];
};

async function loadPrevious(ctx: SkillRunContext): Promise<Previous | null> {
  const ri = ctx.context.roleInput as { previousDeliverableId?: string | null; previousAssignmentId?: string | null } | null;
  let id = ri?.previousDeliverableId ?? null;
  // 169회차: 접수 때 아직 안 돌아왔던 일의 결과물을 이제 찾는다(이 일은 그 일 뒤에 섰으므로 지금은 끝나 있다).
  if (!id && ri?.previousAssignmentId) {
    const { data: d } = await ctx.supabase.from("deliverables").select("id").eq("assignment_id", ri.previousAssignmentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    id = (d?.id as string | undefined) ?? null;
    if (!id) console.warn(`[app_build] 고칠 대상 업무 ${ri.previousAssignmentId} 의 결과물이 아직 없다 — 처음 판으로 만든다`);
  }
  if (!id) return null;
  const { data } = await ctx.supabase
    .from("deliverables")
    .select("title, content_json")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const c = (data.content_json ?? {}) as {
    criteria?: Previous["criteria"];
    coverage?: { criterionId: string; met: boolean }[];
    files?: Previous["files"];
    expectations?: Previous["expectations"];
    unityChecks?: { cases?: { name: string; result: string; message?: string | null }[] };
  };
  const failed = (c.unityChecks?.cases ?? [])
    .filter((k) => k.result === "Failed")
    .map((k) => `${k.name}${k.message ? ` — ${k.message.slice(0, 300)}` : ""}`);
  const ask = `${ctx.context.assignment.title} ${ctx.context.assignment.description ?? ""}`;
  return {
    title: data.title as string,
    criteria: pruneCriteria(c.criteria ?? [], c.coverage ?? [], ask),
    files: c.files ?? [],
    failedChecks: failed,
    expectations: c.expectations ?? [],
  };
}

/**
 * 지난 기준을 **살아 있는 것만** 이어 받는다.
 *
 * 판마다 기준이 쌓여 09-06 밤에 183개가 됐다(E4). 이번 주문과 무관한 기준까지 계획·코드·검수
 * 프롬프트에 매번 들어가 계획 입력의 대부분(17k 토큰)이 그것이었고, 모델은 전부를 다시 평가했다.
 * 남기는 것: 지난 판에서 못 지킨 것(아직 열린 숙제) + 이번 주문의 낱말이 든 것(관련) + 가장 최근 것
 * 열다섯(지금의 관심사). 합쳐 마흔을 넘지 않는다. 지운 기준은 없어진 것이 아니라 지난 판 행에 그대로 있다.
 */
/**
  * 128회차 09-16: 상한 40 → **24**, 최근 15 → 8.
  *
  * 121판을 세어 보니 프롬프트에 드는 기준 개수와 지킴 비율이 이렇게 갔다:
  *   기준 ~30개 → 평균 지킴 **91%** · 31~60개 → **52%** · 151개 이상 → **15%**(171개 중 4개 지킨 판도 있다)
  * 09-06 에 40으로 자른 것이 189개 폭주를 멈춘 것은 맞지만, **40도 여전히 무너지는 구간**이었다.
  *
  * 왜 이 목록만 줄이나: `criteria` 의 충족 여부(`coverage`)는 **모델이 직접 판단해서 적는다**. 기계가 재는 것이 아니다.
  * 그러니 개수가 늘면 그만큼 모델 일이 늘고, 늘어난 만큼 무너진다. 반대로 `expectations`(유니티가 숫자로 잼)와
  * 규격 검사는 기계가 재므로 **줄이지 않는다** — 안 재면 그 요구는 지켜지는 게 아니라 사라진다(arXiv 2606.28430).
  * 원칙: **재는 것은 전부 재라, 한 번에 시키는 것은 적게 시켜라.**
  */
const CRITERIA_RECENT = 8;
const CRITERIA_CAP = 24;
export function pruneCriteria(
  all: Previous["criteria"],
  coverage: { criterionId: string; met: boolean }[],
  ask: string,
): Previous["criteria"] {
  if (all.length <= CRITERIA_CAP) return all;
  const unmet = new Set(coverage.filter((c) => c.met === false).map((c) => c.criterionId));
  const words = ask.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const related = (c: Previous["criteria"][number]) => {
    const t = `${c.when} ${c.then}`.toLowerCase();
    return words.some((w) => t.includes(w));
  };
  // 128회차: 넘칠 때 **무엇을 먼저 버리는지**를 정한다. 전에는 셋을 한 자루에 넣고 최근 것부터 잘랐다 —
  // 그래서 아직 못 지킨 숙제가 '오래됐다'는 이유로 잘려 나갈 수 있었다. 순서를 못 박는다:
  //   1순위 지난 판에서 **못 지킨 것**(아직 열린 숙제 — 이건 버리면 퇴보가 안 보인다)
  //   2순위 이번 **주문의 낱말이 든 것**(지금 고치는 자리)
  //   3순위 **가장 최근** 것(지금의 관심사)
  // 잘린 기준은 지난 판 행에 그대로 남는다 — 사라지는 게 아니라 이번 프롬프트에 안 들어갈 뿐이다.
  const recent = new Set(all.slice(-CRITERIA_RECENT).map((c) => c.id));
  const rank = (c: Previous["criteria"][number]) => (unmet.has(c.id) ? 0 : related(c) ? 1 : recent.has(c.id) ? 2 : 3);
  const out = all
    .map((c, i) => ({ c, i, r: rank(c) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || b.i - a.i) // 같은 순위면 최근 것 먼저
    .slice(0, CRITERIA_CAP)
    .sort((a, b) => a.i - b.i) // 원래 차례로 되돌려 읽기 좋게
    .map((x) => x.c);
  const n = (r: number) => all.filter((c) => rank(c) === r).length;
  console.log(`[app_build] 기준 ${all.length} → ${out.length} (못 지킴 ${n(0)} · 주문 관련 ${n(1)} · 최근 ${n(2)} · 상한 ${CRITERIA_CAP})`);
  return out;
}

export const appBuildSkill: EmployeeSkill = {
  id: "app_build",
  deliverableType: "app_build",
  capabilities: [
    {
      id: "small_app",
      // 09-05 18:30 첫 판(딥시크)이 "Build a small app" 만 보고 "유니티 프로젝트 제작은
      // 목록에 없다" 며 스스로 거절했다. 사람이 쓰는 말(게임·유니티·만들어 줘)이
      // 이름에 있어야 한다 — 갈라야 하는 것이 바로 그 낱말이다.
      label:
        "게임·앱 만들기 — 유니티 게임(C# 스크립트 + 씬 빌더), 웹 도구. " +
        "'게임 만들어 줘'·'유니티로 …' 는 여기 / Build a Unity game or a small app",
      produces:
        "Unity C# scripts and an editor scene builder (or web source files), with " +
        "acceptance criteria written before the code — each marked met or not.",
    },
  ],
  acceptsInternalRequests: true,

  async run(ctx: SkillRunContext) {
    // ── 0. 고치는 판인가 ────────────────────────────────────────────
    // 같은 대화에서 이 직원이 돌려준 지난 산출물이 있으면 이번 판은 그것을 고치는
    // 판이다. 지난 파일과 유니티 시험에서 떨어진 줄이 같이 간다. 처음부터 다시
    // 쓰게 두면 지난 판에서 통과한 것까지 새로 깨진다(09-05 저녁).
    const previous = await loadPrevious(ctx);
    // 173회차: **사장님이 쓰는 기기.** 아이패드에서 시킨 FPS 에 마우스 시점(포인터 락)을 넣었다 — 그 기기에선 안 돈다.
    // 브라우저가 알려 준 기기 사실(`hand/device.ts`)을 계획·만들기 프롬프트에 댄다. 없으면 빈 줄(지어내지 않는다).
    let deviceNote = "";
    try {
      const { loadDevices, deviceLine } = await import("@/lib/hand/device");
      const devs = (await loadDevices(ctx.supabase, ctx.execution.company_id)).slice(0, 3);
      if (devs.length) deviceNote = "\n\n## 사장님이 로키를 쓰는 기기(최근, 브라우저가 알려 준 것)\n" + devs.map((d) => `- ${deviceLine(d)} (${d.at.slice(0, 10)})`).join("\n") +
        "\n웹(HTML) 판이면 **첫 줄의 기기에서 그대로 돌아야 한다**: 터치 기기면 방향키·마우스 대신 터치 조작(가상 패드·드래그·탭)을 기본으로, 포인터 락이 안 되면 마우스 시점 회전을 쓰지 않는다. 컴퓨터면 키보드·마우스.";
    } catch { /* 못 읽으면 없는 대로 */ }

    // ── 1. 기준을 먼저 쓴다 ─────────────────────────────────────────
    await setStep(ctx.supabase, ctx.executionId, "planning");

    // 단계 저장(계획 2 "안 죽는 실행"): 죽었다 다시 돌면 계획·코드를 다시 사지 않는다.
    // 186회차: 고치는 판의 계획(제목·기준 이어받기·손댈 파일·작은 고침인가)은 생각 모드 자리(deepseek-v4-pro, 40초쯤)에 앉힐 일이 아니다 —
    // 고치는 자리(luna, 5초)로. 처음 만드는 판의 계획은 그대로(기준을 처음 쓰는 자리라 판단이 더 든다). 되돌리기: PLAN_SEAT_FIX=router.
    const planAi = previous && previous.files.length > 0 && (process.env.PLAN_SEAT_FIX ?? "fix") !== "router" ? await fixSeat(ctx) : ctx.providers.ai;
    const spec = await step(ctx.supabase, ctx.executionId, "plan", async () => (await planAi.generateStructuredOutput({
      systemInstructions:
        "너는 이 회사의 개발자다. **아직 코드를 쓰지 마라.**\n\n" +
        "먼저 이 앱이 무엇을 해야 하는지를 **사람이 직접 확인할 수 있는 문장**으로 " +
        "적는다. '빠르다'가 아니라 '목록이 50개일 때 스크롤이 끊기지 않는다' 처럼.\n\n" +
        `기준은 ${MIN_CRITERIA}개 이상, ${CRITERIA_CAP}개 이하. 한 기준은 두 문장 안에. 확인할 수 없는 것(예쁨·쓰기 편함)은 ` +
        "`humanGate` 에 따로 적는다 — 억지로 기준인 척하지 마라.\n\n" +
        "`target`: 게임·3D·유니티·캐릭터·씬 이야기면 **unity**(이 회사의 게임은 유니티 " +
        "안에서 산다 — HTML 게임을 내지 마라). 웹 도구·페이지·스크립트면 web. 모르면 unity.\n" +
        "unity 면 기준은 유니티 안에서 사람이 눌러 볼 수 있는 문장으로: " +
        "'메뉴 Rookery/… 를 누르면 씬이 생기고 Play 하면 …'.\n\n" +
        "`stage`: 이번 판이 어느 단계인가 — prototype(조작·규칙이 되는 최소한) · map(지형·구역·동선) · character(캐릭터·애니메이션) · polish(소리·연출). " +
        "주문에 드러나면 그것을, 고치는 판이면 지난 판과 같은 단계를, 처음이면 prototype.\n" +
        "`expectations`: 자(유니티 시험)가 **숫자로 재는** 기대치. 잴 수 있는 값은 딱 열둘 — " +
        "player_viewport_x(플레이어의 화면 가로 위치 0~1, 왼쪽이 0), player_viewport_y, jump_height_m(스페이스 점프 높이 m), " +
        "hud_score_visible(점수 글자가 카메라 캔버스에 보이는가), coin_count(동전 수), level_extent_m(바닥을 뺀 정적 물체들이 차지하는 가로·세로 중 큰 쪽 m), " +
        "landmark_count(높이 6 m 이상인 정적 물체 수), camera_distance_m(카메라에서 플레이어 가슴까지 m), ground_color_count(넓이 4 m² 이상 납작한 정적 물체의 바탕색 가짓수), parts_attached(플레이어 뼈에 매단 조각 수), part_offset_m(조각과 뼈 사이 거리 m), part_offset_ratio(그 거리 ÷ 머리 크기 — 제대로 씌운 투구가 0.42 다. 0.27~0.57 로 적어라. **위만 적지 마라** — 0 은 조각이 목덜미에 가라앉은 것이라 통과시키면 안 된다), part_size_ratio(조각의 가장 긴 변 ÷ **머리 크기** — 투구는 1.0~1.6 이 맞다), part_covers_bone(조각이 붙은 뼈를 감싸는가). body_height_m(사람 캐릭터의 발끝~정수리 m), head_count(키 ÷ 머리 크기 = 몇 등신. 리얼 7~8·스타일 5~6·데포르메 3). **소수로 재는 자(키·거리·점프·등신비)에는 딱 떨어지는 값을 적지 마라.** 09-09: 등신비를 `6.3~6.3` 으로 못 박았더니 실측 6.296 이 떨어졌다 — 게임은 멀쩡한데 자가 소수점에 걸린 것이다. '그대로 유지' 를 뜻할 때는 **±2% 쯤 폭을 준다**(예: 6.17~6.43). **`equals` 는 참/거짓 자에만 쓴다(hud_score_visible·part_covers_bone). 숫자 자(동전 수·키·거리)에 `equals: true` 를 적으면 못 잰다 — min/max 로 적어라.** 이번 주문에 걸리는 것만 min/max(또는 equals) 로 " +
        "적는다(예: '가로 1/3' → player_viewport_x min 0.25 max 0.41). 안 걸리면 빈 배열. 다른 이름은 못 잰다.\n" +
        "**한쪽만 적지 마라.** `min 3` 만 적으면 999 도 통과한다 — 131회차 감사: `ground_color_count` 를 `3~∞` 로 적어 45번 재서 한 번도 안 떨어졌다. " +
        "위가 뜻이 있는 값이면(개수·비율·거리) 위도 적는다. 한쪽이 정말 뜻이 없을 때만(예: 삼각형 수의 아래) 비운다." +
        // 설계 단계가 읽는 것은 범위·반응 쪽(blueprint). 코드 쪽 규칙은 짓는 단계에서.
        (await renderGamedevLessons("blueprint")),
      input:
        deviceNote + "\n\n" +
        `업무: ${ctx.context.assignment.title}\n` +
        `설명: ${ctx.context.assignment.description ?? ""}\n` +
        `기대 결과: ${ctx.context.assignment.expectedOutcome ?? ""}` +
        (previous
          ? `\n\n## 고치는 판이다\n지난 판 "${previous.title}" 의 기준은 **코드가 자동으로 유지한다 — 되쓰지 마라.** ` +
            "criteria 에는 이번 판에서 **새로 더할 기준만** 쓴다(없으면 빈 배열). 지난 id 는 쓰지 마라.\n" +
            `지난 기준(참고):\n${previous.criteria.map((c) => `- [${c.id}] ${c.when} → ${c.then}`).join("\n")}\n` +
            (previous.failedChecks.length
              ? `유니티에서 재 본 결과 떨어진 줄:\n${previous.failedChecks.map((f) => `- ${f}`).join("\n")}\n`
              : "") +
            "target 은 지난 판과 같다. **지난 기준은 id 그대로 전부 남기고**(묶지 마라), 새 기준은 뒤에 더한다.\n" +
            // 165회차: "오른쪽 눌렀는데 왼쪽으로 간다" 한마디에 기준이 23 → 26 이 되고 '4방향 검증 표·Debug HUD·로그 내보내기' 가
            // 붙어 새 게임이 나왔다. 고치는 판의 계획은 사람이 말한 고장의 크기를 넘지 않는다.
            "**고치는 판의 크기는 사람이 한 말의 크기다.** 사람이 고장 하나를 말했으면 새 기준은 그 고장이 고쳐졌는지 확인하는 **한두 개**뿐이다(많아야 셋). " +
            "검증 도구·디버그 화면·로그·시험 표·보고서 같은 **부탁받지 않은 것을 기준으로 만들지 마라** — 기준으로 적으면 개발자가 그것을 만든다. " +
            "`touch` 는 지난 파일 경로만 적는다(새 파일 이름을 지어내지 마라 — 주문이 새 파일을 요구할 때만). " +
            "`small`: 사람의 말이 고장 하나·작은 손질 하나면 true, 새 단계·새 화면·큰 기능이면 false.\n" +
            `지난 판의 파일: ${previous.files.map((f) => f.path).join(", ") || "(없음)"}`
          : "\n\n처음 만드는 판이다: `small` 은 false, `touch` 는 빈 배열."),
      schema: plan,
      schemaName: "app_plan",
      // 고치는 판은 지난 기준(29개)을 다 되쓰고 새 것을 더한다 — 6000 에서 잘려
      // 21:40 캐릭터 판이 설계 단계에서 죽었다(MODEL_OUTPUT_TRUNCATED). gpt-5 는 추론
      // 토큰도 여기서 센다.
      // 16000 도 잘렸다(09-06 10:47, 기준 52개 판). 추론 모델은 생각에 먼저 쓴다.
      // 59회차 자가진단: 계획 단계에서도 MODEL_OUTPUT_TRUNCATED 가 7일에 5번 났다.
      // 나는 생성 쪽만 올렸었다 — 자가 세어 주니 보였다.
      // 65회차 09-09: 60000 은 **잘릴 때 너무 비싸다.** 실측 — 폭주한 계획 하나가 60,000 을 다 쓰고
      // 잘려 $0.61 을 태웠고, 다시 돌린 정상 계획은 **4,602 토큰**($0.05)이었다.
      // 계획은 설계도지 코드가 아니다. 5천이면 충분하고 1만6천을 넘기면 그건 폭주다 — 싸게 실패하고 다시 한다.
      maxTokens: 16000,
      tier: "judgment",
    })).output);

    // 고치는 판: 지난 기준은 코드가 그대로 붙인다. 모델이 29개를 되쓰다 두 번 잘렸다
    // (21:40·22:48, MODEL_OUTPUT_TRUNCATED). 모델은 새 기준만 쓰고, 합치는 것은 여기서.
    if (previous && previous.criteria.length) {
      const seen = new Set(previous.criteria.map((c) => c.id));
      let added = spec.criteria.filter((c) => !seen.has(c.id));
      // 165회차: 작은 고침에 새 기준이 셋을 넘으면 자른다 — 말로만 부탁하면 안 지켜진다(14 → 23 → 26 이 그 증거다).
      if (spec.small && added.length > 3) {
        console.log(`[계획] 작은 고침인데 새 기준 ${added.length}개 → 3개로 자른다`);
        added = added.slice(0, 3);
      }
      spec.criteria = [...previous.criteria, ...added];
    }
    // 165회차: 웹(HTML) 판에 유니티 자의 기대치가 붙어 계획 카드가 "점수 HUD는 카메라 HUD 계층에… 유니티가 재요" 라고 했다.
    // 웹 판은 유니티가 재지 않는다 — 못 재는 기대치는 싣지 않는다.
    // 174회차: **사장님이 폰·태블릿에서 시켰으면 유니티 판을 내지 않는다.** 아이패드에서 "터치로 하는 간단한 게임" 을 시켰더니
    // 유니티 프로젝트(C# 6개)가 나왔고 아이패드에선 열 수도 없었다("아이패드라서 그런가? 안돼"). 주문에 유니티라고 명시했을 때만 예외.
    const firstDeviceLine = deviceNote.split(String.fromCharCode(10))[3] ?? "";
    if (spec.target === "unity" && /태블릿|폰/.test(firstDeviceLine) && !/유니티|unity/i.test(`${ctx.context.assignment.title} ${ctx.context.assignment.description ?? ""}`)) {
      console.log("[계획] 사장님 기기가 폰·태블릿이라 유니티 판 대신 웹(HTML) 판으로 바꾼다");
      spec.target = "web";
    }
    if (spec.target === "web" && spec.expectations.length) {
      console.log(`[계획] 웹 판이라 유니티 기대치 ${spec.expectations.length}개를 뺀다`);
      spec.expectations = [];
    }
    // 기대치도 같다(33회차): 이번 판이 같은 이름을 다시 적으면 이번 것이 이기고, 안 적은 지난 기대치는 그대로 남는다 —
    // 안 그러면 카메라를 고치는 재시도 판에서 레벨 기대치(크기·랜드마크)가 사라져 퇴보를 못 본다.
    // 119회차: 계획이 폭 0인 기대치를 쓰면 그 판은 어떤 값으로도 통과 못 한다 — 얼리기 전에 잴 수 있게 벌린다.
    {
      let widenedCount = 0;
      spec.expectations = spec.expectations.map((e) => {
        const { fixed, widened } = widenExpectation(e as Expectation);
        if (widened) widenedCount++;
        return fixed as typeof e;
      });
      if (widenedCount) console.log(`[계획] 폭 0인 기대치 ${widenedCount}개를 잴 수 있게 벌렸다`);
    }
    if (previous && previous.expectations.length && spec.target !== "web") {
      const named = new Set(spec.expectations.map((e) => e.measure as string));
      const kept = previous.expectations.filter((e) => !named.has(e.measure)) as typeof spec.expectations;
      spec.expectations = [...spec.expectations, ...kept];
    }

    // 184회차: 고치는 판이면 여기서 자리를 미리 고른다 — 계획 카드(오른쪽 칸)에 "왜 이 AI인가" 가 실리게.
    if (previous && previous.files.length > 0) { try { await pickedFixSeat(ctx); } catch { /* 자리는 고칠 때 다시 고른다 */ } }

    // ── 되묻기(35회차): 코드를 쓰기 전에 계획을 보이고 멈춘다 ──
    // 사장님이 '시작' 하면 approved 가 붙어 다시 돌고(계획은 저장된 값), 고칠 말을 하면 계획을 다시 쓴다.
    // 스스로 다시(autoRetry) 판은 이미 승인된 계획의 떨어진 줄을 고치는 것이라 묻지 않는다.
    {
      const ri = (ctx.context.roleInput as { approved?: boolean; autoRetry?: number; approvalRound?: number } | null) ?? {};
      // 165회차: 작은 고침은 묻지 않는다 — 고쳐 달라는 말이 이미 지시다(`small` 설명 참고). 큰 일은 그대로 묻는다.
      const smallFix = !!previous && previous.files.length > 0 && spec.small === true;
      if (smallFix) console.log("[계획] 작은 고침 — 계획 확인을 건너뛰고 바로 고친다");
      // 176회차 09-18, 사장님: "승인을 어느 정도 자동화하고 빼도 된다." 웹 판은 만드는 값이 $0.01·30초라 기다리는 값이 더 크다 —
      // 카드는 알림으로만 띄우고 바로 만든다. 유니티 판(몇 분·사장님 PC 에서 열어야 함)만 여전히 '시작' 을 묻는다. `APPROVAL_GATE=always` 로 되돌린다.
      const gate = process.env.APPROVAL_GATE ?? "unity";
      const needsGate = gate === "always" || (gate === "unity" && spec.target === "unity");
      if (!ri.approved && !ri.autoRetry && !smallFix && !needsGate) {
        console.log("[계획] 웹 판 — '시작' 을 기다리지 않고 바로 만든다(카드는 알림)");
        const fmt = (e: { measure: string; min: number | null; max: number | null; equals: boolean | null; why: string }) => {
          const range = typeof e.equals === "boolean" ? (e.equals ? "예" : "아니오") : `${e.min ?? ""}~${e.max ?? ""}`;
          return `${e.why} — ${e.measure} ${range}`;
        };
        const { showPlan } = await import("@/lib/execution/approval");
        await showPlan(ctx.supabase, { assignmentId: ctx.execution.assignment_id, who: "Dev", card: { title: spec.title, lines: [...spec.expectations.map(fmt), `확인할 것 ${spec.criteria.length}가지` + (spec.humanGate?.length ? ` · 직접 보실 것 ${spec.humanGate.length}가지` : "")], estimate: roundsFor(`${ctx.context.assignment.title}
${ctx.context.assignment.description ?? ""}`) > 0 ? `약 $0.02 · 2~4분 (만든 뒤 브라우저에서 ${roundsFor(`${ctx.context.assignment.title}
${ctx.context.assignment.description ?? ""}`)}번까지 돌려 보고 고쳐요)` : "약 $0.01 · 30초~1분" } });
      }
      if (!ri.approved && !ri.autoRetry && !smallFix && needsGate) {
        const fmt = (e: { measure: string; min: number | null; max: number | null; equals: boolean | null; why: string }) => {
          const range = typeof e.equals === "boolean" ? (e.equals ? "예" : "아니오") : `${e.min ?? ""}~${e.max ?? ""}`;
          return `${e.why} — ${e.measure} ${range}`;
        };
        const lines = [
          ...spec.expectations.map(fmt),
          `확인할 것 ${spec.criteria.length}가지` + (spec.humanGate?.length ? ` · 직접 보실 것 ${spec.humanGate.length}가지` : ""),
        ];
        await askApproval(ctx.supabase, {
          assignmentId: ctx.execution.assignment_id,
          executionId: ctx.executionId,
          who: "Dev",
          card: { title: spec.title, lines, estimate: "약 $0.2 · 5분 (그 뒤 사장님 컴퓨터의 유니티에서 확인 2~3분)" },
          round: ri.approvalRound ?? 0,
        });
      }
    }

    if (spec.criteria.length < MIN_CRITERIA) {
      throw new ExecutionError(
        "UNKNOWN_ERROR",
        `확인 가능한 기준이 ${spec.criteria.length}개뿐이다(${MIN_CRITERIA} 필요). ` +
          "업무 설명이 무엇을 만들지 정하기에 모자라다.",
      );
    }

    // ── 2. 그 기준을 놓고 만든다 ────────────────────────────────────
    await setStep(ctx.supabase, ctx.executionId, "generating");

    const unity = spec.target === "unity";
    // 165회차: **고치는 판은 조각만 받는다**(patch.ts). 두 줄 고장에 858줄을 새로 쓰던 자리. 조각이 두 번 안 붙으면
    // 옛 방식(아래)으로 물러나고, 그랬다는 것을 산출물에 적는다.
    let patchNote = "";
    const askText = `${ctx.context.assignment.title}\n${ctx.context.assignment.description ?? ""}`;
    /** 조각으로 고쳐 본다. 처음 판이거나 조각이 두 번 안 붙으면 null. `extra` 는 심판자가 되돌리며 준 말. */
    const tryPatch = async (extra: string) => {
      if (previous && previous.files.length > 0) {
        const touch = new Set(spec.touch ?? []);
        const full = touch.size === 0 ? previous.files : previous.files.filter((f) => touch.has(f.path));
        const rest = previous.files.filter((f) => !full.includes(f));
        const p = await buildPatch(await fixSeat(ctx), {
          title: spec.title,
          ask: askText + deviceNote + extra,
          criteria: spec.criteria,
          failedChecks: previous.failedChecks,
          full: full.length ? full : previous.files,
          rest: full.length ? rest : [],
          unityRules: unity ? (await unityRules()) + (await renderGamedevLessons("unity_code")) : "",
        });
        if (p.ok) {
          const before = new Map(previous.files.map((f) => [f.path, f.contents]));
          const changed = p.files.filter((f) => before.get(f.path) !== f.contents);
          console.log(`[app_build] 조각 고침: 조각 ${p.patch.edits.length}개 · 바뀐 줄 ${p.changedLines}/${p.totalLines} · 새 파일 ${p.patch.newFiles.length}개 · 물은 횟수 ${p.asked}`);
          return { files: changed, keep: null, howToRun: p.patch.howToRun, coverage: p.patch.coverage, patched: { edits: p.patch.edits.map((e) => ({ path: e.path, why: e.why })), changedLines: p.changedLines, totalLines: p.totalLines, asked: p.asked } };
        }
        console.warn(`[app_build] 조각이 두 번 안 붙었다:`, p.failures.map((f) => `${f.path}:${f.reason}`).join(", "));
      }
      return null;
    };
    type Made = { files: { path: string; language: string; contents: string }[]; howToRun: string; coverage: { criterionId: string; met: boolean; where: string }[]; patched?: { edits: { path: string; why: string }[]; changedLines: number; totalLines: number; asked: number } };
    let made: Made = await step(ctx.supabase, ctx.executionId, "build", async () => (await tryPatch("")) ?? (await buildWhole()));

    // ── 2.5 부탁 심판자(166회차): 시킨 것을, 시킨 만큼 했는가 ─────────────
    // 고치는 판만 본다. 기계가 바뀐 것을 세고(changeFacts) AI 가 판정한다 — 직원의 자기 보고(coverage)는 안 준다(그날 그 판은 26/26 이었다).
    // **문이 아니다**: 되돌리는 것은 한 번뿐이고, 그 뒤엔 무엇이 나오든 심판자의 한 줄을 맨 위에 달아 내보낸다. 받는 쪽은 둘이다 —
    // 직원(한 번 다시)과 사장님(맨 위 한 줄). 심판자가 죽으면 하던 대로 간다.
    let judged: AskVerdict | null = null;
    let sentBack = false;
    if (previous && previous.files.length > 0) {
      const prevFiles = previous.files;
      const merged = (m: Made) => { const out = new Set(m.files.map((f) => f.path)); return [...m.files, ...prevFiles.filter((f) => !out.has(f.path))]; };
      const look = (name: string, m: Made) => step(ctx.supabase, ctx.executionId, name, async () => {
        try { return (await judgeAsk(ctx.providers.ai, { said: askText, previousTitle: previous.title, facts: changeFacts(prevFiles, merged(m)), howToRun: m.howToRun })).verdict; }
        catch (e) { console.warn("[부탁 심판자] 못 봤다:", e instanceof Error ? e.message : e); return null; }
      });
      judged = await look("ask_judge", made);
      if (judged) console.log(`[부탁 심판자] ${judged.verdict} · ${judged.sizeMatch} · ${judged.fixedTheThing} — ${judged.toPerson}`);
      if (judged?.verdict === "되돌린다" && judged.toWorker.trim()) {
        const back = judged;
        const again = await step(ctx.supabase, ctx.executionId, "build_again", () => tryPatch(
          `\n\n## 심판자가 방금 판을 되돌렸다 — 이번엔 이것만 한다\n${back.toWorker}\n(방금 판에서 부탁받지 않고 만든 것: ${back.uninvited.join(" / ") || "없음"})`));
        if (again) { made = again; sentBack = true; judged = (await look("ask_judge_2", made)) ?? back; }
      }
    }

    const patched = made.patched ?? null;
    if (previous && previous.files.length > 0) {
      patchNote = patched
        ? `**고친 곳 ${patched.edits.length}군데 (전체 ${patched.totalLines}줄 중 ${patched.changedLines}줄)** — 나머지는 이전 그대로예요.\n` +
          patched.edits.map((e) => `- \`${e.path}\`: ${e.why}`).join("\n") + "\n\n"
        : "**이번엔 부분만 고치지 못해서 파일을 다시 썼어요** — 이전에 잘 되던 곳이 바뀌었을 수 있어요.\n\n";
      // 심판자의 한 줄은 맨 위다. 딱지(통과/실패)가 아니라 말이다 — 읽고 사장님이 정한다.
      if (judged) {
        patchNote =
          `**검토**${sentBack ? "(한 번 되돌려 다시 고침)" : ""}: ${judged.toPerson}` +
          (judged.verdict === "되돌린다" ? " — **검토 결과 이번 것도 부탁과 다르다고 봐요.**" : "") +
          (judged.uninvited.length ? `\n부탁하지 않으셨는데 들어간 것: ${judged.uninvited.slice(0, 5).join(" / ")}` : "") +
          "\n\n" + patchNote;
      }
    }

    // 유니티 판(C#·씬 빌더)에서의 luna 는 아직 안 재 봤다 — 웹 판만 새 자리로, 유니티는 하던 자리로.
    async function buildWhole() { return (await (unity ? ctx.providers.ai : await buildSeat(ctx)).generateStructuredOutput({
      systemInstructions: WHOLE_BUILD_SYSTEM + (unity ? (await unityRules()) + (await renderGamedevLessons("unity_code")) : ""),
      input: wholeBuildInput(spec, deviceNote, previous),
      schema: build,
      schemaName: "app_build",
      // 59회차 09-08: 32000 에서 잘렸다(MODEL_OUTPUT_TRUNCATED). 씬 빌더 한 파일이 74 KB(≈2만 토큰)라
      // 그 파일 하나만 고쳐도 예산을 넘는다. **이건 예산이 작아서가 아니라 파일이 커서 나는 일이다** —
      // 올려서 막지만, 진짜 고침은 그 파일을 쪼개는 것이다(다음 판).
      maxTokens: 100000,
      tier: "judgment",
    })).output; }

    // ── 3. 문법이 깨졌으면 고친다 ───────────────────────────────────
    //
    // 돌려 보지는 않는다(그 이유는 verify.ts 에 있다). 다만 **파싱조차 안 되는
    // 코드**는 확실히 잡을 수 있고, 그건 가장 흔하면서 사람이 붙여 넣기 전까지
    // 아무도 모르는 실패다. 한 번은 고쳐 보고, 그래도 깨져 있으면 깨진 채로
    // 넘기되 **깨졌다고 적는다** — 고친 척하는 것이 더 나쁘다.
    await setStep(ctx.supabase, ctx.executionId, "verifying");

    // 09-09: 구조가 실제로 먹었는지 **센다.** 말로 부탁하던 시절엔 73판 중 68판이 어겼다.
    if (previous) {
      const declared = new Set(spec.touch ?? []);
      const extra = made.files.filter((f) => declared.size > 0 && !declared.has(f.path)).map((f) => f.path);
      const kb = Math.round(made.files.reduce((n, f) => n + f.contents.length, 0) / 1024);
      console.log(`[app_build] 손댈 파일 ${declared.size}개 선언 → 실제로 낸 것 ${made.files.length}개 (${kb} KB)` +
        (extra.length ? ` · 선언 밖 ${extra.length}개: ${extra.join(", ")}` : " · 선언대로"));
    }
    let files = made.files;
    // 고치는 판: keep 에 적힌(또는 아예 안 낸) 지난 파일을 이어 붙인다. 새로 낸 경로가
    // 이기고, 나머지 지난 파일은 그대로 남는다 — 빠뜨려서 게임이 반쪽이 되는 것보다 낫다.
    if (previous) {
      const outPaths = new Set(files.map((f) => f.path));
      const carried = previous.files.filter((f) => !outPaths.has(f.path));
      files = [...files, ...carried];
      if (carried.length) console.log(`[app_build] 지난 파일 ${carried.length}개 이어 붙임:`, carried.map((f) => f.path).join(", "));
    }
    // 기계 교정. 말로 세 번 실패한 것은 코드가 고친다(09-06 14:23): 캐릭터 폴더 필터에
    // 슬래시를 붙인 `Contains("/고양이/")` 는 폴더 이름이 '의인화_고양이_…' 라 절대 안 맞는다.
    const slashFilter = /Contains\("\/([^\/"]+)\/"\)/g;
    let autoFixed = 0;
    files = files.map((f) => {
      if (!f.path.endsWith(".cs")) return f;
      const fixed = f.contents.replace(slashFilter, (_m, word: string) => { autoFixed++; return `Contains("${word}")`; });
      return fixed === f.contents ? f : { ...f, contents: fixed };
    });
    if (autoFixed) console.log(`[app_build] 슬래시 필터 ${autoFixed}곳 교정`);
    let checks = checkFiles(files);
    let repaired = false;

    if (checks.some((c) => c.checked && !c.ok)) {
      const { output: fixed } = await ctx.providers.ai.generateStructuredOutput({
        systemInstructions: [
          "아래 파일들이 문법 오류로 파싱되지 않는다. **고쳐서 전체를 다시 낸다.**",
          "",
          "- 오류가 난 파일만이 아니라 **전부** 다시 낸다. 일부만 오면 받는 쪽이 어느 것이 새 것인지 모른다.",
          "- 기능을 바꾸지 마라. 고치는 것은 문법뿐이다.",
          "- `coverage` 는 고친 뒤 기준으로 다시 판단해서 낸다.",
        ].join("\n"),
        input: [
          "오류:",
          repairBrief(checks),
          "",
          "기준:",
          spec.criteria.map((c) => `- [${c.id}] ${c.when} → ${c.then}`).join("\n"),
          "",
          "지금 파일:",
          files.map((f) => `--- ${f.path} (${f.language})\n${f.contents}`).join("\n\n"),
        ].join("\n"),
        schema: build,
        schemaName: "app_repair",
        maxTokens: 32000,
        tier: "judgment",
      });
      files = fixed.files;
      made.coverage = fixed.coverage;
      made.howToRun = fixed.howToRun;
      checks = checkFiles(files);
      repaired = true;
    }

    const verify = summarise(checks);

    // ── 3.5 돌려 보고 고치는 고리 (179회차 09-18) — 웹 판만 ─────────────────
    // 사장님: "지피티는 발로란트 만들어줘 하면 1시간 동안 만들더라." 그건 긴 답이 아니라 만들기→돌려 보기→고치기를 수십 바퀴 도는 것이다.
    // 헤드리스 브라우저의 빈 창에서 실제로 돌려 보고(run.ts), 심판자가 확인 목록에 대 보고, 조각으로 고치기를 예산 안에서 반복한다(loop.ts).
    // 제일 좋은 판을 내보낸다. 바퀴 수는 주문("고퀄")과 `BUILD_LOOP_ROUNDS`, 돈 상한은 `BUILD_LOOP_USD`(기본 $0.5). `BUILD_LOOP=0` 이면 안 돈다.
    let loop: LoopResult | null = null;
    // 187회차: 바퀴 수는 머리(decision.effort)가 정한다 — 사장님 "루프를 몇 번 할지 판별하는 AI가 없어서 그런가?"
    const effortOfHead = await (async () => {
      try {
        const { data } = await ctx.supabase.from("work_executions").select("effort:metrics_json->decision->>effort").eq("id", ctx.executionId).maybeSingle();
        return (data as { effort?: string | null } | null)?.effort ?? null;
      } catch { return null; }
    })();
    const loopRounds = roundsFor(askText, effortOfHead);
    if (effortOfHead) console.log(`[머리] 바퀴: ${effortOfHead} → ${loopRounds}바퀴`);
    if (!unity && process.env.BUILD_LOOP !== "0" && loopRounds > 0) {
      await setStep(ctx.supabase, ctx.executionId, "looping");
      const mobile = /태블릿|폰/.test(deviceNote.split(String.fromCharCode(10))[3] ?? "");
      const startFiles = files;
      loop = await step(ctx.supabase, ctx.executionId, "loop", async () => {
        const r = await improveLoop({
          db: ctx.supabase, executionId: ctx.executionId, judgeAi: await loopJudgeSeat(ctx), fixAi: await fixSeat(ctx),
          title: spec.title, ask: askText, criteria: spec.criteria, files: startFiles, mobile,
          rounds: loopRounds, usdCap: Number(process.env.BUILD_LOOP_USD ?? "0.5") || 0.5, thorough: isThorough(askText) || effortOfHead === "꼼꼼히",
          onRound: async (rec, total) => {
            // 화면의 "N바퀴째 · 확인 목록 x/y". 단계 저장과 같은 칸(metrics_json)에 읽고-합쳐-쓴다.
            const { data: cur } = await ctx.supabase.from("work_executions").select("metrics_json").eq("id", ctx.executionId).maybeSingle();
            const m = ((cur?.metrics_json as Record<string, unknown> | null) ?? {});
            await ctx.supabase.from("work_executions").update({ metrics_json: { ...m, loop: { round: rec.n, met: rec.met, total } }, updated_at: new Date().toISOString() }).eq("id", ctx.executionId);
          },
        });
        // 그림(base64)은 저장하지 않는다 — 행이 뚱뚱해지면 DB 가 멈춘다(09-06).
        if (r.facts) r.facts = { ...r.facts, shots: { start: "", mid: "", after: "" } };
        return r;
      });
      if (loop.rounds.length) {
        files = loop.files;
        checks = checkFiles(files);
        console.log(`[app_build] 고리 ${loop.rounds.length}바퀴 · 제일 좋은 판 ${loop.bestRound}바퀴째 · 멈춘 이유 ${loop.stoppedBy} · $${loop.usd.toFixed(3)}`);
      }
    }

    // ── 4. 기준과 함께 넘긴다 ───────────────────────────────────────
    // 고리가 돌았으면 "됨" 은 심판자가 실제로 돌려 보고 센 것이고, 아니면 직원의 자기 보고(coverage)다 — 둘을 섞지 않는다.
    const judgeMet = loop?.verdict ? new Set(loop.verdict.met) : null;
    const judgeUnmet = loop?.verdict ? new Map(loop.verdict.unmet.map((u) => [u.id, u.why])) : null;
    const met = judgeMet ? judgeMet.size : made.coverage.filter((c) => c.met).length;

    const note =
      // 175회차: 사장님 "말투 좀 바꿔야 돼" — 파서·임의 코드 실행·열쇠 이야기는 사람이 읽을 말이 아니다.
      `코드 문법만 확인했어요(${verify.parsed}개 확인, ${verify.broken}개 문제${verify.unchecked ? `, ${verify.unchecked}개는 확인 못 함` : ""})` +
      (repaired ? " · 한 번 고쳤어요" : "") +
      (loop?.rounds.length
        ? (loop.rounds.reduce((n, r) => n + r.edits, 0)
          ? `. 브라우저에서 실제로 ${loop.rounds.length}번 돌려 보고 ${loop.rounds.reduce((n, r) => n + r.edits, 0)}군데 고쳤어요(제일 잘 된 ${loop.bestRound}번째 판이에요).`
          : `. 브라우저에서 실제로 ${loop.rounds.length}번 돌려 보고 확인했어요 — 고칠 게 안 나왔어요.`)
        : ". 서버에서 실제로 실행해 보지는 않아요 — 위 '확인한 것' 목록을 보고 직접 열어서 해 보세요.");

    const content = {
      target: spec.target,
      stage: spec.stage ?? "prototype",
      expectations: spec.expectations ?? [],
      criteria: spec.criteria,
      humanGate: spec.humanGate,
      files,
      howToRun: made.howToRun,
      coverage: made.coverage,
      // 파싱 결과를 그대로 싣는다. **미검사를 통과에 섞지 않는다** —
      // 파서가 없는 언어를 "괜찮다"로 세면 검사가 있으나 마나가 된다.
      verify: { ...verify, repaired, files: checks },
      // 165회차: 고치는 판이 조각으로 고쳤는가, 몇 줄 바꿨는가. null 이면 처음 판이거나 전체 쓰기로 물러난 판.
      patched,
      // 166회차: 부탁 심판자의 판정(고치는 판만). 사장님 판정과 나란히 놓고 맞는지 세려면 남겨야 한다.
      askJudge: judged ? { ...judged, sentBack } : null,
      // 183회차: 어느 자리가 고쳤는가 — 섞어 보내기의 성적표는 이 칸에서 센다(seats.ts). 처음 판이면 fix 는 null.
      seats: { fix: previous && previous.files.length > 0 ? (fixPicks.get(ctx)?.model ?? null) : null, fixWhy: fixPicks.get(ctx)?.why ?? null, build: unity ? ctx.providers.ai.model : (process.env.BUILD_SEAT_MODEL ?? "gpt-5.6-luna"), judge: process.env.LOOP_JUDGE_MODEL ?? "gpt-5.6-luna" },
      // 179회차: 돌려 보고 고친 고리의 기록 — 바퀴마다 맞음/안 맞음/고장/오류/돈. 이것으로 "몇 바퀴가 값어치 있나" 를 잰다.
      loop: loop ? { rounds: loop.rounds, bestRound: loop.bestRound, stoppedBy: loop.stoppedBy, usd: loop.usd, verdict: loop.verdict, facts: loop.facts } : null,
      summary: { criteria: spec.criteria.length, met },
      note,
    };

    // **읽을 수 있는 본문을 같이 만든다.** 결과가 돌아오는 자리는 대화 한 칸
    // (09-05, 업무 화면은 없다)이라, JSON 만 저장하면 사람은 아무것도 못 본다.
    // 파일은 코드 블록으로 통째로 싣는다 — HTML 한 파일이면 그대로 저장해 열면 된다.
    const markdown =
      patchNote +
      `## 실행 방법\n\n${made.howToRun.trim()}\n\n` +
      (loop?.rounds.length
        ? `## 돌려 본 결과\n\n${loop.verdict?.toPerson ?? ""}\n\n` +
          loop.rounds.map((r) => `- ${r.n}바퀴: 맞음 ${r.met}/${spec.criteria.length} · 안 맞음 ${r.unmet} · 오류 ${r.errors}${r.best ? " ★" : ""}${r.edits ? ` → ${r.edits}군데 고침` : ""}`).join("\n") +
          (loop.facts ? `\n\n${factLines(loop.facts).map((l) => `- ${l}`).join("\n")}` : "") + "\n\n"
        : "") +
      `## 확인한 것 (${spec.criteria.length}가지 중 ${met}가지 ${judgeMet ? "됨 — 실제로 돌려 보고 확인" : "됨"})\n\n` +
      spec.criteria
        .map((c) => {
          const cov = made.coverage.find((x) => x.criterionId === c.id);
          const mark = judgeMet ? (judgeMet.has(c.id) ? "✅" : judgeUnmet?.has(c.id) ? "❌" : "❔") : cov?.met ? "✅" : "❌";
          const why = judgeUnmet?.get(c.id);
          return `- ${mark} **${c.when}** → ${c.then}` + (why ? ` _(${why})_` : cov?.where && !judgeMet ? ` _(${cov.where})_` : "");
        })
        .join("\n") +
      (spec.humanGate.length
        ? `\n\n## 직접 보셔야 하는 것\n\n${spec.humanGate.map((h) => `- ${h}`).join("\n")}`
        : "") +
      // 188회차 09-19 사장님 "프로토타입을 뽑을수록 채팅이 느려진다": 결과 턴마다 파일 **전문**(30KB+)이 본문에 또 실려
      // 대화 하나가 19.6MB 까지 갔다(455턴). 파일은 붙임(files)과 미리보기로 열린다 — 본문엔 목록만.
      `\n\n## 파일 ${files.length}개\n\n` +
      files.map((f) => `- \`${f.path}\` (${f.language}, ${f.contents.split("\n").length}줄) — 아래 열기 · 저장, 또는 오른쪽 미리보기`).join("\n") +
      `\n\n---\n\n${note}`;

    // 다른 직원들과 같은 문으로 넘긴다. 처음(08-28)에는 표에 없는 열(type·content)
    // 로 직접 insert 했고, 그래서 Dev 는 09-05 까지 산출물을 **한 번도** 저장하지
    // 못했다. 이 RPC 가 실행을 completed, 업무를 submitted 로 같이 옮긴다.
    const { data: saved, error: saveError } = await ctx.supabase.rpc(
      "submit_generated_deliverable",
      {
        p_execution_id: ctx.executionId,
        p_title: spec.title,
        p_deliverable_type: "app_build",
        p_content_markdown: markdown,
        p_content_json: content,
        p_generation_model: ctx.providers.ai.model,
        p_citations: [],
      },
    );
    if (saveError) {
      throw new ExecutionError("DELIVERABLE_SAVE_FAILED", saveError.message);
    }
    const rpc = saved as { ok: boolean; reason?: string; deliverableId?: string };
    if (!rpc.ok && !(rpc.reason === "already_submitted" && rpc.deliverableId)) {
      throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason ?? "unknown");
    }
    const deliverable = { id: rpc.deliverableId as string };

    return {
      deliverableId: deliverable.id as string,
      deliverableType: "app_build",
      metrics: { candidateCount: spec.criteria.length, selectedCount: met },
    };
  },
};
