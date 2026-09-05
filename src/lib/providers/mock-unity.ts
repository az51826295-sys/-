/**
 * 모의 제공자가 **유니티 고리**에 내놓는 답.
 *
 * 이 회사의 규칙은 "새 고리는 모의로 먼저 돌려 보고 실제 모델을 부른다" 인데,
 * 유니티 길에서는 그 규칙을 **지킬 수가 없었다.** 모의 제공자는 프롬프트의
 * 본문을 훑어서 어떤 호출인지 알아내는데, 유니티 프롬프트는 그 어느 표제와도
 * 안 맞아서 시장조사 답이 나왔고, `planUnitySession` 이 첫 줄에서 ZodError 로
 * 죽었다. 그러니 게임 만드는 길은 한 판을 돌려 보려면 반드시 돈이 나갔다.
 *
 * ## 왜 `schemaName` 으로 가르는가
 *
 * 본문 훑기는 **부르는 쪽이 한 글자만 고쳐도 조용히 다른 답으로 샌다.** 표제
 * 문구는 사람이 읽으라고 쓴 글이라 실제로 자주 고쳐진다. `schemaName` 은 답의
 * 모양에 붙은 이름이라 모양이 바뀔 때만 바뀐다 — 갈라야 하는 것이 바로 그
 * 모양이다.
 *
 * ## 왜 **컴파일되는** C# 을 내는가
 *
 * 모의가 아무 글자나 내도 스키마는 통과한다. 그러면 이 고리에서 정작 재고
 * 싶은 자리(파일 쓰기 → 유니티 컴파일 → 씬 짓기 → PlayMode 시험)는 첫 판에서
 * 오류 수십 개로 막히고, 심부름꾼이 정말 도는지는 여전히 모른 채로 남는다.
 *
 * 그래서 여기서 내는 코드는 **진짜로 컴파일되고 진짜로 씬을 짓는다.** 값은 0원
 * 인데 고리는 끝까지 돈다. 재려는 것이 모델의 솜씨가 아니라 **심부름꾼과
 * 유니티 사이의 배관**이라, 그 배관을 끝까지 통과시키는 것이 모의의 일이다.
 *
 * 대신 이 코드는 **게임이 아니다.** 바닥 위에 캡슐 하나가 키를 따라 움직이는
 * 것이 전부고, 어느 게임을 시켜도 같은 것이 나온다. 모의 판의 결과물을 두고
 * "만들어졌다"고 말할 자리는 없다 — 잰 것은 배관이지 게임이 아니다.
 */

/** 모의가 짓는 것들의 이름. 씬 빌더가 이 이름으로 컴포넌트를 찾는다. */
const NAMESPACE = "Rookery.Mock";
const PLAYER_CLASS = "RookeryMockPlayer";
const BUILDER_CLASS = "RookeryMockSceneBuilder";

/**
 * 모의 답을 낸다. 유니티 호출이 아니면 `null` — 부르는 쪽이 원래 하던 대로
 * 넘어간다. 여기서 억지로 답을 만들면 다른 길의 모의가 조용히 망가진다.
 */
export function mockUnityOutput(
  schemaName: string,
  input: string,
  systemInstructions: string,
): unknown | null {
  switch (schemaName) {
    case "unity_vibe_plan":
      return planOutput(input, systemInstructions);
    case "unity_vibe_files":
      return filesOutput(input, systemInstructions);
    case "unity_vibe_fix":
      return fixOutput(input, systemInstructions);
    case "unity_criteria_checks":
      return checksOutput(input);
    case "unity_build":
      return buildOutput(input);
    case "unity_lessons":
      // **아무것도 안 배운다.** 모의는 판마다 같은 코드를 내므로 오류가
      // 사라진 이유를 말할 수 있는 자리가 아니다. 지어낸 교훈은 다음 세션이
      // 사실로 읽고, 그때는 실제 모델이 그것을 따른다.
      return { lessons: [] };
    default:
      return null;
  }
}

