import { z } from "zod";
import type { Supabase } from "@/lib/execution/shared";
import type { Providers } from "@/lib/execution/shared";
import { insideScope } from "@/lib/unity/progress";
import { retrieveCompanyKnowledge, renderCompanyKnowledge } from "@/lib/knowledge/retrieval";

/**
 * 유니티 일을 **설계**한다 — 어떤 파일을 만들 것인지 목록까지.
 *
 * 이 단계가 따로 있는 이유는 두 가지다. 하나는 시간 — 한 번의 요청에 게임
 * 전체를 내라고 하면 몇 분을 넘겨 중간의 프록시가 끊는다. 다른 하나는 자리 —
 * 대화창에서도, 유니티 심부름꾼에서도 같은 설계가 나와야 한다. 두 곳에 같은
 * 코드를 두면 한쪽만 고치는 날이 오고, 그러면 창구마다 다른 회사가 된다.
 */

export const MAX_PLANNED_FILES = 12;

export type Planned = { path: string; purpose: string; written: boolean };

export type UnityPlan = {
  sessionId: string;
  /** 이 세션이 쓴 울타리. 부른 쪽이 되짚어 추측하지 않게 그대로 돌려준다. */
  scope: string;
  title: string;
  criteria: { when: string; then: string }[];
  /** 반쪽만 쓰여 버린 기준의 수. 조용히 버리지 않는다. */
  droppedCriteria: number;
  setup: string;
  humanGate: string[];
  sceneMethod: string | null;
  planned: Planned[];
  /** 울타리 밖이라 뺀 것. 조용히 버리지 않는다. */
  refused: string[];
  note: string;
};

const planSchema = z.object({
  title: z.string(),
  /**
   * 합격 기준. **칸이 둘뿐이다.**
   *
   * 전에는 `id` 칸이 있었는데, 모델이 거기에 기준의 내용을 통째로 적고 `then`
   * 을 빈 채로 두었다 — 여덟 개 전부. 그러면 "무엇을 하면"만 있고 "무엇이
   * 되어야 하는가"가 없어서, 사람이 볼 것이 없는 기준이 된다. 쓸 자리가 있으면
   * 쓰게 되므로, 그 자리를 없앴다.
   */
  criteria: z.array(
    z.object({
      when: z.string().describe("사람이 하는 행동. 예: 스페이스를 6번 누른다"),
      then: z.string().describe("그때 무엇이 되어야 하는가. 비우지 마라"),
    }),
  ),
  files: z.array(z.object({ path: z.string(), purpose: z.string() })),
  sceneMethod: z.string().nullable(),
  setup: z.string(),
  humanGate: z.array(z.string()),
  note: z.string(),
});

export const UNITY_RULES = [
  "너는 유니티 C# 스크립트를 쓴다. 유니티가 네 코드를 몇 초 뒤에 컴파일하고,",
  "오류는 그대로 너에게 돌아온다.",
  "",
  "- 파일은 **전체를 낸다.** 생략 표시로 줄이면 붙일 수가 없다.",
  "- 클래스 이름과 파일 이름을 맞춘다 — 어긋나면 컴포넌트를 못 붙인다.",
  "- 없는 패키지에 의존하지 마라. 기본 유니티로 되는 범위에서 쓴다.",
  "- 잴 수 없는 것(재미, 손맛)은 기준인 척하지 마라.",
  "",
  "**사람은 에디터를 열지 않는다.** 씬에 물체를 끌어다 놓아 줄 사람이 없으니,",
  "씬도 코드가 지어야 한다. 씬을 만들어 저장하는 에디터 정적 메서드를 하나 쓰고",
  "(에디터 전용이라 Editor/ 폴더 아래에 둔다) 그 온전한 이름을 sceneMethod 에",
  "적어라. 그 메서드는:",
  "- 씬을 새로 만들고 필요한 GameObject 와 컴포넌트를 코드로 붙인다,",
  "- 그림 파일이 없으면 코드로 만든 Texture2D 로 때운다 — 없는 파일을 참조하면",
  "  씬은 만들어져도 화면이 비어 있고, 그건 컴파일로는 안 잡힌다,",
  "- 카메라와 조명도 직접 만든다. 빈 씬에는 아무것도 없다,",
  "- 씬을 저장하고 EditorBuildSettings.scenes 에 넣는다,",
  "- **두 번 불려도 같은 결과**여야 한다. 부를 때마다 물체가 쌓이면, 두 번째",
  "  판부터 씬이 조용히 망가진다.",
].join("\n");

