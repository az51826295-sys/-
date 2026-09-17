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

## 단계 (46회차 09-08 사장님 지시) — 프로토타입은 마네킹으로
- 게임은 **프로토타입 → 맵 → 캐릭터 → 다듬기** 순으로 간다. 단계마다 사장님이 체험하고 확정해야 다음으로 간다.
- **prototype 단계에서는 캐릭터를 마네킹으로 만든다.** 두 갈래 — 순서대로 본다:
  1) `Assets/StarterAssets/**` 에 마네킹(`Armature_Mesh`·`PlayerArmature`)이 있으면 **그 모델과 애니메이션을 쓴다**.
     다만 그 패키지의 3인칭 컨트롤러·Cinemachine 카메라는 **쓰지 마라** — 우리 `FollowCamera`·`PlayerController` 가 자로 재는 값(거리·화면 위치·점프)에 맞춰져 있다.
  2) 없으면 이미 있는 리깅된 FBX 를 쓰되 이미 있는 리깅된 FBX 를 쓰되 **재질을 단색 무광 회색(0.62, 0.62, 0.62)** 으로 덮어씌운다 —
  텍스처·노멀 맵을 붙이지 마라(`_BaseMap` 비우고 `_BaseColor` 만). 뼈대와 걷기·달리기 애니메이션은 그대로 쓴다(자가 사람 형태를 찾아야 잰다).
  왜: 프로토타입에서 보는 것은 조작·카메라·규칙이다. 캐릭터가 그럴듯하면 "재미없는데 예뻐서 괜찮아 보이는" 착시가 생긴다.
- NPC 도 같은 회색으로. 색으로 구분해야 하면 **명도만** 다르게(0.45 / 0.62 / 0.8).
- character 단계에서 사장님이 정한 진짜 캐릭터로 갈아 끼운다. 그때도 자가 재는 값(카메라 거리·화면 위치·점프 높이)은 그대로 이어진다.

## 조각 붙이기 (47회차) — 유니티 쪽
- **조각 파일은 여기 있다**: `Assets/Rookery/<산출물 제목>/model.fbx`. 제목은 한글이고 공백이 밑줄로 바뀐다(예: `기사용_은색_판금_투구_조각_(머리에_부착)/model.fbx`).
  `parts/helmet.fbx` 같은 경로를 먼저 찾지 마라 — 자산은 **산출물 제목 폴더**로 들어온다. 못 찾으면 `AssetDatabase.FindAssets("t:Model")` 로 훑고, 그래도 없으면 오류로 적고 기준을 미충족으로 표시한다(임시 도형으로 때우지 마라).
- 딱딱한 조각은 **뼈의 자식**으로 놓는다: `var bone = animator.GetBoneTransform(HumanBodyBones.Head); piece.transform.SetParent(bone, false);` 그다음 로컬 위치·회전만 맞춘다.
  씬 빌더는 조각 프리팹을 `Assets/Rookery/<제목>/parts/<이름>.fbx` 에서 찾는다.
- 휘는 조각은 `SkinnedMeshRenderer` 를 몸과 **같은 배열**로 채운다: `piece.bones = body.bones; piece.rootBone = body.rootBone;` — 조각 자신의 뼈대를 쓰면 애니메이션에서 따로 논다.
- 조각을 붙였으면 **가려지는 몸 부분을 끄지 마라**(첫 판). 뚫고 나오는지 자가 봐야 한다.
- 자에 재는 값: `parts_attached`(붙은 조각 수) · `part_offset_m`(조각과 붙은 뼈 사이 거리, 0.15 m 이하여야 한다 — 크면 허공에 뜬 것).

## 조각 크기는 손으로 넣지 말고 **계산해서** 맞춘다 (49회차 09-08)

**왜**: 생성기(Meshy)가 만든 조각에는 **실제 크기라는 게 없다.** 단위도 비율도 그때그때 다르다. 그걸 그대로 씌우면 투구가 머리를 삼킨다(48회차: 세 판을 돌며 눈대중으로 줄였지만 사진이 안 바뀌었다).
숫자를 프롬프트로 정해 주는 것도 틀렸다 — 다음 조각은 또 다른 크기로 온다.