// ── 프롬프트에서 읽어 내는 것들 ──────────────────────────────
//
// 무엇을 낼지 가르는 것은 `schemaName` 이지만, **무엇에 대해** 낼지는 여전히
// 프롬프트 안에 있다. 울타리와 파일 목록을 짐작하면 울타리 밖에 쓰거나 시키지
// 않은 파일을 내고, 그건 부르는 쪽이 통째로 버린다.

/** 이 세션의 울타리. 설계 판과 쓰는 판이 서로 다른 문장으로 적는다. */
function scopeOf(systemInstructions: string): string {
  const match = systemInstructions.match(/(Assets\/\S*\/)\s*아래/);
  return match ? match[1] : "Assets/Rookery/";
}

/** 만들려는 것 한 줄. 설계 판은 "만들 것:", 쓰는 판은 "만들려는 것:". */
function wantOf(input: string): string {
  const match = input.match(/^만들(?:려는)? 것: (.+)$/m);
  return match ? match[1].trim() : "이름 없는 것";
}

/** `- <경로> — <설명>` 목록 한 덩이. 머리글 다음부터 줄이 끊길 때까지. */
function listAfter(
  input: string,
  heading: string,
): { path: string; purpose: string }[] {
  const after = input.split(heading)[1];
  if (!after) return [];
  const out: { path: string; purpose: string }[] = [];
  for (const raw of after.split("\n")) {
    const line = raw.trim();
    // 머리글 뒤의 첫 줄은 비어 있다. 목록이 시작된 **뒤의** 빈 줄에서 끊는다 —
    // 그 아래로도 `- ` 로 시작하는 목록이 더 있어서, 안 끊으면 그림 쪽지의
    // 줄까지 파일로 읽는다.
    if (!line) {
      if (out.length) break;
      continue;
    }
    const match = line.match(/^-\s+(\S+\.cs)\s+—\s*(.*)$/);
    if (!match) break;
    out.push({ path: match[1], purpose: match[2].trim() || "(설명 없음)" });
  }
  return out;
}

function classNameOf(path: string): string {
  const leaf = path.split("/").pop() ?? path;
  return leaf.replace(/\.cs$/, "");
}

/** 에디터 전용 자리인가. 유니티는 `Editor` 폴더로 어셈블리를 가른다. */
function isEditorPath(path: string): boolean {
  return path.split("/").includes("Editor");
}

// ── 설계 판 ──────────────────────────────────────────────────

/**
 * 파일 **둘**만 설계한다.
 *
 * 한 판에 내용까지 받는 개수가 둘(`FILES_PER_CALL`)이라, 둘이면 왕복 한 번에
 * 다 쓰고 바로 컴파일로 간다. 모의로 재려는 것은 설계의 크기가 아니라 배관이
 * 끝까지 이어지는지라, 왕복을 늘려 봐야 같은 자리를 여러 번 지날 뿐이다.
 */
