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