export async function planUnitySession(args: {
  db: Supabase;
  providers: Providers;
  companyId: string;
  want: string;
  scope?: string;
  unityVersion?: string;
  /** 프로젝트에 이미 있는 관련 파일. 없으면 생략된다. */
  project?: { path: string; contents: string }[];
}): Promise<UnityPlan | { error: string }> {
  const scope =
    args.scope && args.scope.startsWith("Assets/")
      ? args.scope.endsWith("/")
        ? args.scope
        : args.scope + "/"
      : "Assets/Rookery/";

  const knowledge = renderCompanyKnowledge(
    await retrieveCompanyKnowledge(args.db, args.companyId),
  );

  const { output } = await args.providers.ai.generateStructuredOutput({
    systemInstructions: [
      UNITY_RULES,
      "",
      "지금은 **설계하는 판**이다. 코드는 아직 쓰지 마라 — 어떤 파일을 만들",
      "것인지 경로와 한 줄 설명만 낸다. 내용은 다음 판에 나눠 받는다.",
      "",
      "**먼저 합격 기준을 쓴다.** 씬에서 무엇을 하면 무엇이 되어야 하는지,",
      "사람이 눌러 보고 확인할 수 있는 문장으로. 컴파일 여부는 기준이 아니다.",
      "",
      `파일은 ${MAX_PLANNED_FILES}개를 넘지 않게, 반드시 ${scope} 아래에 둔다.`,
      args.unityVersion ? `\n대상 유니티 버전: ${args.unityVersion}` : "",
      knowledge ? "\n이 회사가 아는 것:\n" + knowledge : "",
    ].join("\n"),
    input:
      "만들 것: " +
      args.want +
      (args.project?.length
        ? "\n\n프로젝트에 이미 있는 관련 파일:\n" +
          args.project
            .map((f) => "--- " + f.path + "\n" + f.contents)
            .join("\n\n")
        : ""),
    schema: planSchema,
    schemaName: "unity_vibe_plan",
    // 목록만 받으므로 짧다. 여기서 크게 잡으면 끊기는 위험만 늘어난다.
    maxTokens: 6000,
    tier: "judgment",
  });

  // 반쪽짜리 기준은 버린다. "무엇이 되어야 하는가"가 없으면 사람이 볼 것이
  // 없고, 그런 줄이 목록에 있으면 **확인한 척하기가 쉬워진다** — 눈으로
  // 훑으면 기준이 여덟 개 있는 것처럼 보이기 때문이다.
  const criteria = output.criteria.filter(
    (c) => c.when.trim().length > 0 && c.then.trim().length > 0,
  );
  const droppedCriteria = output.criteria.length - criteria.length;

  const planned: Planned[] = output.files
    .filter((f) => insideScope(f.path, scope))
    .slice(0, MAX_PLANNED_FILES)
    .map((f) => ({ path: f.path, purpose: f.purpose, written: false }));
  const refused = output.files
    .filter((f) => !insideScope(f.path, scope))
    .map((f) => f.path);

  if (planned.length === 0) {
    return { error: "울타리 안에 만들 파일이 하나도 설계되지 않았습니다." };
  }

  const { data: session, error: insertError } = await args.db
    .from("unity_sessions")
    .insert({
      company_id: args.companyId,
      want: args.want,
      scope,
      criteria,
      scene_method: output.sceneMethod,
      plan: planned,
      round: 1,
      status: "running",
    })
    .select("id")
    .single();
  const sessionId = session?.id as string | undefined;
  if (!sessionId) {
    // 무엇에 막혔는지 그대로 싣는다. "열지 못했습니다"만 남으면 다음 사람이
    // 같은 자리에서 다시 처음부터 짚어야 한다 — 실제로 그렇게 한 번 잃었다.
    return {
      error:
        "세션을 열지 못했습니다" +
        (insertError?.message ? `: ${insertError.message}` : "."),
    };
  }

  await args.db.from("unity_rounds").insert({
    session_id: sessionId,
    round: 1,
    files: planned.map((f) => ({ path: f.path, purpose: f.purpose })),
    note: output.note,
  });

  return {
    sessionId,
    scope,
    title: output.title,
    criteria,
    droppedCriteria,
    setup: output.setup,
    humanGate: output.humanGate,
    sceneMethod: output.sceneMethod,
    planned,
    refused,
    note: output.note,
  };
}