function planOutput(input: string, systemInstructions: string): unknown {
  const scope = scopeOf(systemInstructions);
  const want = wantOf(input);
  const threeD = systemInstructions.includes("이 프로젝트는 3D 다");

  return {
    title: `[모의] ${want}`,
    criteria: [
      {
        when: "씬을 연다",
        then: "카메라·조명·바닥·플레이어가 모두 있고 오류가 나지 않는다",
      },
      {
        when: "W 키를 누른다",
        then: "이름에 Player 가 들어간 물체가 자리를 옮긴다",
      },
    ],
    files: [
      {
        path: `${scope}Scripts/${PLAYER_CLASS}.cs`,
        purpose: "키 입력을 읽어 Rigidbody 를 움직인다",
      },
      {
        path: `${scope}Editor/${BUILDER_CLASS}.cs`,
        purpose: "카메라·조명·바닥·플레이어가 있는 씬을 짓고 저장한다",
      },
    ],
    // 그림은 안 그린다. 모의에는 그리는 자리가 없고, 목록만 채워 두면 쓰는
    // 판이 없는 파일 경로를 참조하는 코드를 낸다 — 씬은 지어지고 화면만 빈다.
    sprites: [],
    sceneMethod: `${NAMESPACE}.${BUILDER_CLASS}.BuildOrRebuild`,
    setup:
      "사람이 할 일은 없습니다. 씬은 코드가 짓고 빌드 설정에 스스로 들어갑니다.",
    humanGate: [
      "이것은 게임이 아닙니다. 모의 제공자가 내는 고정 코드이고, 무엇을 " +
        "시켜도 같은 씬이 나옵니다.",
      "이 판이 통과했다는 것은 **배관이 돈다**는 뜻입니다 — 심부름꾼이 파일을 " +
        "쓰고, 유니티가 컴파일하고, 씬이 지어지고, PlayMode 가 돌았다는 것까지.",
    ],
    note:
      `모의 판입니다(0원). "${want}" 대신 ` +
      (threeD ? "3D 기본 도형" : "기본 도형") +
      "으로 된 최소 씬을 짓습니다 — 재려는 것이 모델의 솜씨가 아니라 " +
      "심부름꾼과 유니티 사이의 배관이기 때문입니다.",
  };
}

// ── 쓰는 판 ──────────────────────────────────────────────────

function filesOutput(input: string, systemInstructions: string): unknown {
  const scope = scopeOf(systemInstructions);
  // 시키지 않은 파일을 내면 부르는 쪽이 버린다. 이번 판에 청한 것만 낸다.
  const asked = listAfter(input, "이번에 낼 파일:");
  // 씬 빌더가 어떤 컴포넌트를 붙일지는 **설계도 전체**를 보고 정한다. 이번
  // 판에 안 온 파일도 곧 쓰이므로, 그 이름까지 미리 알아야 한다.
  const whole = listAfter(input, "설계도 전체:");
  const runtime = runtimeClassesOf(whole.length ? whole : asked);

  const files = (asked.length ? asked : fallbackPlan(scope)).map((f) => ({
    path: f.path,
    purpose: f.purpose,
    contents: sourceFor(f.path, scope, runtime),
  }));

  return {
    files,
    note:
      "모의 제공자가 낸 고정 코드입니다. 컴파일되고 씬을 짓는 것까지가 " +
      "이 코드가 하는 일의 전부입니다.",
  };
}

/**
 * 고치는 판.
 *
 * 모의는 **판마다 같은 답**을 낸다. 그래서 여기서 하는 일은 앞판에 낸 파일을
 * 그대로 다시 내는 것이고, 오류가 진짜였다면 다음 판에 같은 오류가 돌아와
 * 서버의 멈추는 규칙(같은 오류 두 판)에 걸린다. 그것이 맞는 결말이다 —
 * 모의가 고칠 수 있는 척하면 고리는 영영 돌고 판만 늘어난다.
 */
function fixOutput(input: string, systemInstructions: string): unknown {
  const scope = scopeOf(systemInstructions);
  // 앞판들이 무엇을 냈는지는 "지난 판들:" 줄에 적혀 있다. 그것이 지금
  // 프로젝트에 있는 파일이고, 다시 낼 대상이다.
  const seen = [
    ...(input.split("지난 판들:")[1] ?? "").matchAll(/(Assets\/\S+?\.cs)/g),
  ].map((m) => m[1]);
  const paths = [...new Set(seen)];
  const plan = paths.length
    ? paths.map((path) => ({ path, purpose: "(앞판에 낸 파일)" }))
    : fallbackPlan(scope);
  const runtime = runtimeClassesOf(plan);

  return {
    files: plan.map((f) => ({
      path: f.path,
      purpose: f.purpose,
      contents: sourceFor(f.path, scope, runtime),
    })),
    note:
      "모의 제공자는 고칠 수 없습니다 — 판마다 같은 코드를 냅니다. 앞판과 " +
      "똑같은 파일을 다시 냈으니, 오류가 진짜였다면 다음 판에 같은 것이 " +
      "돌아와 세션이 멈춥니다.",
  };
}