**방법**: 붙이는 코드가 **재서 나눈다.**
```csharp
// 1) 뼈 자리의 크기: 머리면 머리뼈에서 머리 꼭대기까지
var head = animator.GetBoneTransform(HumanBodyBones.Head);
float top = 0f; foreach (var r in animator.GetComponentsInChildren<Renderer>(true)) top = Mathf.Max(top, r.bounds.max.y);
float headSize = Mathf.Max(0.05f, top - head.position.y);

// 2) 조각의 크기: 스케일 1 일 때의 경계
var piece = (GameObject)PrefabUtility.InstantiatePrefab(model);
piece.transform.SetParent(head, false);
piece.transform.localScale = Vector3.one;
var b = new Bounds(piece.transform.position, Vector3.zero);
foreach (var r in piece.GetComponentsInChildren<Renderer>(true)) b.Encapsulate(r.bounds);
float pieceMax = Mathf.Max(b.size.x, Mathf.Max(b.size.y, b.size.z));

// 3) 목표 비율로 나눈다 — 투구는 머리 크기의 1.15 배쯤(머리를 감싸되 삼키지 않는다)
piece.transform.localScale = Vector3.one * (headSize * 1.15f / Mathf.Max(0.0001f, pieceMax));

// 4) 중심을 머리 중심에 맞춘다(경계 중심과 머리 중심의 차이만큼 옮긴다)
```
**자리별 목표 비율**(붙는 뼈 크기 대비 조각의 가장 긴 변): head 1.0~1.3 · shoulder 0.5~0.8 · hand(무기) 1.5~3.0 · chest 1.0~1.5 · foot 0.8~1.2.
**자가 재는 것**: `part_size_ratio`(조각 ÷ 머리 크기) · `part_covers_bone`(조각이 붙은 뼈를 감싸는가) · `part_offset_m` · `part_offset_ratio`.
**조각 중심은 뼈 피벗이 아니라 머리 중심에 맞춘다.** 규격표 실측: 머리 중심은 Head 뼈에서 **8.4 cm 위**, 정수리는 **20.1 cm 위**, 코드의 `headSize = 정수리 − 뼈 = 20.1 cm`. 그래서 제대로 씌운 투구의 `part_offset_ratio` 는 8.4/20.1 = **0.42** 다(0 이 아니다 — 0 이면 목덜미에 가라앉은 것이다). 자는 **0.42 ±0.15**(0.27~0.57)로 잰다. 121회차 09-15 정정: 옛 문턱 '0.35 이하' 는 제대로 씌운 투구를 떨어뜨리고 가라앉힌 투구를 통과시켰다(통과한 값 0.00·0.336, 떨어진 값 0.50).
숫자를 코드에 박지 마라 — 새 조각이 오면 그 숫자가 또 틀린다.

### 준 뒤에 **다시 재서 보정한다** (50회차 09-08 — 이것 때문에 네 판을 헛돌았다)
계산이 맞아도 그려지는 크기는 다를 수 있다. 뼈가 이미 축소·확대돼 있으면 **로컬 스케일에 그 배율이 한 번 더 곱해진다**.
실측: Dev 가 머리 0.327 m, 조각 0.2 m 를 재서 스케일 1.88 을 줬는데 화면에 그려진 투구는 **4 mm** 였다(뼈 배율 탓).

그래서 한 줄을 더 한다 — **주고 나서 다시 재고, 어긋난 만큼 곱한다.**
```csharp
void Fit(Transform bone, GameObject piece, float target)   // target = 원하는 세상 크기(m)
{
    for (int i = 0; i < 3; i++)
    {
        var b = new Bounds(piece.transform.position, Vector3.zero);
        foreach (var r in piece.GetComponentsInChildren<Renderer>(true)) b.Encapsulate(r.bounds);   // 세상 좌표
        float now = Mathf.Max(b.size.x, Mathf.Max(b.size.y, b.size.z));
        if (now < 1e-5f) break;
        float k = target / now;
        if (Mathf.Abs(k - 1f) < 0.02f) break;               // 2% 안이면 됐다
        piece.transform.localScale *= k;                     // 어긋난 만큼만 곱한다
    }
}
```
로컬 스케일 숫자를 계산해서 **한 번에 끝내려 하지 마라.** 재고 → 곱하고 → 다시 재는 것이 배율·단위·부모 스케일을 전부 흡수한다.
같은 방식으로 위치도 맞춘다: 조각 경계 중심과 목표 지점의 차이를 **세상 좌표에서** 구해 `piece.transform.position += diff` 로 옮긴다.

### 뼈는 1:1 이 아니다 — 로컬 숫자를 스케일에 그대로 쓰지 마라 (52회차 09-08, 산수로 확인)
기사 머리뼈의 `lossyScale` 은 **0.0133**(1/75)이었다. 그래서 이런 일이 났다:

    화면에 그려진 크기 0.005 m = 조각 0.2 × 준 배율 1.88 × 뼈 배율 0.0133

Dev 는 조각을 **로컬 단위**(mesh.bounds, 또는 프리팹 자산의 bounds)로 0.2 라 재고 그 숫자로 배율을 구했다. 로컬 0.2 는 세상에서 0.0027 m 였다.
**규칙 셋**
1. 크기는 **씬에 넣은 뒤(Instantiate 하고 부모까지 붙인 뒤)** `Renderer.bounds`(세상 좌표)로 잰다. `mesh.bounds`·프리팹 자산의 bounds 는 **로컬**이라 쓰면 안 된다.
2. 실행 중 `Awake()`/`Start()` 에서 맞추지 마라 — 그 시점의 경계는 아직 안 선다(48~51회차에 여섯 판을 여기서 날렸다). **씬 빌더(에디터)에서** 맞춘다.
3. 한 번에 끝내려 하지 말고 **재고 → 곱하고 → 다시 재기**를 2% 안에 들 때까지(최대 3번). 그러면 뼈 배율이 몇이든 맞는다.

