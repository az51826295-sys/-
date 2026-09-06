import { z } from "zod";
import { renderGamedevLessons } from "@/lib/knowledge/gamedev";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";
import { checkFiles, repairBrief, summarise } from "@/lib/skills/appBuild/verify";

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
const UNITY_RULES =
  "\n\n## 유니티로 짓는다 (이 회사의 게임은 유니티 안에서 산다)\n" +
  "- 언어는 C#. Unity 6, URP, **새 입력 시스템 전용**(activeInputHandler: 1).\n" +
  "- 파일 경로는 `Assets/Rookery/Scripts/<이름>.cs`(런타임) 와 " +
  "`Assets/Rookery/Editor/<이름>SceneBuilder.cs`(에디터) 둘로. `language` 는 csharp.\n" +
  "- **씬 파일(.unity)을 글로 내지 마라.** 대신 에디터 스크립트 하나에 " +
  "`[MenuItem(\"Rookery/<게임 이름> 짓기\")] public static void BuildOrRebuild()` 를 " +
  "두고, 거기서 EditorSceneManager.NewScene → 바닥·조명·카메라·플레이어 → " +
  "EditorSceneManager.SaveScene(scene, \"Assets/Rookery/Scenes/<이름>.unity\") → " +
  "EditorBuildSettings.scenes 에 추가. 두 번 불려도 겹치지 않게(있으면 지우고 다시).\n" +
  "- 에디터 스크립트는 Editor 폴더에만 두고 `using UnityEditor;` 를 쓴다.\n" +
  "- 3D 자산이 업무에 이름으로 적혀 있으면 `Assets/Rookery/<제목>/model.fbx`(캐릭터는 " +
  "`rigged.fbx`, 애니메이션은 `walking.fbx`·`running.fbx`, PBR 맵은 `normal.png`·`metallic_smoothness.png`)를 쓴다. 폴더 이름에 판정 접미사" +
  "(`_FAIL`·`_UNDEFINED`)가 붙어 있을 수 있으니 AssetDatabase.FindAssets 로 찾아 경로에 제목이 " +
  "든 것을 고른다. **없으면 기본 도형**으로 짓되 어디에 무엇을 끼우면 되는지 주석에 적는다. " +
  "없는 파일을 가리키는 코드를 내지 마라. 리깅된 캐릭터는 임포트 설정(Humanoid)·클립 루프·" +
  "Animator 컨트롤러까지 **전부 씬 빌더 코드로** 만든다 — 사람 손 0회.\n" +
  "- 캐릭터 파일 찾기는 **이 도우미를 그대로** 쓴다(슬래시를 붙인 \"/치비/\" 는 폴더 이름이 " +
  "'치비_스타일_…' 이라 절대 안 맞는다 — 두 판이 여기서 헛돌았다):\n" +
  "  static string FindRig(string keyword) { string best = null, bestAt = \"\"; foreach (var g in AssetDatabase.FindAssets(\"rigged t:Model\")) { " +
  "var p = AssetDatabase.GUIDToAssetPath(g).Replace('\\\\', '/'); if (!p.EndsWith(\"/rigged.fbx\") || !p.Contains(keyword) " +
  "|| p.Contains(\"_FAIL\") || p.Contains(\"_UNDEFINED\")) continue; " +
  "var side = p + \".rookery.json\"; var at = System.IO.File.Exists(side) ? System.IO.File.ReadAllText(side) : \"\"; " +
  "var m = System.Text.RegularExpressions.Regex.Match(at, \"\\\"createdAt\\\":\\\"([^\\\"]+)\"); at = m.Success ? m.Groups[1].Value : \"\"; " +
  "Debug.Log(\"[Rookery] rig 후보: \" + p + \" \" + at); if (best == null || string.CompareOrdinal(at, bestAt) > 0) { best = p; bestAt = at; } } " +
  "if (best == null) Debug.Log(\"[Rookery] rig 못 찾음: \" + keyword); else Debug.Log(\"[Rookery] rig: \" + best); return best; }\n" +
  "  keyword 는 업무에 적힌 낱말 하나(예: \"치비\")를 슬래시 없이. **후보가 여럿이면 가장 최근 만든 것**(옆의 " +
  ".rookery.json 의 createdAt) — 매니저가 다시 만들게 한 판이 뒤에 온다(09-06 기사 세 판 중 첫 판을 집었다). " +
  "null 이면 캡슐로 짓고 다른 캐릭터로 대체하지 않는다. 캡슐엔 Animator 를 붙이지 않는다(Avatar 없음 오류).\n" +
  "- 조작은 UnityEngine.InputSystem(Keyboard.current / InputAction). Input.GetAxis 금지.\n" +
  "- 씬에는 Directional Light 하나, Main Camera(태그 MainCamera) 하나를 **반드시** 만든다.\n" +
  "- 재질은 **파이프라인을 가리지 않게** 만든다. 프로젝트는 URP 일 수도 Built-in 일 수도 있다 " +
  "(로키 창이 URP + 후처리를 켤 수 있다). 씬 빌더에 이 도우미를 두고 그것만 쓴다:\n" +
  "  `static Shader Lit() => Shader.Find(\"Universal Render Pipeline/Lit\") ?? Shader.Find(\"Standard\");`\n" +
  "  `static void Tint(Material m, Color c) { if (m.HasProperty(\"_BaseColor\")) m.SetColor(\"_BaseColor\", c); if (m.HasProperty(\"_Color\")) m.SetColor(\"_Color\", c); }`\n" +
  "  `static void Surface(Material m, float metallic, float smooth) { if (m.HasProperty(\"_Metallic\")) m.SetFloat(\"_Metallic\", metallic); if (m.HasProperty(\"_Smoothness\")) m.SetFloat(\"_Smoothness\", smooth); if (m.HasProperty(\"_Glossiness\")) m.SetFloat(\"_Glossiness\", smooth); }`\n" +
  "- **매트 강제(metallic 0 · smoothness 0.15)는 맵이 없는 재질에만.** 폴더에 metallic_smoothness.png 가 있으면 " +
  "그 맵을 믿고 `_Metallic` 은 건드리지 않으며 `_Smoothness`(URP 에서 맵 배율)=1, `_GlossMapScale`=1 로 둔다. " +
  "09-06 20:19 은빛 기사를 매트로 덮어 회색 돌처럼 나왔다 — 사람 피부·흰 셔츠 판의 버릇이다.