function fallbackPlan(scope: string): { path: string; purpose: string }[] {
  return [
    {
      path: `${scope}Scripts/${PLAYER_CLASS}.cs`,
      purpose: "키 입력을 읽어 움직인다",
    },
    {
      path: `${scope}Editor/${BUILDER_CLASS}.cs`,
      purpose: "씬을 짓고 저장한다",
    },
  ];
}

/** 씬 빌더가 플레이어에 붙일 컴포넌트들. 에디터 파일은 컴포넌트가 아니다. */
function runtimeClassesOf(plan: { path: string }[]): string[] {
  const names = plan
    .filter((f) => !isEditorPath(f.path))
    .map((f) => classNameOf(f.path));
  return names.length ? names : [PLAYER_CLASS];
}

// ── 내는 코드 ────────────────────────────────────────────────
//
// 설계도가 무엇을 적었든 **경로를 보고** 정한다. Editor 아래면 씬을 짓는 것,
// 아니면 씬에 붙는 것. 설계가 모의의 것이 아닐 때도(대화창에서 열린 세션을
// 이어받는 경우) 이 규칙이면 컴파일되는 파일이 나온다.

function sourceFor(path: string, scope: string, runtime: string[]): string {
  const name = classNameOf(path);
  if (isEditorPath(path)) return sceneBuilderSource(name, scope, runtime);
  // 첫 번째 것만 실제로 움직인다. 여럿이 한 물체를 서로 밀면 무엇이 움직였는지
  // 알 수 없게 되고, 그러면 "움직인다"는 판정이 무엇의 판정인지 흐려진다.
  return runtime[0] === name ? moverSource(name) : idleSource(name);
}

/**
 * 키를 누르면 Rigidbody 를 미는 컴포넌트.
 *
 * **입력은 전처리기로 가른다.** 두 입력 API 를 둘 다 실행 경로에 두면, 꺼져
 * 있는 쪽이 실행할 때 던져서 씬 전체가 멈춘다. `#if` 는 컴파일할 때 갈리므로
 * 꺼진 쪽은 아예 코드에 없다 — 어느 프로젝트에 떨어져도 한 길만 남는다.
 *
 * 자리를 옮기는 데 `MovePosition` 을 쓴다. `Rigidbody.velocity` 는 유니티 6
 * 에서 `linearVelocity` 로 바뀌었고, 버전마다 다른 이름을 쓰면 모의가 재려던
 * 배관 대신 이름 문제로 판이 죽는다.
 *
 * **읽는 것은 `Update`, 미는 것은 `FixedUpdate` 다.** 처음에는 둘 다
 * `FixedUpdate` 에서 했는데, PlayMode 시험이 "아무것도 안 움직였습니다" 로
 * 떨어뜨렸다. 입력 시스템은 갱신 방식마다 상태 버퍼를 따로 두고, 기본값인
 * `ProcessEventsInDynamicUpdate` 에서는 **고정 갱신 쪽 버퍼를 안 채운다** —
 * 그래서 `FixedUpdate` 에서 읽으면 키가 눌려 있어도 늘 안 눌린 것으로 나온다.
 * 컴파일도 되고 예외도 안 나고, 그냥 안 움직인다.
 */
