# 유니티 코드 규칙 (Dev)

<!-- 이 파일이 Dev 의 씬 빌더 규칙이다. 코드가 아니라 파일이라 배포 없이 고친다:
     저장소 파일은 씨앗이고, 저장소 버킷의 _skills/unity-rules.md 가 있으면 그것이 이긴다(60초 캐시).
     고치면 `npx tsx engine/tools/skill_push.mts unity-rules` 로 올린다. -->

## 유니티로 짓는다 (이 회사의 게임은 유니티 안에서 산다)
- 언어는 C#. Unity 6, URP, **새 입력 시스템 전용**(activeInputHandler: 1).
- 파일 경로는 `Assets/Rookery/Scripts/<이름>.cs`(런타임) 와 `Assets/Rookery/Editor/<이름>SceneBuilder.cs`(에디터) 둘로. `language` 는 csharp.
- **씬 파일(.unity)을 글로 내지 마라.** 대신 에디터 스크립트 하나에 `[MenuItem("Rookery/<게임 이름> 짓기")] public static void BuildOrRebuild()` 를 두고, 거기서 EditorSceneManager.NewScene → 바닥·조명·카메라·플레이어 → EditorSceneManager.SaveScene(scene, "Assets/Rookery/Scenes/<이름>.unity") → EditorBuildSettings.scenes 에 추가. 두 번 불려도 겹치지 않게(있으면 지우고 다시).
- 에디터 스크립트는 Editor 폴더에만 두고 `using UnityEditor;` 를 쓴다.
- 3D 자산이 업무에 이름으로 적혀 있으면 `Assets/Rookery/<제목>/model.fbx`(캐릭터는 `rigged.fbx`, 애니메이션은 `walking.fbx`·`running.fbx`, PBR 맵은 `normal.png`·`metallic_smoothness.png`)를 쓴다. 폴더 이름에 판정 접미사(`_FAIL`·`_UNDEFINED`)가 붙어 있을 수 있으니 AssetDatabase.FindAssets 로 찾아 경로에 제목이 든 것을 고른다. **없으면 기본 도형**으로 짓되 어디에 무엇을 끼우면 되는지 주석에 적는다. 없는 파일을 가리키는 코드를 내지 마라. 리깅된 캐릭터는 임포트 설정(Humanoid)·클립 루프·Animator 컨트롤러까지 **전부 씬 빌더 코드로** 만든다 — 사람 손 0회.
- 캐릭터 파일 찾기는 **이 도우미를 그대로** 쓴다(슬래시를 붙인 "/치비/" 는 폴더 이름이 '치비_스타일_…' 이라 절대 안 맞는다 — 두 판이 여기서 헛돌았다):
  static string FindRig(string keyword) { string best = null, bestAt = ""; foreach (var g in AssetDatabase.FindAssets("rigged t:Model")) { var p = AssetDatabase.GUIDToAssetPath(g).Replace('\\', '/'); if (!p.EndsWith("/rigged.fbx") || !p.Contains(keyword) || p.Contains("_FAIL") || p.Contains("_UNDEFINED")) continue; var side = p + ".rookery.json"; var at = System.IO.File.Exists(side) ? System.IO.File.ReadAllText(side) : ""; var m = System.Text.RegularExpressions.Regex.Match(at, "\"createdAt\":\"([^\"]+)"); at = m.Success ? m.Groups[1].Value : ""; Debug.Log("[Rookery] rig 후보: " + p + " " + at); if (best == null || string.CompareOrdinal(at, bestAt) > 0) { best = p; bestAt = at; } } if (best == null) Debug.Log("[Rookery] rig 못 찾음: " + keyword); else Debug.Log("[Rookery] rig: " + best); return best; }
  keyword 는 업무에 적힌 낱말 하나(예: "치비")를 슬래시 없이. **후보가 여럿이면 가장 최근 만든 것**(옆의 .rookery.json 의 createdAt) — 매니저가 다시 만들게 한 판이 뒤에 온다(09-06 기사 세 판 중 첫 판을 집었다). null 이면 캡슐로 짓고 다른 캐릭터로 대체하지 않는다. 캡슐엔 Animator 를 붙이지 않는다(Avatar 없음 오류).
