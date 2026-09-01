import { z } from "zod";
import type { Supabase } from "@/lib/execution/shared";
import type { Providers } from "@/lib/execution/shared";
import { insideScope } from "@/lib/unity/progress";
import { spriteFileName, type PlannedSprite } from "@/lib/unity/sprites";
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

/**
 * 한 세션에서 만들 그림의 최대.
 *
 * 코드 파일보다 적게 잡는다. 그림은 한 장이 글 한 파일보다 느리고 비싸서,
 * 열두 장을 그리면 게임을 만드는 것이 아니라 그림을 그리다 끝난다.
 */
export const MAX_PLANNED_SPRITES = 6;

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
  /** 아티스트가 만들 그림. 없으면 빈 배열이고, 그때는 그 칸을 건너뛴다. */
  sprites: PlannedSprite[];
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
  /**
   * 만들 그림.
   *
   * 코드 파일 목록과 같은 성격이다 — 무엇을 만들지 먼저 적는다. 아티스트가
   * 한 판에 한 장씩 그리고, 그 다음에 코드가 그 경로를 참조한다.
   *
   * `purpose` 는 발주 문구가 된다. "플레이어"가 아니라 "주황 모자를 쓴 작은
   * 사람, 정면 한 포즈" 처럼 **그릴 수 있는 말**로 적어야 한다.
   */
  sprites: z
    .array(
      z.object({
        name: z.string().describe("파일 이름. 영문 소문자와 밑줄. 예: player"),
        purpose: z.string().describe("무엇을 그릴지. 그릴 수 있는 말로"),
        kind: z.enum(["character", "prop"]),
      }),
    )
    .describe("없으면 빈 배열"),
  sceneMethod: z.string().nullable(),
  setup: z.string(),
  humanGate: z.array(z.string()),
  note: z.string(),
});

/**
 * 2D 인가 3D 인가.
 *
 * 이 고리는 지금까지 2D 만 만들었고, 규칙에도 그게 박혀 있었다 — 스프라이트,
 * `Sprite.Create`, 직교 카메라. 09-01 에 사장님이 3D 로 정하셔서 자리를 연다.
 *
 * **부르는 쪽이 정한다.** 만들려는 것의 문장에서 짐작하면("점프 게임" 이면 2D?)
 * 판마다 다르게 굴고, 그러면 무엇을 재는지 알 수 없게 된다.
 */
export type Dimension = "2d" | "3d";

/**
 * 3D 에서 무엇으로 그리는가.
 *
 * **메시를 만들 수 없다.** 유니티 AI 생성기가 그 일을 하는데 지금 이 기계에서
 * 컴파일되지 않고(6.5 와 패키지 버전이 어긋난다), GPT 는 3D 모델을 못 만든다.
 * 그래서 3D 는 **기본 도형과 재질**로 짓는다. 그건 유니티에 원래 들어 있다.
 *
 * 이걸 안 적어 두면 없는 모델 파일을 참조하는 코드가 나오고, 컴파일은 통과하고
 * 화면만 빈다 — 2D 에서 그림 목록 없이 경로를 쓰던 것과 같은 자리다.
 */
const RULES_3D = [
  "",
  "**이 프로젝트는 3D 다.**",
  "- 카메라는 원근(perspective)으로 두고, **조명을 반드시 만든다.** 3D 빈 씬은",
  "  조명이 없으면 전부 검게 나온다. 이건 컴파일로 안 잡힌다,",
  "- 물체는 `GameObject.CreatePrimitive`(Cube·Sphere·Capsule·Plane·Cylinder)로",
  "  만든다. **모델 파일을 만들 수 없으니 없는 `.fbx`·`.obj` 를 참조하지 마라.**",
  "  없는 파일을 참조하면 씬은 만들어져도 화면이 비고, 그건 컴파일로 안 잡힌다,",
  "- 색과 질감은 코드로 만든 `Material` 로 준다(URP 면 `Universal Render",
  "  Pipeline/Lit`, 아니면 `Standard`). 셰이더를 못 찾으면 분홍으로 나온다,",
  "- 물리는 3D 것을 쓴다 — `Rigidbody`, `BoxCollider`, `SphereCollider`.",
  "  `Rigidbody2D`·`BoxCollider2D` 는 3D 물체에 안 붙는다,",
  "- 바닥을 만든다. 바닥이 없으면 물체가 계속 떨어진다.",
];