function moverSource(name: string): string {
  return `using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace ${NAMESPACE}
{
    // 모의 제공자가 낸 코드입니다. 게임이 아니라 배관을 재기 위한 최소 부품입니다.
    [RequireComponent(typeof(Rigidbody))]
    public class ${name} : MonoBehaviour
    {
        public float speed = 5f;

        Rigidbody _body;
        Vector2 _wanted;

        void Awake()
        {
            _body = GetComponent<Rigidbody>();
            _body.constraints = RigidbodyConstraints.FreezeRotation;
        }

        void Update()
        {
            _wanted = Read();
        }

        void FixedUpdate()
        {
            if (_body == null) return;
            if (_wanted.sqrMagnitude < 0.0001f) return;

            var step = new Vector3(_wanted.x, 0f, _wanted.y).normalized * (speed * Time.fixedDeltaTime);
            _body.MovePosition(_body.position + step);
        }

        static Vector2 Read()
        {
#if ENABLE_INPUT_SYSTEM
            var keyboard = Keyboard.current;
            if (keyboard == null) return Vector2.zero;

            var moved = Vector2.zero;
            if (keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed) moved.y += 1f;
            if (keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed) moved.y -= 1f;
            if (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed) moved.x -= 1f;
            if (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed) moved.x += 1f;
            // 스페이스도 받는다. 시험기가 눌러 보는 키는 게임마다 다르고,
            // 여기서 안 받으면 "안 움직인다" 가 되는데 그건 못 누른 것이다.
            if (keyboard.spaceKey.isPressed) moved.y += 1f;
            return moved;
#else
            return new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
#endif
        }
    }
}
`;
}

/** 씬에 붙기는 하지만 아무것도 안 하는 것. 설계도가 파일을 더 적었을 때. */
function idleSource(name: string): string {
  return `using UnityEngine;

namespace ${NAMESPACE}
{
    // 모의 제공자가 낸 자리 채우기입니다. 설계도에 이 파일이 있어서 냈을 뿐,
    // 하는 일은 없습니다. 모의는 게임을 만들지 않습니다.
    public class ${name} : MonoBehaviour
    {
    }
}
`;
}

/**
 * 씬을 짓는 에디터 메서드.
 *
 * 재려는 자리가 여기 다 모여 있다 — 심부름꾼이 `-executeMethod` 로 이걸
 * 부르고, 여기서 만든 씬을 PlayMode 시험이 연다. 그래서 **시험이 보는 것**을
 * 전부 갖춘다: 켜진 카메라, 켜진 조명(없으면 3D 는 검게 나온다), 그려지는
 * 것, 그리고 움직일 수 있는 Rigidbody.
 *
 * **두 번 불려도 같은 결과**여야 한다. 부를 때마다 물체가 쌓이면 두 번째
 * 판부터 씬이 조용히 망가지고, 그건 컴파일로 안 잡힌다.
 */