### 프로토타입 플레이어는 마네킹 (56회차 → 57회차에 고침)
프로토타입에서는 **얼굴·옷이 없는 회색 몸**을 주인공으로 세운다. 판단을 흐리지 않게.
- **`Assets/Rookery/_mannequin/character-a.fbx` 는 쓰지 마라.** 뼈가 6개(root·head·arm-left/right·leg-left/right)뿐인 막대 인형이라
  유니티 Humanoid 로 못 들어간다("Required human bone 'LeftLowerLeg' not found"). Humanoid 가 아니면 **자가 아무것도 못 잰다** —
  키·등신·조각 붙음이 전부 사람 형태(Animator.isHuman)를 기준으로 재기 때문이다. 57회차에 확인.
- 대신 **리깅된 사람 몸**(현재 씬의 주인공)을 그대로 두고 재질만 **단색 무광 회색(0.62)** 으로 덮는다. 그것이 우리의 마네킹이다.
- 진짜 기준 맨몸(A 포즈·옷 없음·리깅 1회)이 생기면 그것으로 바꾼다 — 갑옷 조각은 전부 그 몸에 맞춰 만든다.
- character 단계가 되면 사장님이 정한 주인공으로 바꾼다.

### 사람 비율을 잰다 (57회차 09-08)
자가 새로 재는 것: `body_height_m`(사람 캐릭터의 발끝~정수리, 세상 좌표) · `head_count`(키 ÷ 머리 크기 = 몇 등신).
회사가 늘 붙이는 줄: **규격_사람_키 0.4~4.0 m**, **규격_등신 2~9**. 계획이 뭘 적든 붙는다.
여기 걸리면 대개 비율이 아니라 **파일 단위**가 깨진 것이다(FBX 1유닛이 1 m 인지 1 cm 인지).
- 몸 높이는 **스키닝된 살**(뼈 4개 초과)만 잰다. 얹은 투구·갑옷은 몸이 아니다.
- 로컬 bounds 는 스케일을 안 담는다 — `Renderer.bounds`(세상 좌표)로만 잰다.

### 자산 전체에 거는 규칙 (57회차 09-08)
가져오기 규칙을 넣기 전에 **몇 개 파일에 닿는지 센다.** 셋보다 많으면 셋에만 걸어 재 보고 넓힌다.
- 사이드카(`.rookery.json`)는 **폴더 단위**다. 한 폴더에 리깅된 몸·리깅 전 메시·동작 클립이 같이 있으니
  "이 폴더는 캐릭터다" 로 전부에 같은 설정을 걸면 엉뚱한 파일이 걸린다(57회차: `model.fbx` 에 Humanoid → `Hips 없음`).
- 넣기 전에 **그 일을 이미 하는 코드가 없는지** 본다 — 씬 빌더가 이미 아바타를 세우고 있었다.
- 09-08 하루에 두 번 어겼다: 파일 단위(53회차, 캐릭터 100배), 리그 종류(57회차, FBX 40개 재수입).

### 조각은 **맨몸**에 얹는다 (59회차 09-08)
사장님이 사진을 보고 "투구 크기 개판" 이라 했다. 자는 1.29 로 통과였다. 둘 다 맞다 — **자가 틀렸다.**
- 자가 머리 크기를 잴 때 **얹은 조각까지 포함**해서 봤다. 그래서 투구가 커질수록 '머리'도 커지고 비율은 1 근처로 돌아왔다.
  **자기 눈을 자기가 가린 자였다.** 이제 머리는 **몸(살)만** 보고 잰다.
- 그리고 **기사는 이미 투구를 쓰고 있었다.** 갑옷이 구워진 캐릭터 위에 조각을 또 얹으면 투구가 둘이 된다.
  **조각은 아무것도 안 입은 기준 맨몸에 얹는다** — 그러라고 맨몸을 만들었다.
- `part_offset_m` 은 절대 미터라 문턱(0.15)에 맞춰 깎였다(58회차에 정확히 0.15). 이제 `part_offset_ratio`(÷머리 크기, 0.35 이하)로 본다.
- 회사 규격: `규격_조각_크기` **0.8~1.8** · `규격_조각_자리` **0.35 이하**.

### 머리에 쓰는 것은 **뼈 점이 아니라 머리 덩어리**에 맞춘다 (60회차 09-08)
Meshy 리그의 `Head` 뼈는 **목 밑동**에 있고 보이는 머리는 그 위로 올라간다.
뼈 점에 정확히 맞추면 `part_offset_ratio` 가 0(만점)인데 **투구는 목에 걸린다** — 사진으로 확인했다.
- 앉을 자리 = `headBone.position + up × (머리 높이 ÷ 2)`. 머리 높이는 **살(스키닝된 몸)의 꼭대기 − 뼈**.
- 자도 그 자리로 잰다(`part_offset_ratio` ≤ 0.35). 뼈 점으로 재면 목에 건 투구가 만점을 받는다.
- **숫자가 통과인데 사진이 이상하면 자가 틀린 것이다.** 오늘 이 자리에서 두 번 그랬다(크기 한 번, 자리 한 번).
