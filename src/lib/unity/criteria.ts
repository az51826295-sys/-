/**
 * 합격 기준을 **기계가 눌러 볼 수 있는 표**로 옮긴다.
 *
 * ## 왜 코드를 안 짜게 하는가
 *
 * 설계가 판마다 합격 기준을 열몇 줄 쓴다("나무를 흔들면 열매가 떨어진다").
 * 그런데 그것을 아무도 안 눌러 봤다 — 지금 도는 시험 넷은 내가 쓴 **일반**
 * 기준이고, 그 게임이 약속한 것과는 상관이 없다.
 *
 * 그렇다고 모델에게 시험 코드를 짜게 하면 안 된다. **만든 쪽이 시험지도 쓰면
 * 통과하게 쓴다** — `Assert.Pass()` 한 줄이면 열한 개가 다 통과한다. 그건
 * 판정이 아니라 판정의 흉내다.
 *
 * 그래서 이 파일은 **말할 수 있는 것을 좁힌다.** 시험기는 내가 쓴 고정
 * 코드(`unity/Tests/RookeryCriteria.cs`)이고, 모델은 그 시험기가 알아듣는
 * 낱말로 표 한 장을 채울 뿐이다:
 *
 *     기준 3 · 스페이스를 6번 누른다 · 이름에 Fruit 이 들어간 것이 늘어난다
 *
 * 모델은 "통과"라고 쓸 수 없다. 무엇을 누르고 무엇이 달라지는지만 말할 수
 * 있고, 달라졌는지 아닌지는 시험기가 본다.
 *
 * ## 못 옮기는 기준은 못 옮겼다고 한다
 *
 * "손맛이 좋다" 는 이 낱말들로 못 옮긴다. 그때는 `humanOnly` 로 표시하고
 * **못 잼**으로 센다. 억지로 옮기면 통과하기 쉬운 다른 것을 재게 되고,
 * 그러면 재는 시늉이 는다 — 이 고리가 계속 밟는 자리다.
 */
import { z } from "zod";
import type { Providers } from "@/lib/execution/shared";
import type { Dimension } from "./plan";

/** 시험기가 알아듣는 동작. 여기 없는 것은 못 시킨다. */
export const ACTIONS = ["none", "press", "hold", "wait"] as const;

/**
 * 시험기가 알아듣는 관찰.
 *
 * 전부 **씬 안에서 눈으로 확인할 수 있는 것**이다. 내부 함수를 부르거나 필드를
 * 읽는 것은 일부러 뺐다 — 그런 것을 열어 주면 모델이 자기 코드의 편한 자리를
 * 짚어서 재게 되고, 그건 "약속을 지켰는가" 가 아니라 "내가 짠 대로인가" 다.
 */
export const OBSERVES = [
  "moves",        // 그 물체가 자리를 옮긴다
  "stays",        // 그 물체가 그 자리에 있다
  "appears",      // 없던 것이 생긴다
  "disappears",   // 있던 것이 없어진다
  "countUp",      // 그 이름을 가진 것이 늘어난다
  "countDown",    // 줄어든다
  "lightChanges", // 빛의 방향이나 색이 달라진다 (낮↔밤)
] as const;

export type CriterionCheck = {
  /** 어느 기준인가. 설계가 낸 목록에서의 자리(1부터). */
  index: number;
  /** 그 기준을 그대로 옮겨 적은 것. 사람이 대조할 수 있게. */
  criterion: string;
  action: (typeof ACTIONS)[number];
  /** `press`/`hold` 일 때 누를 키. 새 입력 시스템 이름(space, e, w...). */
  key: string;
  /** `hold`/`wait` 일 때 몇 초. */
  seconds: number;
  observe: (typeof OBSERVES)[number];
  /** 무엇을 볼 것인가. 씬 안 물체 **이름의 일부**. 대소문자 무시. */
  target: string;
  /** 왜 이 표가 그 기준을 재는지 한 줄. 사람이 검산할 자리다. */
  why: string;
};

export type CriteriaPlan = {
  checks: CriterionCheck[];
  /** 기계로 못 옮긴 기준. 사람만 볼 수 있는 것. 숨기지 않는다. */
  humanOnly: { index: number; criterion: string; why: string }[];
};

const checkSchema = z.object({
  checks: z.array(
    z.object({
      index: z.number().int().describe("기준 목록에서의 자리. 1부터"),
      criterion: z.string().describe("그 기준을 그대로 옮겨 적는다"),
      action: z.enum(ACTIONS),
      key: z.string().describe("누를 키. 안 누르면 빈 문자열"),
      seconds: z.number().describe("hold/wait 의 초. 아니면 0"),
      observe: z.enum(OBSERVES),
      target: z.string().describe("씬 안 물체 이름의 일부. 예: Fruit, Player"),
      why: z.string().describe("이 표가 그 기준을 재는 이유 한 줄"),
    }),
  ),
  humanOnly: z.array(
    z.object({
      index: z.number().int(),
      criterion: z.string(),
      why: z.string().describe("왜 이 낱말들로 못 옮기는가"),
    }),
  ),
});