function sceneBuilderSource(
  name: string,
  scope: string,
  runtime: string[],
): string {
  const scenesFolder = `${scope}Scenes`;
  const attach = runtime
    .map((cls) => `            TryAdd(player, "${NAMESPACE}.${cls}");`)
    .join("\n");

  return `#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace ${NAMESPACE}
{
    // 호출 지점(sceneMethod): ${NAMESPACE}.${name}.BuildOrRebuild
    //
    // 모의 제공자가 낸 코드입니다. 어떤 게임을 시켜도 같은 씬이 나옵니다 —
    // 재는 것이 게임이 아니라 배관이기 때문입니다.
    public static class ${name}
    {
        const string ScenesFolder = "${scenesFolder}";
        const string ScenePath = ScenesFolder + "/RookeryMock.unity";
        // 앞판이 지은 것을 알아보는 이름. 이것이 없으면 부를 때마다 쌓인다.
        const string RootName = "RookeryMockRoot";

        [MenuItem("Rookery/Build Or Rebuild Mock Scene", priority = 90)]
        public static void BuildOrRebuild()
        {
            EnsureFolderRecursive(ScenesFolder);

            var scene = File.Exists(ScenePath)
                ? EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single)
                : EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            foreach (var root in scene.GetRootGameObjects())
            {
                if (root != null && root.name == RootName)
                    UnityEngine.Object.DestroyImmediate(root);
            }

            var rootGO = new GameObject(RootName);
            SceneManager.MoveGameObjectToScene(rootGO, scene);

            // 바닥. 없으면 플레이어가 끝없이 떨어진다.
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground";
            ground.transform.SetParent(rootGO.transform, true);
            ground.transform.position = Vector3.zero;
            ground.transform.localScale = new Vector3(5f, 1f, 5f);
            Paint(ground, new Color(0.35f, 0.55f, 0.35f, 1f));

            // 플레이어. 캡슐은 높이 2 라, y=1 에 두면 바닥에 정확히 선다.
            var player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            player.name = "Player";
            player.tag = "Player";
            player.transform.SetParent(rootGO.transform, true);
            player.transform.position = new Vector3(0f, 1f, 0f);
            Paint(player, new Color(0.90f, 0.60f, 0.25f, 1f));

            var body = player.GetComponent<Rigidbody>();
            if (body == null) body = player.AddComponent<Rigidbody>();
            body.constraints = RigidbodyConstraints.FreezeRotation;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            body.collisionDetectionMode = CollisionDetectionMode.Continuous;

${attach}

            // 조명. 3D 물체는 이것이 없으면 전부 검게 나오고, 컴파일러도
            // "보이는 것이 있다" 시험도 그걸 못 본다.
            var lightGO = new GameObject("Directional Light");
            lightGO.transform.SetParent(rootGO.transform, true);
            lightGO.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
            var light = lightGO.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.color = new Color(1f, 0.96f, 0.90f, 1f);

            // 카메라. 빈 씬에는 아무것도 없어서 이것도 직접 만든다.
            var camGO = new GameObject("Main Camera");
            camGO.tag = "MainCamera";
            camGO.transform.SetParent(rootGO.transform, true);
            camGO.transform.position = new Vector3(0f, 6f, -9f);
            camGO.transform.rotation = Quaternion.Euler(25f, 0f, 0f);
            var cam = camGO.AddComponent<UnityEngine.Camera>();
            cam.orthographic = false;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.46f, 0.70f, 0.98f, 1f);
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 200f;
            camGO.AddComponent<AudioListener>();

            SaveScene(scene);
            EnsureSceneInBuildSettings();
        }

        static void SaveScene(Scene scene)
        {
            if (string.IsNullOrEmpty(scene.path))
            {
                EditorSceneManager.SaveScene(scene, ScenePath);
                return;
            }
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
        }

        // 빌드 설정 **끝에** 놓는다. 시험기가 마지막 것을 연다.
        static void EnsureSceneInBuildSettings()
        {
            var list = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            if (list.Any(s => s != null && s.path == ScenePath)) return;
            list.Add(new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = list.ToArray();
        }

        static void EnsureFolderRecursive(string path)
        {
            path = path.Replace('\\\\', '/').TrimEnd('/');
            if (string.IsNullOrEmpty(path) || AssetDatabase.IsValidFolder(path)) return;

            var parent = Path.GetDirectoryName(path);
            parent = string.IsNullOrEmpty(parent) ? "Assets" : parent.Replace('\\\\', '/');
            if (parent == path) return;

            EnsureFolderRecursive(parent);
            if (!AssetDatabase.IsValidFolder(path))
                AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        // 셰이더를 못 찾으면 손대지 않는다. 기본 도형에는 이미 재질이 붙어
        // 있어서, 잘못 칠하는 것보다 그대로 두는 편이 낫다.
        static void Paint(GameObject go, Color color)
        {
            var shader = GraphicsSettings.currentRenderPipeline != null
                ? Shader.Find("Universal Render Pipeline/Lit")
                : null;
            if (shader == null) shader = Shader.Find("Standard");
            if (shader == null) return;

            var material = new Material(shader);
            if (shader.name.Contains("Universal Render Pipeline"))
                material.SetColor("_BaseColor", color);
            else
                material.SetColor("_Color", color);

            var renderer = go.GetComponent<Renderer>();
            if (renderer != null) renderer.sharedMaterial = material;
        }

        // 이름으로 찾아 붙인다. 그 파일이 아직 안 쓰인 판에도 씬은 지어져야
        // 한다 — 여기서 컴파일이 깨지면 무엇이 문제인지 볼 기회조차 없어진다.
        static void TryAdd(GameObject go, string typeName)
        {
            var type = FindType(typeName);
            if (type == null)
            {
                Debug.LogWarning("모의 씬 빌더: " + typeName + " 을 찾지 못해 안 붙였습니다.");
                return;
            }
            if (go.GetComponent(type) == null) go.AddComponent(type);
        }

        static Type FindType(string fullName)
        {
            if (string.IsNullOrEmpty(fullName)) return null;

            var found = Type.GetType(fullName + ", Assembly-CSharp");
            if (found != null) return found;

            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    found = assembly.GetType(fullName, false);
                    if (found != null) return found;
                }
                catch (Exception)
                {
                }
            }
            return null;
        }
    }
}
#endif
`;
}