- 캐릭터 폴더에 동작 클립이 `idle.fbx`·`jump.fbx`·`attack.fbx`… 로 있을 수 있다(walking.fbx·running.fbx 와 같은 자리, 09-07). 애니메이터는 **Idle 을 기본 상태**로 두고, 움직이면 walking, 점프 키(Space)면 jump 를 한 번 재생하고 Idle 로 돌아온다. 클립 찾기는 rig 폴더에서 이름으로: `AssetDatabase.LoadAllAssetsAtPath(dir + "/idle.fbx").OfType<AnimationClip>().FirstOrDefault()`. 없으면 그 상태를 빼고 로그에 적는다 — 없는 클립을 만들지 마라.
- **3인칭 카메라 — 숫자 먼저: 카메라 거리 4.5 m, 시야각 55, 캐릭터는 화면 가로 1/3 지점(어깨 너머).** (30회차 09-07, Cinemachine 3 의 Third Person Follow 를 본떠 손으로 짠다 — 패키지는 안 넣는다.) 어깨 피벗(shoulder offset x 0.7·y 0.3·z -0.5) → 손(vertical arm 0.4) → 카메라 거리 4~5 m. 움직임은 `LateUpdate` 에서 `SmoothDamp`(감쇠 0.1~0.3초, 축마다). 벽 뚫림: 손에서 카메라로 `Physics.SphereCast`(반지름 0.25) 해서 막히면 그 거리로 당기고, 당길 땐 빨리(0.05초)·되돌아올 땐 천천히(0.5초). 플레이어 자신은 무시(태그/레이어). 이동 방향으로 0.5~1 m 앞을 본다(look-ahead). 시야각 50~60. 캐릭터가 화면 가운데가 아니라 **가로 1/3 지점**에 오게. 지터가 나면 원인은 LateUpdate 가 아닌 곳에서 옮기는 것이다.
- **HUD(점수·안내 글)는 반드시 Canvas `RenderMode = ScreenSpaceCamera` + `worldCamera = Camera.main`, planeDistance 1** 로 만든다(31회차 09-07). Screen Space-Overlay 는 카메라 렌더텍스처에 안 찍혀 로키의 검사 사진에 HUD 가 영영 안 보인다(지금까지 점수가 한 번도 안 찍혔다). 글자는 UGUI `Text` 에 **OS 글꼴** `Font.CreateDynamicFontFromOSFont("Malgun Gothic", 48)` — 기본 글꼴은 한글이 네모로 나온다. CanvasScaler 는 ScaleWithScreenSize(1920×1080, match 0.5). 점수는 오른쪽 위(앵커 1,1 · 여백 40), 안내 문구는 가운데. 글자 크기는 화면 세로의 4~6%.
- 조작은 UnityEngine.InputSystem(Keyboard.current / InputAction). Input.GetAxis 금지.
- 씬에는 Directional Light 하나, Main Camera(태그 MainCamera) 하나를 **반드시** 만든다.
- 재질은 **파이프라인을 가리지 않게** 만든다. 프로젝트는 URP 일 수도 Built-in 일 수도 있다 (로키 창이 URP + 후처리를 켤 수 있다). 씬 빌더에 이 도우미를 두고 그것만 쓴다:
  `static Shader Lit() => Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");`
  `static void Tint(Material m, Color c) { if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c); if (m.HasProperty("_Color")) m.SetColor("_Color", c); }`
  `static void Surface(Material m, float metallic, float smooth) { if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic); if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smooth); if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", smooth); }`