/** 2D 일 때만 하는 말. 그림 단계가 여기 걸려 있다. */
const RULES_2D = [
  "- **그림은 `sprites` 에 적어라.** 아티스트가 그려서 `<울타리>Sprites/<이름>.png`",
  "  에 놓는다. 씬 빌더는 그 경로를 `AssetDatabase.LoadAssetAtPath<Sprite>` 로",
  "  불러 쓴다. 사람·적·아이템처럼 **보이는 것**은 여기에 적는다,",
  "- 그림 목록에 없는 것을 참조하지 마라. 없는 파일을 참조하면 씬은 만들어져도",
  "  화면이 비어 있고, 그건 컴파일로는 안 잡힌다. 목록에 없으면 코드로 만든",
  "  `Texture2D` 로 때운다 — 그건 그림이 실패했을 때의 최후수단이지 기본이 아니다,",
];

/** 차원에 맞는 규칙. 잘라내는 것이 아니라 **조립한다** —
 *  잘라내기는 한 글자만 어긋나도 조용히 아무것도 안 지우고,
 *  그러면 3D 프롬프트에 2D 규칙이 그대로 남는다. */
export function rulesFor(dimension: Dimension = "2d"): string {
  return [
  "너는 유니티 C# 스크립트를 쓴다. 유니티가 네 코드를 몇 초 뒤에 컴파일하고,",
  "오류는 그대로 너에게 돌아온다.",
  "",
  "- 파일은 **전체를 낸다.** 생략 표시로 줄이면 붙일 수가 없다.",
  "- 클래스 이름과 파일 이름을 맞춘다 — 어긋나면 컴포넌트를 못 붙인다.",
  "- 없는 패키지에 의존하지 마라. 기본 유니티로 되는 범위에서 쓴다.",
  "- 잴 수 없는 것(재미, 손맛)은 기준인 척하지 마라.",
  "",
  "**네가 할 수 있는 것은 파일을 쓰는 것뿐이다.** 이미 있는 프로젝트의 정해진",
  "폴더 안에 `.cs` 파일을 쓰고, 유니티가 그것을 컴파일한다. 그게 전부다.",
  "그래서 다음은 **네가 못 한다:**",
  "- 새 유니티 프로젝트를 만드는 것",
  "- 렌더 파이프라인을 바꾸는 것(URP/HDRP 전환)",
  "- 패키지를 설치하거나 프로젝트 설정을 바꾸는 것",
  "- 그림·소리·폰트 파일을 어디선가 받아 오는 것",
  "",
  "이런 것이 필요하면 **하겠다고 말하지 마라.** 사람이 해야 하는 일로 `setup`",
  "에 적고, 너는 그것 없이 되는 범위에서 만든다. 못 하는 것을 하겠다고 하면",
  "사람은 그게 된 줄 알고 기다리고, 아무 일도 일어나지 않는다.",
  "",
  "**사람은 에디터를 열지 않는다.** 씬에 물체를 끌어다 놓아 줄 사람이 없으니,",
  "씬도 코드가 지어야 한다. 씬을 만들어 저장하는 에디터 정적 메서드를 하나 쓰고",
  "(에디터 전용이라 Editor/ 폴더 아래에 둔다) 그 온전한 이름을 sceneMethod 에",
  "적어라. 그 메서드는:",
  "- 씬을 새로 만들고 필요한 GameObject 와 컴포넌트를 코드로 붙인다,",
  ...(dimension === "2d" ? RULES_2D : RULES_3D),
  "- 카메라와 조명도 직접 만든다. 빈 씬에는 아무것도 없다,",
  "- 씬을 저장하고 EditorBuildSettings.scenes 에 넣는다,",
  "- **두 번 불려도 같은 결과**여야 한다. 부를 때마다 물체가 쌓이면, 두 번째",
    "  판부터 씬이 조용히 망가진다.",
  ].join("\n");
}

/**
 * 설계가 가리킨 씬 빌더가 **이미 울타리 안에 있는가.**
 *
 * 메서드 이름(`Rookery.Editor.PlatformerSceneBuilder.BuildOrRebuild`)에서
 * 클래스 이름을 떼어 보내 준 파일 목록과 맞춰 본다. 파일 이름과 클래스
 * 이름은 유니티에서 같아야 하므로(안 맞으면 컴포넌트를 못 붙인다) 이걸로 잰다.
 *
 * 내용까지는 안 본다. 있는 것이 정말 되는지는 **지어 보면** 알고, 그것이
 * 이 고리가 하는 일이다.
 */
export function reusableScene(
  sceneMethod: string | null | undefined,
  project: { path: string }[] | undefined,
  scope: string,
): boolean {
  if (!sceneMethod || !project?.length) return false;
  const parts = sceneMethod.split(".").filter(Boolean);
  // 마지막은 메서드, 그 앞이 클래스.
  const className = parts.length >= 2 ? parts[parts.length - 2] : "";
  if (!className) return false;
  return project.some(
    (f) => insideScope(f.path, scope) && f.path.endsWith(`/${className}.cs`),
  );
}