" +
  "  노멀 맵은 `_BumpMap` + `EnableKeyword(\"_NORMALMAP\")`, 금속 맵은 `_MetallicGlossMap` + " +
  "`EnableKeyword(\"_METALLICGLOSSMAP\")` 와 `EnableKeyword(\"_METALLICSPECGLOSSMAP\")` 둘 다. " +
  "`Shader.Find` 결과가 null 이면 Material 을 만들지 마라. `using UnityEngine.Rendering.Universal` 금지.\n" +
  "- 씬 경로는 `Assets/Rookery/Scenes/<이름>.unity`. 다른 곳에 두면 가져오기 창이 못 찾는다.\n" +
  "- UI 글꼴이 필요하면 LegacyRuntime.ttf. Arial.ttf 는 없다.\n" +
  "- MonoBehaviour 의 `Reset()` 은 에디터 콜백이라 씬 빌더의 AddComponent 순간에 불린다. " +
  "거기서 transform 을 건드리지 마라 — 빌더가 놓은 위치를 조용히 덮어써 플레이어가 바닥에 묻힌다.\n" +
  "- 플레이어는 바닥 **위**에 놓는다(캡슐이면 y = 높이/2). 시작하자마자 물리가 밀어 올리는 것은 결함이다.\n" +
  "- `howToRun`: '유니티에서 Window → Rookery → 가져오기 → 메뉴 Rookery/<이름> 짓기 → Play'.\n";

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

type Previous = {
  title: string;
  criteria: { id: string; when: string; then: string }[];
  files: { path: string; language: string; contents: string }[];
  /** 유니티 창이 재 본 결과 중 떨어진 줄. 없으면 빈 배열. */
  failedChecks: string[];
};