- **매트 강제(metallic 0 · smoothness 0.15)는 맵이 없는 재질에만.** 폴더에 metallic_smoothness.png 가 있으면 그 맵을 믿고 `_Metallic` 은 건드리지 않으며 `_Smoothness`(URP 에서 맵 배율)=1, `_GlossMapScale`=1 로 둔다. 09-06 20:19 은빛 기사를 매트로 덮어 회색 돌처럼 나왔다 - 사람 피부·흰 셔츠 판의 버릇이다.
  노멀 맵은 `_BumpMap` + `EnableKeyword("_NORMALMAP")`, 금속 맵은 `_MetallicGlossMap` + `EnableKeyword("_METALLICGLOSSMAP")` 와 `EnableKeyword("_METALLICSPECGLOSSMAP")` 둘 다. `Shader.Find` 결과가 null 이면 Material 을 만들지 마라. `using UnityEngine.Rendering.Universal` 금지.
- 씬 경로는 `Assets/Rookery/Scenes/<이름>.unity`. 다른 곳에 두면 가져오기 창이 못 찾는다.
- UI 글꼴이 필요하면 LegacyRuntime.ttf. Arial.ttf 는 없다.
- MonoBehaviour 의 `Reset()` 은 에디터 콜백이라 씬 빌더의 AddComponent 순간에 불린다. 거기서 transform 을 건드리지 마라 — 빌더가 놓은 위치를 조용히 덮어써 플레이어가 바닥에 묻힌다.
- 플레이어는 바닥 **위**에 놓는다(캡슐이면 y = 높이/2). 시작하자마자 물리가 밀어 올리는 것은 결함이다.
- `howToRun`: '유니티에서 Window → Rookery → 가져오기 → 메뉴 Rookery/<이름> 짓기 → Play'.

## 첫 레벨 (교과 8, 33회차 09-07 — 읽은 것: The Level Design Book 'metrics'·'wayfinding'; 숫자를 먼저 적는다)
- **척도**: 플레이어 캡슐 1.0×1.8 m 를 자로 삼는다. 길 너비 ≥ 2 m(플레이어 폭의 두 배 — 그래도 좁게 느껴진다), 벽 높이 3 m·두께 0.1 m, 문 1.25×2.5 m, 계단 한 단 높이 0.15 m·깊이 0.3 m(경사 ≤ 30°).
- **크기**: 첫 레벨은 바닥 **40×40 m 안**. 걷기 4 m/s 면 핵심 동선(시작→목표)은 60~100 m(15~25초). 더 크면 빈 땅이 된다.
- **셋으로 나눈다**: 시작(안전, 조작을 익히는 첫 10 m — 장애물 없음) → 도전(동전·장애물·높이 차) → 목표(마지막 동전, 클리어 자리). 구역마다 바닥 색이나 높이를 다르게.
- **랜드마크 하나**: 시작점에서 보이는 **높이 ≥ 6 m**(플레이어 세 배) 물체를 목표 쪽에 세운다. 주변과 **색이 다르게**(대비) — 플레이어는 가는 방향을 보고, 대비(색·형태·빛·움직임)에 눈이 간다.
- **동선은 고리**: 시작→도전→목표→시작으로 돌아온다. 막다른 길을 만들지 마라.
- **동전은 길잡이(weenie)**: 길을 따라 3~5 m 간격, 서 있는 자리에서 **다음 동전이 늘 보이게**. 위를 보게 하려면 이유(높은 동전·빛)를 둔다.
- **높이 차 하나**: 평평한 바닥에 기둥 둘은 레벨이 아니다. 경사로(≤ 30°)나 단(0.15 m)으로 1~2 m 오르는 자리를 하나 둔다. 플레이어가 못 오르는 턱(> 0.4 m)은 벽이다.
- **구역 바닥은 구역마다 다른 색 재질**(URP 면 `_BaseColor`)로 — 자가 `ground_color_count`(넓이 4 m² 이상 납작한 정적 물체의 색 가짓수)를 잰다. 셋 이상.
- **카메라 거리는 자가 잰다**(`camera_distance_m`, 카메라→플레이어 가슴). 4.0~5.0 m. 캐릭터가 화면 세로 절반을 차지하면 너무 가깝다(33회차 사진).
- **랜드마크·벽·바닥은 Collider 를 가진 정적 물체**로 만든다(자가 `level_extent_m`·`landmark_count` 를 그걸로 잰다). 동전은 트리거.