export async function planUnitySession(args: {
  db: Supabase;
  providers: Providers;
  companyId: string;
  want: string;
  scope?: string;
  unityVersion?: string;
  /** 프로젝트에 이미 있는 관련 파일. 없으면 생략된다. */
  project?: { path: string; contents: string }[];
  /** 2D 인가 3D 인가. 없으면 지금까지 하던 2D. */
  dimension?: Dimension;
}): Promise<UnityPlan | { error: string }> {
  const dimension: Dimension = args.dimension === "3d" ? "3d" : "2d";
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
      rulesFor(dimension),
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

  // 그림도 울타리 안에만 쓴다. 이름은 모델이 아니라 우리가 짓는다 —
  // 파일 이름을 모델이 정하게 두면 경로가 되는 이름이 나온다.
  // 3D 에서는 그림을 안 만든다. 메시를 만들 수 없어서 스프라이트가 쓰일 데가
  // 없고, 계획에만 넣으면 못 그리고 넘어가는 판만 늘어난다.
  const sprites: PlannedSprite[] = (dimension === "3d" ? [] : output.sprites ?? [])
    .slice(0, MAX_PLANNED_SPRITES)
    .map((sp) => ({
      name: spriteFileName(sp.name),
      purpose: sp.purpose,
      kind: sp.kind,
      made: false,
      verdict: null,
      measured: null,
    }));

  /**
   * 만들 파일이 하나도 없다 — **이것이 늘 틀린 답은 아니다.**
   *
   * 09-01 에 이 자리에서 값을 두 번 헛썼다. 울타리에 이전 세션이 만든 씬 빌더가
   * 이미 있었고, 설계가 "새로 쓸 파일 없음 + 있는 빌더를 쓴다"고 답했다. 그건
   * 맞는 답이었는데 우리가 오류로 돌려보냈고, 같은 물음을 다시 던져서 **다른
   * 답이 나올 때까지** 굴렸다. 두 번째가 더 나아서 통과한 것이 아니라 다르게
   * 나와서 통과했다 — 그건 재는 것이 아니라 다시 굴리는 것이다.
   *
   * 그래서 가리키는 씬 빌더가 **우리가 보내 준 파일 안에 실제로 있으면** 받는다.
   * 있는 것으로 지어 보고 컴파일까지 가면, 그 판단이 맞았는지는 그때 판정된다.
   *
   * 없는 것을 가리키면 여전히 거절한다. 그건 재사용이 아니라 지어낸 것이고,
   * 씬은 만들어져도 화면이 빈다.
   */
  if (planned.length === 0) {
    const reuse = reusableScene(output.sceneMethod, args.project, scope);
    if (!reuse) {
      return {
        error:
          "울타리 안에 만들 파일이 하나도 설계되지 않았습니다." +
          (output.sceneMethod
            ? ` (${output.sceneMethod} 를 쓰겠다고 했는데 그 파일이 울타리 안에 없습니다.)`
            : ""),
      };
    }
  }

  const row = {
    company_id: args.companyId,
    want: args.want,
    scope,
    criteria,
    scene_method: output.sceneMethod,
    plan: planned,
    round: 1,
    status: "running",
  };

  let { data: session, error: insertError } = await args.db
    .from("unity_sessions")
    .insert({ ...row, sprites })
    .select("id")
    .single();

  // `sprites` 칸이 아직 없는 데이터베이스에 배포되면 **세션이 아예 안 열린다** —
  // 모르는 칸이 하나 껴 있으면 insert 가 통째로 거절되고, 사람에게는 "유니티
  // 일을 열지 못했습니다" 만 남는다. 마이그레이션과 배포의 순서가 어긋나는
  // 것은 사고지, 그 순간에 게임을 못 만들 이유는 아니다.
  //
  // 그래서 그 오류만 알아보고 **그림 없이 한 번 더** 연다. 그림 칸은 못 채워도
  // 코드는 만들어진다.
  if (insertError && (insertError.code === "PGRST204" || insertError.code === "42703")) {
    console.warn(
      "unity_sessions 에 sprites 칸이 아직 없습니다 — 그림 없이 엽니다. " +
        "supabase/schema_unity_sprites.sql 을 적용하십시오.",
    );
    ({ data: session, error: insertError } = await args.db
      .from("unity_sessions")
      .insert(row)
      .select("id")
      .single());
  }
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
    sprites,
    refused,
    note: output.note,
  };
}