async function loadPrevious(ctx: SkillRunContext): Promise<Previous | null> {
  const id = (ctx.context.roleInput as { previousDeliverableId?: string | null } | null)?.previousDeliverableId;
  if (!id) return null;
  const { data } = await ctx.supabase
    .from("deliverables")
    .select("title, content_json")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const c = (data.content_json ?? {}) as {
    criteria?: Previous["criteria"];
    files?: Previous["files"];
    unityChecks?: { cases?: { name: string; result: string; message?: string | null }[] };
  };
  const failed = (c.unityChecks?.cases ?? [])
    .filter((k) => k.result === "Failed")
    .map((k) => `${k.name}${k.message ? ` — ${k.message.slice(0, 300)}` : ""}`);
  return {
    title: data.title as string,
    criteria: c.criteria ?? [],
    files: c.files ?? [],
    failedChecks: failed,
  };
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

    // ── 1. 기준을 먼저 쓴다 ─────────────────────────────────────────
    await setStep(ctx.supabase, ctx.executionId, "planning");

    const { output: spec } = await ctx.providers.ai.generateStructuredOutput({
      systemInstructions:
        "너는 이 회사의 개발자다. **아직 코드를 쓰지 마라.**\n\n" +
        "먼저 이 앱이 무엇을 해야 하는지를 **사람이 직접 확인할 수 있는 문장**으로 " +
        "적는다. '빠르다'가 아니라 '목록이 50개일 때 스크롤이 끊기지 않는다' 처럼.\n\n" +
        `기준은 ${MIN_CRITERIA}개 이상, 40개 이하. 한 기준은 두 문장 안에. 확인할 수 없는 것(예쁨·쓰기 편함)은 ` +
        "`humanGate` 에 따로 적는다 — 억지로 기준인 척하지 마라.\n\n" +
        "`target`: 게임·3D·유니티·캐릭터·씬 이야기면 **unity**(이 회사의 게임은 유니티 " +
        "안에서 산다 — HTML 게임을 내지 마라). 웹 도구·페이지·스크립트면 web. 모르면 unity.\n" +
        "unity 면 기준은 유니티 안에서 사람이 눌러 볼 수 있는 문장으로: " +
        "'메뉴 Rookery/… 를 누르면 씬이 생기고 Play 하면 …'." +
        // 설계 단계가 읽는 것은 범위·반응 쪽(blueprint). 코드 쪽 규칙은 짓는 단계에서.
        renderGamedevLessons("blueprint"),
      input:
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
            "target 은 지난 판과 같다. **지난 기준은 id 그대로 전부 남기고**(묶지 마라), 새 기준은 뒤에 더한다."
          : ""),
      schema: plan,
      schemaName: "app_plan",
      // 고치는 판은 지난 기준(29개)을 다 되쓰고 새 것을 더한다 — 6000 에서 잘려
      // 21:40 캐릭터 판이 설계 단계에서 죽었다(MODEL_OUTPUT_TRUNCATED). gpt-5 는 추론
      // 토큰도 여기서 센다.
      // 16000 도 잘렸다(09-06 10:47, 기준 52개 판). 추론 모델은 생각에 먼저 쓴다.
      maxTokens: 32000,
      tier: "judgment",
    });

    // 고치는 판: 지난 기준은 코드가 그대로 붙인다. 모델이 29개를 되쓰다 두 번 잘렸다
    // (21:40·22:48, MODEL_OUTPUT_TRUNCATED). 모델은 새 기준만 쓰고, 합치는 것은 여기서.
    if (previous && previous.criteria.length) {
      const seen = new Set(previous.criteria.map((c) => c.id));
      const added = spec.criteria.filter((c) => !seen.has(c.id));
      spec.criteria = [...previous.criteria, ...added];
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
    const { output: made } = await ctx.providers.ai.generateStructuredOutput({
      systemInstructions:
        "아래 기준을 만족하는 앱을 만든다.\n\n" +
        "- 파일 전체를 낸다. `// ...` 로 생략하지 마라 — 받은 사람이 " +
        "붙여 넣어 바로 돌릴 수 있어야 한다.\n" +
        "- `howToRun` 에 시작하는 법을 적는다.\n" +
        "- **못 지킨 기준은 `met: false` 로 적는다.** 지킨 척하면 받은 사람이 " +
        "확인할 때 알게 되고, 그때는 산출물 전체를 못 믿게 된다." +
        (unity ? UNITY_RULES + renderGamedevLessons("unity_code") : ""),
      input:
        `무엇: ${spec.title}\n\n기준:\n` +
        spec.criteria
          .map((c) => `- [${c.id}] ${c.when} → ${c.then}`)
          .join("\n") +
        (previous
          ? "\n\n## 지난 판의 파일 — 이것을 바탕으로 고친다.\n" +
            "**바꾸는 파일만 `files` 에 전체를 낸다.** 안 바꾸는 파일은 `keep` 에 경로만 적어라 — " +
            "코드가 지난 판에서 그대로 이어 붙인다. 지난 파일을 되쓰지 마라(그러다 20분을 넘겨 죽는다).\n" +
            (previous.failedChecks.length
              ? `유니티 시험에서 떨어진 줄(이것을 고치는 것이 이번 판이다):\n${previous.failedChecks.map((f) => `- ${f}`).join("\n")}\n\n`
              : "") +
            previous.files.map((f) => `--- ${f.path} (${f.language})\n${f.contents}`).join("\n\n")
          : ""),
      schema: build,
      schemaName: "app_build",
      maxTokens: 32000,
      tier: "judgment",
    });

    // ── 3. 문법이 깨졌으면 고친다 ───────────────────────────────────
    //
    // 돌려 보지는 않는다(그 이유는 verify.ts 에 있다). 다만 **파싱조차 안 되는
    // 코드**는 확실히 잡을 수 있고, 그건 가장 흔하면서 사람이 붙여 넣기 전까지
    // 아무도 모르는 실패다. 한 번은 고쳐 보고, 그래도 깨져 있으면 깨진 채로
    // 넘기되 **깨졌다고 적는다** — 고친 척하는 것이 더 나쁘다.
    await setStep(ctx.supabase, ctx.executionId, "verifying");

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

    // ── 4. 기준과 함께 넘긴다 ───────────────────────────────────────
    const met = made.coverage.filter((c) => c.met).length;

    const note =
      `문법 검사: ${verify.parsed}개 파싱됨 · ${verify.broken}개 깨짐 · ` +
      `${verify.unchecked}개는 파서가 없어 **미검사**` +
      (repaired ? " (한 번 고쳤습니다)" : "") +
      ". **돌려 보지는 않았습니다** — 생성된 코드를 서버에서 실행하면 " +
      "그건 임의 코드 실행이고, 그 문을 열면 이 회사의 모든 열쇠가 그 " +
      "코드 안에 있습니다. 파싱 통과는 작동을 뜻하지 않습니다. " +
      "위 기준으로 확인해 주십시오 — 기준은 코드보다 먼저 쓰였습니다.";

    const content = {
      target: spec.target,
      criteria: spec.criteria,
      humanGate: spec.humanGate,
      files,
      howToRun: made.howToRun,
      coverage: made.coverage,
      // 파싱 결과를 그대로 싣는다. **미검사를 통과에 섞지 않는다** —
      // 파서가 없는 언어를 "괜찮다"로 세면 검사가 있으나 마나가 된다.
      verify: { ...verify, repaired, files: checks },
      summary: { criteria: spec.criteria.length, met },
      note,
    };

    // **읽을 수 있는 본문을 같이 만든다.** 결과가 돌아오는 자리는 대화 한 칸
    // (09-05, 업무 화면은 없다)이라, JSON 만 저장하면 사람은 아무것도 못 본다.
    // 파일은 코드 블록으로 통째로 싣는다 — HTML 한 파일이면 그대로 저장해 열면 된다.
    const markdown =
      `## 실행 방법\n\n${made.howToRun.trim()}\n\n` +
      `## 합격 기준 (${met}/${spec.criteria.length} 지킴)\n\n` +
      spec.criteria
        .map((c) => {
          const cov = made.coverage.find((x) => x.criterionId === c.id);
          const mark = cov?.met ? "✅" : "❌";
          return `- ${mark} **${c.when}** → ${c.then}` + (cov?.where ? ` _(${cov.where})_` : "");
        })
        .join("\n") +
      (spec.humanGate.length
        ? `\n\n## 사람이 봐야 하는 것\n\n${spec.humanGate.map((h) => `- ${h}`).join("\n")}`
        : "") +
      `\n\n## 파일 ${files.length}개\n\n` +
      files
        .map((f) => `### \`${f.path}\`\n\n\`\`\`${f.language}\n${f.contents}\n\`\`\``)
        .join("\n\n") +
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