// ── 한 번에 다 내는 옛 창구 ──────────────────────────────────

/** `/api/unity/build` 는 설계와 코드를 한 번에 낸다. 같은 파일을 그 모양에 담는다. */
function buildOutput(input: string): unknown {
  const scope = "Assets/Rookery/";
  const want = wantOf(input);
  const plan = fallbackPlan(scope);
  const runtime = runtimeClassesOf(plan);

  return {
    title: `[모의] ${want}`,
    criteria: [
      {
        id: "scene",
        when: "씬을 연다",
        then: "카메라·조명·바닥·플레이어가 모두 있다",
      },
      { id: "move", when: "W 키를 누른다", then: "Player 가 자리를 옮긴다" },
    ],
    files: plan.map((f) => ({
      path: f.path,
      purpose: f.purpose,
      contents: sourceFor(f.path, scope, runtime),
    })),
    setup:
      `${NAMESPACE}.${BUILDER_CLASS}.BuildOrRebuild 를 부르면 씬이 지어지고 ` +
      "빌드 설정에 들어갑니다. 그 밖에 사람이 할 일은 없습니다.",
    humanGate: ["이것은 게임이 아닙니다. 모의 제공자가 내는 고정 코드입니다."],
  };
}

// ── 합격 기준을 표로 ─────────────────────────────────────────

/**
 * 기준을 시험기가 알아듣는 표로 옮긴다.
 *
 * **거의 다 `humanOnly` 로 보낸다.** 모의는 기준을 읽고 무엇을 눌러야 하는지
 * 판단할 수 없고, 판단한 척하면 재기 쉬운 다른 것을 재게 된다 — `criteria.ts`
 * 가 경계하는 바로 그 자리다. 옮기는 것은 씬에 실제로 플레이어가 있고 기준이
 * 누르는 것을 말할 때 하나뿐이고, 그 하나는 표가 놓이는 길이 도는지를 재려고
 * 남긴다.
 */
function checksOutput(input: string): unknown {
  const criteria = [...input.matchAll(/^(\d+)\.\s+(.+?)\s+→\s+(.+)$/gm)].map(
    (m) => ({
      index: Number(m[1]),
      criterion: `${m[2]} → ${m[3]}`,
      pressing: /누르|키|이동|움직|걷|달리/.test(m[2]),
    }),
  );

  const line = (input.split("씬에 실제로 있는 물체 이름:")[1] ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && l !== "(없음)");
  const target = (line ?? "")
    .split(",")
    .map((n) => n.trim())
    .find((n) => n.toLowerCase().includes("player"));

  const checks: unknown[] = [];
  const humanOnly: unknown[] = [];
  for (const c of criteria) {
    if (target && c.pressing && checks.length === 0) {
      checks.push({
        index: c.index,
        criterion: c.criterion,
        action: "press",
        key: "w",
        seconds: 0,
        observe: "moves",
        target,
        why: "모의 판: 키를 눌렀을 때 플레이어가 실제로 옮겨지는지만 봅니다.",
      });
      continue;
    }
    humanOnly.push({
      index: c.index,
      criterion: c.criterion,
      why:
        "모의 제공자는 기준을 읽고 무엇을 눌러야 하는지 판단하지 않습니다. " +
        "억지로 옮기면 재기 쉬운 다른 것을 재게 됩니다.",
    });
  }

  return { checks, humanOnly };
}