/**
 * 씬에 실제로 있는 것들. **이름을 짐작하지 않게** 하려고 같이 보낸다.
 *
 * 이것이 없으면 모델은 `Fruit` 이라고 썼는데 씬에는 `Apple_0` 이 있는 표를
 * 낸다. 그러면 시험이 떨어지는데 그건 게임이 틀린 것이 아니라 **표가 틀린**
 * 것이고, 둘을 구분 못 하면 판정이 무의미해진다.
 */
export type SceneShape = { names: string[]; components: string[] };

export async function planCriteriaChecks(args: {
  providers: Providers;
  criteria: { when: string; then: string }[];
  scene: SceneShape;
  dimension: Dimension;
  inputHandler: "new" | "legacy" | "both" | null;
}): Promise<CriteriaPlan> {
  const numbered = args.criteria
    .map((c, i) => `${i + 1}. ${c.when} → ${c.then}`)
    .join("\n");

  const { output } = await args.providers.ai.generateStructuredOutput({
    systemInstructions: [
      "너는 만들어진 게임이 **약속을 지켰는지** 재는 표를 만든다.",
      "",
      "**코드를 쓰지 않는다.** 시험기는 이미 있고, 너는 그 시험기가 알아듣는",
      "낱말로 표만 채운다. 통과/실패를 네가 정하지 않는다 — 무엇을 누르고",
      "무엇이 달라져야 하는지만 말하고, 달라졌는지는 시험기가 본다.",
      "",
      "쓸 수 있는 동작: " + ACTIONS.join(" · "),
      "쓸 수 있는 관찰: " + OBSERVES.join(" · "),
      "",
      "`target` 은 **아래 씬 목록에 실제로 있는 이름**에서 고른다. 없는 이름을",
      "쓰면 게임이 틀린 것이 아니라 표가 틀린 것이 되고, 그러면 이 판정은",
      "아무 뜻이 없어진다.",
      "",
      "**옮길 수 없는 기준은 `humanOnly` 에 넣는다.** 재미·손맛·분위기처럼",
      "위 낱말로 못 재는 것을 억지로 옮기면, 재기 쉬운 **다른 것**을 재게 된다.",
      "그건 못 잰 것보다 나쁘다 — 잰 것처럼 보이기 때문이다.",
      "",
      args.inputHandler === "legacy"
        ? "이 프로젝트는 옛 입력만 켜져 있어 키를 흉내 낼 수 없다. 키가 필요한 기준은 `humanOnly` 로 보낸다."
        : "키 이름은 새 입력 시스템 이름을 쓴다: space, e, w, a, s, d, escape…",
      args.dimension === "3d"
        ? "3D 다. 낮↔밤 같은 빛의 변화는 `lightChanges` 로 잰다."
        : "2D 다. `lightChanges` 는 쓸 자리가 거의 없다.",
    ].join("\n"),
    input: [
      "지켜야 할 기준:",
      numbered,
      "",
      "씬에 실제로 있는 물체 이름:",
      args.scene.names.join(", ") || "(없음)",
      "",
      "붙어 있는 컴포넌트:",
      args.scene.components.join(", ") || "(없음)",
    ].join("\n"),
    schema: checkSchema,
    schemaName: "unity_criteria_checks",
    maxTokens: 8000,
    tier: "judgment",
  });

  // 씬에 없는 이름을 겨눈 표는 **버리지 않고 사람 쪽으로 옮긴다.** 버리면
  // 기준이 조용히 사라지고, 남겨 두면 시험기가 못 찾아서 떨어뜨리는데 그건
  // 게임 탓이 아니다. 둘 다 틀렸으므로 "못 쟀다" 로 센다.
  const lower = args.scene.names.map((n) => n.toLowerCase());
  const hits = (t: string) =>
    t.trim().length > 0 && lower.some((n) => n.includes(t.trim().toLowerCase()));

  const checks: CriterionCheck[] = [];
  const humanOnly = [...output.humanOnly];
  for (const c of output.checks) {
    if (!hits(c.target)) {
      humanOnly.push({
        index: c.index,
        criterion: c.criterion,
        why: `씬에 '${c.target}' 이라는 이름이 없어 겨눌 데가 없습니다.`,
      });
      continue;
    }
    checks.push(c);
  }

  return { checks, humanOnly };
}
