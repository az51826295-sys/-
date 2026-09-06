/**
 * 게임 제작 시행착오 — 직원들이 일하기 전에 읽는 것.
 *
 * 2026-09-05 사장님: "나는 게임 개발해 본 적이 없다. GPT·검색으로 시행착오를
 * 학습해서 엔진을 강화하자." 읽은 것은 `engine/docs/gamedev-lessons-v0.md` 에
 * 출처와 함께 있고, 여기는 그것을 **프롬프트에 실을 모양**으로 옮긴 것이다.
 * 번호(A1, B3…)가 문서와 같다.
 *
 * ## 왜 회사 지식(organization_knowledge)이 아니라 코드인가
 * 회사 지식은 회사마다 대화에서 배운 것이고, 표에서 새것부터 여덟 개까지만
 * 실린다 — 08-30 에 컴파일러 잔소리가 회사가 정한 것을 밀어낸 자리다. 이것은
 * 회사와 상관없는 **이 제품의 기술 지식**이라 코드에 둔다. 판마다 확인된 것은
 * `verified` 를 올린다 — 남의 글은 그 사람의 경험이지 우리 것이 아니다.
 */

export type LessonRole = "mesh_assets" | "unity_code" | "blueprint";

export type Lesson = {
  id: string;
  role: LessonRole;
  text: string;
  /** 우리 판에서 실제로 밟아 확인했는가. 아니면 읽은 것이다. */
  verified: boolean;
};

export const GAMEDEV_LESSONS: Lesson[] = [
  // ── A. Meshy → 유니티 반입 (Vox) ──
  { id: "A1", role: "mesh_assets", verified: false,
    text: "캐릭터(리깅·애니메이션이 필요한 것)는 FBX 를 유니티에 넣는다. Humanoid 리그와 리타깃은 FBX 임포터에만 있고 GLB(glTFast)에는 없다. 소품은 GLB 도 된다." },
  { id: "A2", role: "mesh_assets", verified: false,
    text: "Meshy 출력은 cm 단위일 수 있다. 유니티에서 크기가 100배면 임포트 설정 Scale Factor 0.01 — 씬 인스턴스를 늘리지 않는다. 우리 호출은 auto_size 로 m 단위를 청한다; 실제 높이는 판정표 S1 에 있다." },
  { id: "A3", role: "mesh_assets", verified: false,
    text: "GLB 를 유니티가 열려면 패키지 com.unity.cloud.gltfast 가 있어야 한다. 없으면 파일이 프로젝트에 들어가도 아무것도 안 뜬다." },
  { id: "A4", role: "mesh_assets", verified: false,
    text: "분홍 재질은 렌더 파이프라인에 없는 셰이더다. URP 면 Universal Render Pipeline/Lit 으로 바꾼다." },
  { id: "A5", role: "mesh_assets", verified: false,
    text: "하얀 모델은 텍스처가 재질에 안 붙은 것이다. 임포트 설정에서 Materials → Extract 를 다시 한다." },
  { id: "A7", role: "mesh_assets", verified: false,
    text: "리깅된 캐릭터는 Rig → Humanoid 로 두고, Animation 탭에 클립이 보이는지 확인한 뒤 Animator 에 연결한다." },
  { id: "A8", role: "mesh_assets", verified: true,
    text: "피벗은 바닥 중앙이어야 (0,0,0) 에 놓았을 때 땅에 선다. 우리 Meshy 호출이 origin_at: bottom 이다." },
  { id: "A9", role: "mesh_assets", verified: false,
    text: "메시에는 콜라이더가 따로 없다. 씬에 놓을 때 Box 또는 Mesh Collider 를 붙여야 바닥을 뚫지 않는다." },

  { id: "E1", role: "mesh_assets", verified: true,
    text: "닫힘(watertight)은 3D 프린팅 기준이지 게임 기준이 아니다. 열린 메시도 게임에서는 문제없다 — 규격 v1 부터 정보만 남긴다." },
  { id: "E2", role: "mesh_assets", verified: true,
    text: "Meshy 리깅은 휴머노이드만 된다(5 크레딧). 본 24개가 Hips·Spine·LeftUpLeg 같은 믹사모식 이름으로 와서 유니티 Humanoid 에 자동 매핑된다. 걷기·달리기 FBX 가 같이 온다. 비인간형은 사람이 Blender 에서 리깅한다." },
  { id: "E7", role: "mesh_assets", verified: true,
    text: "리깅된 출력은 단위가 100배 다를 수 있다 — 같은 모델이 메시 출력 1.7 m, 리깅 출력 0.017 m 로 잡혔다. 유니티에서 rigged.fbx 의 Scale Factor 를 반드시 확인한다(100 또는 0.01)." },

  { id: "F1", role: "mesh_assets", verified: false,
    text: "폴리 예산은 PC 20~50k 삼각형, 텍스처 2K 가 표준이다. 히어로 자산만 4K. 텍스처가 메시보다 메모리를 더 먹으니 메시를 깎기 전에 텍스처를 줄인다." },
  { id: "F3", role: "mesh_assets", verified: true,
    text: "**Meshy FBX 는 법선을 다시 계산한다**(읽은 글의 'Normals 는 Import' 는 AI 메시엔 틀렸다 — 09-06 01:24 실험). 그대로 들이면 옷에 네모난 얼룩이 지고, 노멀 맵·텍스처를 바꿔도 안 없어진다. ModelImporter: importNormals = Calculate, normalSmoothingAngle = 180, weldVertices = true, 탄젠트 CalculateMikk. 로키 창이 받을 때 자동으로 한다. Read/Write 는 끈다." },

  // ── K. 9회차 (09-05 20:00) — Meshy 공식 반입 점검표에서 더 읽은 것 ──
  { id: "K1", role: "mesh_assets", verified: false,
    text: "Meshy 는 '엔진에 바로 넣을 것은 topology triangle, quad 는 편집(Blender)용' 이라고 한다. 우리 호출은 quad 15000 이다 — 유니티는 어차피 삼각형으로 바꾸니 결과 차이는 재 봐야 안다. 다음 소품 판에서 triangle 로 한 번 재 본다." },
  { id: "K2", role: "mesh_assets", verified: false,
    text: "반입 뒤 확인 순서: Scale Factor → Materials 'Extract Materials' → 셰이더가 파이프라인(URP/Built-in)과 맞는지 → 애니메이션이 있으면 Animation Type(Generic/Humanoid) 과 Animation 탭의 클립. 하얀 모델은 텍스처가 안 붙은 것, 분홍은 셰이더가 없는 것 — 둘은 원인이 다르다." },
  { id: "K3", role: "mesh_assets", verified: false,
    text: "산출물 글에 '유니티에 넣을 때' 는 이 순서대로 적는다 — 받는 사람(사장님)은 게임을 만들어 본 적이 없다. 설정 이름을 유니티 창에 보이는 영어 그대로 적는다." },

  // ── B. 유니티 코드 (Dev) ──
  { id: "B1", role: "unity_code", verified: false,
    text: "물리(Rigidbody 속도·힘)는 FixedUpdate 에서, 입력 읽기는 Update 에서. Update 에서 Rigidbody 를 밀면 프레임마다 다르게 움직인다." },
  { id: "B2", role: "unity_code", verified: false,
    text: "FindObjectOfType·GetComponent 를 매 프레임 부르지 않는다. Start 에서 한 번 찾아 필드에 둔다." },
  { id: "B3", role: "unity_code", verified: false,
    text: "한 클래스가 다 하지 않는다. 이동·체력·입력·카메라는 각각 컴포넌트다. 이름에 And 가 필요하면 둘로 나눈다." },
  { id: "B4", role: "unity_code", verified: false,
    text: "새 물체의 Transform 은 Reset 부터. 루트는 위치 0·회전 0·크기 1 로 두고 조정은 자식에서." },
  { id: "B5", role: "unity_code", verified: false,
    text: "폴더는 Assets/Scenes·Scripts·Prefabs·Art·Audio. 두 번 이상 놓는 물체는 프리팹으로." },
  { id: "B6", role: "unity_code", verified: true,
    text: "행동 하나를 더하면 바로 돌려 본다. 컴파일 통과는 작동이 아니다 — 08-29~09-03 에 '컴파일만 통과하고 안 움직이는' 게임을 여러 번 냈다." },
  { id: "B7", role: "unity_code", verified: true,
    text: "새 입력 시스템 전용 프로젝트(activeInputHandler: 1)에서 Input.GetAxis 는 조용히 0 이다. UnityEngine.InputSystem 의 Keyboard.current 또는 InputAction 을 쓴다." },
  { id: "B8", role: "unity_code", verified: true,
    text: "Unity 6 에는 Arial.ttf 가 없다. UI 글꼴은 LegacyRuntime.ttf." },

  { id: "E4", role: "unity_code", verified: false,
    text: "3인칭 조작·카메라는 처음부터 짜지 않는다. 유니티 Starter Assets – ThirdPerson(URP)이 표준형이고 Input System·Cinemachine 이 같이 깔린다. 그 위에 얹는다." },

  { id: "F4", role: "unity_code", verified: false,
    text: "Starter Assets 에 우리 캐릭터를 끼울 때: FBX Rig → Humanoid, Avatar 'Create From This Model', 플레이어 프리팹의 SkinnedMeshRenderer 와 본을 바꾸고 Animator 에 새 Avatar 를 지정한다. 본 이름이 표준(Hips·Spine·LeftUpLeg…)이어야 한다." },
  { id: "F5", role: "unity_code", verified: false,
    text: "PC 텍스처 압축은 RGB DXT1, RGBA BC7. 바닥·벽처럼 반복되는 텍스처는 밉맵을 켜고 Trilinear." },
  { id: "F6", role: "unity_code", verified: false,
    text: "Unity 6 URP 프로젝트의 기본 패키지: render-pipelines.universal, inputsystem, cinemachine(3.x), cloud.gltfast(6.x). 버전은 레지스트리에 물어서 고른다." },

  { id: "G1", role: "unity_code", verified: true,
    text: "FindObjectOfType/FindObjectsOfType 은 폐기됐다. FindFirstObjectByType / FindAnyObjectByType / FindObjectsByType(FindObjectsSortMode.None) 을 쓴다." },
  { id: "G2", role: "unity_code", verified: true,
    text: "Rigidbody.velocity 는 Unity 6 에서 linearVelocity 다(2D 도). 옛 이름을 쓰면 경고이고 버전에 따라 오류다." },
  { id: "G3", role: "unity_code", verified: false,
    text: "AddForceAtPosition 에 ForceMode.Acceleration/VelocityChange 를 주던 코드는 Unity 6 에서 뜻이 바뀌었다 — 질량을 곱해 Force/Impulse 로 쓴다." },
  { id: "G5", role: "unity_code", verified: true,
    text: "씬은 에디터 스크립트로 짓는다: EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single) → CreatePrimitive/new GameObject + AddComponent → EditorSceneManager.SaveScene(scene, path) → EditorBuildSettings.scenes 에 추가. [MenuItem] 을 달아 사람도 누를 수 있게." },
  { id: "G6", role: "unity_code", verified: true,
    text: "씬 빌더는 두 번 불려도 겹치지 않아야 한다 — 있으면 열어서 지우고 다시 짓는다. 밭이 겹쳐 쌓인 적이 있다." },

  { id: "G8", role: "unity_code", verified: true,
    text: "Shader.Find 는 없는 셰이더에 null 을 준다. URP 가 안 깔린 프로젝트에서 'Universal Render Pipeline/Lit' 은 없다. new Material(Shader.Find(…)) 을 그대로 쓰면 ArgumentNullException 으로 씬 빌더도 게임도 죽는다 — 결과를 검사하고 'Standard' 로 물러나거나, 기본 도형의 재질을 그대로 둔다." },
  { id: "G9", role: "unity_code", verified: true,
    text: "씬 빌더는 Directional Light 를 반드시 하나 만든다. 없으면 3D 물체가 검게 나오고 합격 시험(삼차원이면_조명이_있다)에서 떨어진다 — 09-05 Dev 의 첫 유니티 판이 그랬다." },

  { id: "G12", role: "unity_code", verified: true,
    text: "MonoBehaviour.Reset() 은 에디터 콜백이다 — 씬 빌더가 AddComponent 하는 순간 불려 transform 을 덮어쓴다. 09-05 Dev 가 거기서 position = 0 을 해서 플레이어가 바닥에 묻힌 채 저장됐고, 시작하자마자 물리가 밀어 올려 자가 '입력 없이 움직인 물체' 로 빼 버렸다. Reset 에 transform 을 두지 않는다." },

  // ── J. 9회차 (09-05 20:00) — 디테일(손맛). 인터넷에서 읽은 것 + 우리 생각 ──
  // 사장님: "게임에 관련된 디테일 추가하는 법 — 그런 거 있지, 넣으라고."
  // 읽은 것: game feel/juice 글 셋(egmatic·tigerabrodi·GameAnalytics). 숫자는 그 글들의
  // 것이고, '우리 씬에서 어떻게' 는 우리 생각이다. 아직 우리 판에서 안 밟았다.
  // 20:12 같은 동전 줍기를 다시 시킨 판: 14개 중 13개가 코드에 나타났고(소리 자리만 빠짐)
  // 컴파일 0 오류·씬 지어짐·시험 통과 4 떨어짐 0. 구조까지 맞은 것(J2·J5·J6·J10·J13)만
  // verified. 보기에 좋은지는 자가 못 잰다 — 사람 눈이 마지막 칸이다.
  { id: "J1", role: "unity_code", verified: false,
    text: "한 행동에 반응 하나로는 부족하다 — 겹친다. 줍기 하나에 크기 튐 + 알갱이 + 카메라 살짝 흔들림 + 점수 글자 튐(+ 나중에 소리). 글들은 큰 사건에 4~10개를 겹치라 한다. 반응이 하나뿐인 게임은 '아무 일도 안 일어난' 것처럼 읽힌다." },
  { id: "J2", role: "unity_code", verified: true,
    text: "소품에 생명: 동전·열쇠·보석은 제자리에서 돈다(transform.Rotate(0, 90~180 * deltaTime, 0)) 하고 위아래로 뜬다(y = 기준 + Mathf.Sin(time * 2~3) * 0.1~0.2). 가만히 선 소품은 배경으로 읽혀 플레이어가 주우려 하지 않는다." },
  { id: "J3", role: "unity_code", verified: false,
    text: "줍는 순간: 콜라이더를 먼저 끈다(두 번 세어지는 것 방지) → 크기를 1.3배로 튀겼다가 0.15초에 0 으로 줄인다 → SetActive(false). Destroy 는 안 쓴다(R 로 되돌리기가 되게). 숫자는 글의 것: 찌그러짐·늘림은 0.8×1.2 를 2~5 프레임." },
  { id: "J4", role: "unity_code", verified: false,
    text: "**사라지는 물체의 연출은 그 물체가 돌리지 않는다.** 코루틴은 주인이 비활성화·파괴되면 같이 멈춘다 — 동전이 자기 코루틴으로 줄어들다 SetActive(false) 하면 그 뒤 줄은 안 돈다. 매니저(GameManager)나 전용 연출 컴포넌트가 StartCoroutine 한다." },
  { id: "J5", role: "unity_code", verified: true,
    text: "알갱이(파티클)는 자산 없이 코드로 만든다: new GameObject + AddComponent<ParticleSystem>. main.startLifetime 0.3~0.6, startSpeed 2~4, startSize 0.05~0.15, emission.rateOverTime 0, emission.SetBursts(new[]{ new ParticleSystem.Burst(0f, 12~20) }), shape Sphere 반지름 0.1. 터뜨릴 때 transform.position 옮기고 Play(). 하나 만들어 재사용 — 매번 Instantiate 하지 않는다. 렌더러 재질은 Shader.Find 결과를 검사한다(G8)." },
  { id: "J5b", role: "unity_code", verified: true,
    text: "**AddComponent<ParticleSystem>() 은 붙는 순간 재생을 시작하고(playOnAwake 기본 true), 렌더러에 재질이 없어 분홍 사각형이 원점에 터진다** — 23:26 사진의 '발밑 분홍 조각' 이 이것이었다(캐릭터 문제가 아니었다). 붙인 직후 ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear) 하고 설정한 뒤, 렌더러에 new Material(Shader.Find(\"Particles/Standard Unlit\") ?? Shader.Find(\"Sprites/Default\") ?? Shader.Find(\"Standard\")) 을 넣는다." },
  { id: "J6", role: "unity_code", verified: true,
    text: "카메라 흔들림은 카메라 자신이 아니라 **부모(rig) 의 localPosition** 에 준다. 시작 값을 기억했다가 되돌린다. 글의 수치: 4px·5프레임·감쇠 → 3D 에서는 진폭 0.05~0.1 m, 0.1~0.2초, 매 프레임 진폭 × 0.8. 큰 사건(클리어·맞음)에만. 줍기마다 흔들면 멀미다 — 일정한 흔들림은 금지." },
  { id: "J7", role: "unity_code", verified: false,
    text: "UI 튐: 점수 글자를 0.9 → 1.2 → 1.0 으로 0.1~0.15초(RectTransform.localScale). 클리어 글자는 크기 0 에서 튀어나온다(overshoot: 1.2 찍고 1.0). 글은 2~3 프레임이라 하지만 사람이 보려면 0.1초는 되어야 한다 — 우리 생각." },
  { id: "J8", role: "unity_code", verified: false,
    text: "움직임에 easing 을 쓴다. Lerp(a, b, t) 의 t 를 그대로 넣지 말고 1 - (1-t)^3(ease-out) 또는 Mathf.SmoothStep 으로. 선형은 기계처럼 보인다. 카메라 따라가기도 SmoothDamp." },
  { id: "J9", role: "unity_code", verified: false,
    text: "시간 정지(hit-stop)는 타격에만 40~80 ms — Time.timeScale = 0 뒤 복귀. 그동안 deltaTime 도 0 이므로 복귀는 WaitForSecondsRealtime, 정지 중 돌아야 할 UI 는 unscaledDeltaTime. 줍기에는 안 쓴다." },
  { id: "J10", role: "unity_code", verified: true,
    text: "3D 첫 씬의 배경 디테일 다섯: 바닥 색과 물체 색 대비(같은 회색 금지), 카메라 배경색(하늘색), Directional Light 그림자 켜기(shadows = LightShadows.Soft), 옅은 안개(RenderSettings.fog = true, fogColor = 배경색, fogDensity 0.01~0.02), 바닥 가장자리가 보이면 벽·울타리. 이 다섯이 없으면 '회색 상자 위의 캡슐' 로 보인다." },
  { id: "J11", role: "unity_code", verified: false,
    text: "소리는 나중이지만 **자리는 지금** 만든다(사장님: 효과음은 나중에). AudioSource 하나와 PlayPickup()/PlayClear() 같은 빈 함수를 두고 clip 이 null 이면 아무것도 안 한다. 나중에 클립만 끼우면 되게." },
  { id: "J12", role: "unity_code", verified: false,
    text: "플레이어 조작 반응이 먼저다. 입력 지연은 어떤 연출로도 못 살린다(글들의 첫 번째 규칙). 이동은 Update 에서 입력 읽어 Rigidbody 는 FixedUpdate 에서(B1), 점프가 있으면 coyote time·input buffer 100~150 ms." },

  // ── L. 10회차 (09-05 20:42) — 캐릭터 음영·그림자. 교과 과정 5번 ──
  // 21:10 같은 동전 줍기에 "고쳐 줘: 빛과 그림자만" → 필 조명·그림자 품질·재질·near 가 코드에,
  // URP 타입 0, 사진에서 회색 바닥 위 그림자·금속 동전·무광 캡슐이 보였다. L1~L6 확인.
  // 안 나온 것: Trilight(Flat 앰비언트로 대신), shadowBias/normalBias(줄무늬가 없어서 안 건드림).
  // 읽은 것: 유니티 URP 그림자 문제 해결(공식), 7colors 의 bias 수치, 3점 조명 글들,
  // 포스트 프로세싱 글들, Meshy game-asset-pipeline README. 시험 프로젝트가 Built-in 이라
  // 규칙은 파이프라인을 가리지 않는 API(Light·QualitySettings·RenderSettings)로 적는다.
  { id: "L1", role: "unity_code", verified: true,
    text: "조명은 셋으로 짓는다(3점 조명의 게임판). ① 키(key): Directional, 회전 (50, -30, 0), 세기 0.75(URP·후처리에서는 1.0 이면 흰 옷이 탄다 — P5), 색은 살짝 따뜻하게(1, 0.96, 0.9), 그림자 Soft. ② 필(fill): Directional 하나 더, 키의 반대쪽(회전 (30, 150, 0)), 세기 0.25, 색은 살짝 차게(0.8, 0.85, 1), **그림자 끔**. ③ 앰비언트: RenderSettings.ambientMode = Trilight, skyColor 하늘색 0.5 배, equatorColor 회색 0.4, groundColor 어두운 0.2. 키 하나만 있으면 그림자 쪽 얼굴이 검다 — 09-05 동전 판이 그랬다." },
  { id: "L2", role: "unity_code", verified: true,
    text: "그림자 품질은 코드로 박는다: QualitySettings.shadows = ShadowQuality.All, shadowResolution = ShadowResolution.High, shadowDistance = 40(가까운 게임은 30~50 — 150 이상이면 텍셀이 늘어나 계단이 진다), shadowCascades = 4. 키 조명에 light.shadowBias = 0.03, light.shadowNormalBias = 0.6 (줄무늬(acne)면 normalBias 를 먼저 올리고, 그림자가 발에서 떨어지면(peter-panning) bias 를 내린다). shadowStrength 0.8 — 1.0 은 검정 구멍처럼 보인다." },
  { id: "L3", role: "unity_code", verified: true,
    text: "재질은 Standard 기본값(smoothness 0.5)이 플라스틱처럼 보인다. 바닥·벽·소품은 smoothness 0.15~0.3, metallic 0. 금속(동전·갑옷)만 metallic 0.8~1, smoothness 0.6~0.8. 순색(1,1,0)은 쓰지 않는다 — (0.95, 0.8, 0.2) 처럼 한 단계 죽인 색이 조명을 받는다. material.SetFloat(\"_Glossiness\", …) / (\"_Metallic\", …)." },
  { id: "L4", role: "unity_code", verified: true,
    text: "바닥은 순백이 아니다. 알베도 0.35~0.55 의 회색이나 옅은 색이어야 그림자가 읽힌다 — 흰 바닥은 그림자 대비가 죽고 화면 전체가 날아간다(20:28 사진의 바닥이 그랬다). 바닥 색은 배경(하늘)색과 달라야 지평선이 보인다." },
  { id: "L5", role: "unity_code", verified: true,
    text: "카메라 near 는 0.3, far 는 100. near 0.01 은 깊이 정밀도를 버려 그림자·z-fighting 이 나빠진다. 3인칭이면 FOV 50~60." },
  { id: "L6", role: "unity_code", verified: true,
    text: "**`using UnityEngine.Rendering.Universal;` 을 쓰지 않는다.** URP 가 없는 프로젝트에서 컴파일이 깨져 시험이 0개가 된다. 포스트 프로세싱(Tonemapping ACES·Bloom 0.2·Vignette 0.2)은 코드로 만들지 말고 howToRun 에 'URP 프로젝트면 Volume 을 추가해 …' 로 사람 손 한 줄로 적는다. 파이프라인이 있는지는 UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline != null 로 안다(이건 어디서나 컴파일된다)." },
  { id: "L7", role: "unity_code", verified: false,
    text: "캐릭터(rigged.fbx 등)를 놓을 때: 키 조명이 얼굴 쪽 앞-위에서 오게(캐릭터가 카메라를 보면 키는 카메라 쪽 위), 캐릭터의 MeshRenderer/SkinnedMeshRenderer 는 shadowCastingMode On + receiveShadows true, 바닥은 그림자를 받는다. 얼굴이 검으면 필 조명이 없는 것이고, 발이 떠 보이면 그림자가 없는 것이다." },
  { id: "L8", role: "unity_code", verified: false,
    text: "동적 물체(플레이어·소품)마다 lightProbes 는 기본값(Blend Probes)으로 둔다. 라이트맵을 굽지 않는 첫 판에서는 실시간 조명만으로 간다 — Lightmapping.Bake 를 코드에서 부르지 않는다(헤드리스에서 멈추거나 오래 걸린다)." },
  { id: "L9", role: "mesh_assets", verified: false,
    text: "Meshy PBR 맵을 유니티에 붙일 때(FBX): 새 Lit 재질에 _diffuse → Albedo, _normal → Normal Map(텍스처 타입을 Normal map 으로), _metallic → Metallic. **Roughness 는 뒤집는다**: 유니티는 Smoothness = 1 − Roughness. GLB 는 재질이 자동으로 붙는다(gltfast). 평평해 보이면 노멀 맵이 안 붙은 것이 첫 원인이다." },
  { id: "L10", role: "blueprint", verified: false,
    text: "기준에 빛을 적는다: '플레이어 발밑에 그림자가 보인다', '그림자 쪽 면이 완전히 검지 않다(필 조명)', '바닥과 하늘이 다른 색이다', '금속만 반짝이고 바닥은 무광이다'. 사진 한 장으로 사람이 확인할 수 있는 문장이다." },

  // ── M. 11회차 (09-05 21:15) — 걷는 법. 교과 과정 6번 ──
  // 읽은 것: 블렌드 트리 글들(Packt·Medium·GameDev Academy), ModelImporter/AnimatorController
  // 스크립트 API(공식), Mixamo/Meshy 휴머노이드 반입 글. 우리 생각: 씬을 코드로 짓는 우리
  // 구조에서는 임포트 설정·Animator 컨트롤러도 전부 코드로 만들어야 한다 — 사람 손 0회.
  // 22:35 첫 사람 캐릭터(Vox → Meshy 리깅 → Dev 씬 빌더)가 동전 줍기 씬에 섰다: 텍스처 붙고,
  // 바닥 위, 그림자, 입력에 움직임. 통과 4 · 떨어짐 0. 세 판 걸렸다(없는 enum 이름 → 흰
  // 캐릭터·공중·분홍 → 통과). M1·M3·M6~M9·M12~M15 확인. M2(클립 굽기)·M4(블렌드 트리)·M5 는 코드에
  // 안 나타나 읽은 것으로 남김 — Dev 는 상태 전이로 걷기/달리기를 갈랐다.
  { id: "M1", role: "unity_code", verified: true,
    text: "리깅된 FBX 는 씬 빌더가 임포트 설정을 코드로 박는다: var imp = AssetImporter.GetAtPath(path) as ModelImporter; imp.animationType = ModelImporterAnimationType.Human; imp.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel; imp.SaveAndReimport(). walking.fbx·running.fbx 도 같은 설정(같은 뼈대라 각자 아바타를 만들어도 리타깃된다)." },
  { id: "M1b", role: "unity_code", verified: true,
    text: "ModelImporterAvatarSetup 의 값은 NoAvatar · CreateFromThisModel · CopyFromOther 셋뿐이다. 'CopyFromOtherAvatar' 는 없다 — 21:50 Dev 가 그 이름으로 컴파일을 깨뜨렸다. 다른 FBX 의 아바타를 쓰려면 imp.avatarSetup = ModelImporterAvatarSetup.CopyFromOther; imp.sourceAvatar = (Avatar)AssetDatabase.LoadAssetAtPath(riggedFbx, typeof(Avatar))." },
  { id: "M2", role: "unity_code", verified: false,
    text: "애니메이션 클립은 제자리(in-place)여야 한다: imp.clipAnimations = imp.defaultClipAnimations 를 받아 각 클립에 loopTime = true, lockRootHeightY = true, lockRootRotation = true, keepOriginalPositionXZ = true(뿌리 이동을 포즈에 굽기) 를 주고 다시 넣는다. 안 그러면 클립이 캐릭터를 끌고 가 컨트롤러와 싸운다(발 미끄러짐의 첫 원인)." },
  { id: "M3", role: "unity_code", verified: true,
    text: "크기: 리깅 출력은 100배 다를 수 있다(E7). 임포트 뒤 모델의 Renderer bounds 높이를 재서 1.6~1.9 m 가 아니면 imp.useFileScale = false; imp.globalScale = 1.75f / 높이 로 맞추고 다시 임포트한다. 씬 인스턴스의 localScale 을 만지지 않는다(A2)." },
  { id: "M4", role: "unity_code", verified: false,
    text: "Animator 컨트롤러도 코드로: UnityEditor.Animations.AnimatorController.CreateAnimatorControllerAtPath(\"Assets/Rookery/<이름>/Player.controller\") → AddParameter(\"Speed\", AnimatorControllerParameterType.Float) → var tree = new BlendTree { name = \"Locomotion\", blendParameter = \"Speed\", blendType = BlendTreeType.Simple1D, useAutomaticThresholds = false } → tree.AddChild(walkClip, 0.5f); tree.AddChild(runClip, 1f) → ctrl.AddMotion(tree) 가 기본 상태. AssetDatabase.AddObjectToAsset(tree, ctrl). 클립은 AssetDatabase.LoadAllAssetRepresentationsAtPath(fbx) 에서 AnimationClip 을 고른다(이름에 __preview__ 가 든 것은 제외)." },
  { id: "M5", role: "unity_code", verified: false,
    text: "Meshy 리깅은 idle 클립을 안 준다(걷기·달리기뿐). 서 있을 때는 animator.speed 를 0 으로 내려 걷기 첫 자세에서 멈추고, 움직이면 1 로 올린다 — 임시. 제대로 된 idle 은 Meshy 애니메이션(600+ 동작)에서 받는다(교과 과정에 추가)." },
  { id: "M6", role: "unity_code", verified: true,
    text: "루트 모션은 끈다(animator.applyRootMotion = false). 이동은 컨트롤러가 한다. 발 미끄러짐을 줄이려면 이동 속도를 클립에 맞춘다: 걷기 1.4~1.8 m/s, 달리기 4~5 m/s. 클립의 AnimationClip.averageSpeed.magnitude 가 0 보다 크면 그 값을 쓴다(굽기 전 클립이면 0)." },
  { id: "M7", role: "unity_code", verified: true,
    text: "Speed 파라미터는 수평 속도 / 달리기 속도(0~1)로, animator.SetFloat(\"Speed\", v, 0.1f, Time.deltaTime) 로 감쇠해서 넣는다. 캐릭터는 움직이는 방향을 본다: transform.rotation = Quaternion.RotateTowards(현재, Quaternion.LookRotation(방향), 720f * Time.deltaTime). 카메라 기준 방향(카메라 forward/right 를 y=0 으로 눕힌 것)으로 입력을 바꾼다." },
  { id: "M8", role: "unity_code", verified: true,
    text: "계층: 루트 GameObject(CapsuleCollider 높이 1.8 중심 y 0.9, Rigidbody freezeRotation, 컨트롤러 스크립트) 아래에 모델 인스턴스를 (0,0,0) 회전 0 으로 자식으로 둔다. 에디터에서는 PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(fbx)) 으로 만든다. Animator 는 모델 인스턴스에 있다(GetComponentInChildren)." },
  { id: "M9", role: "unity_code", verified: true,
    text: "animator.cullingMode = AnimatorCullingMode.AlwaysAnimate — 헤드리스·화면 밖에서도 돌아야 시험이 잰다. Animator.updateMode 는 기본. 캐릭터 파일을 찾을 때는 AssetDatabase.FindAssets(\"rigged t:Model\") 로 찾아 **경로 문자열**에 제목이 든 것을 고른다 — 폴더 이름이 <제목> 또는 <제목>_FAIL 일 수 있다(판정 접미사). **검색어에 한글을 넣지 마라**: FindAssets(\"t:Model 사실적인\") 은 빈 배열을 돌려주고, 그 뒤의 '아무 rigged.fbx' 폴백이 옛 캐릭터를 집었다(09-06 09:07 — 새 캐릭터로 바꿨다고 믿은 두 판이 전부 옛 모델이었다). 후보가 여럿이면 제목이 든 경로 중 가장 최근 폴더를 고르고, 무엇을 골랐는지 Debug.Log 로 남긴다." },
  { id: "M10", role: "unity_code", verified: false,
    text: "캐릭터가 씬에 있으면 그림자·조명 규칙(L7)이 그대로 적용된다: SkinnedMeshRenderer 의 shadowCastingMode On, receiveShadows true, 키 조명은 얼굴 쪽 앞-위." },
  { id: "M13", role: "unity_code", verified: true,
    text: "Meshy FBX 는 텍스처가 파일 안에 묻혀 있다. 그냥 임포트하면 **캐릭터가 새하얗다**(22:24 첫 사람 캐릭터가 그랬다). 씬 빌더가 코드로 꺼낸다 — **그 FBX 가 있는 폴더 안**(예: <캐릭터 폴더>/textures)에. 공용 폴더에 같은 이름(texture_0.png)으로 꺼내면 다른 캐릭터의 옛 텍스처가 남아 얼굴이 안 바뀐다(09-06 09:04). imp.ExtractTextures(폴더) → AssetDatabase.Refresh() → imp.materialImportMode = ModelImporterMaterialImportMode.ImportStandard; imp.materialLocation = ModelImporterMaterialLocation.External; imp.SearchAndRemapMaterials(ModelImporterMaterialName.BasedOnTextureName, ModelImporterMaterialSearch.Local) → imp.SaveAndReimport(). 꺼낸 재질의 셰이더가 null/분홍이면 Standard 로 바꾸고 _MainTex 에 텍스처를 넣는다." },
  { id: "M16", role: "unity_code", verified: true,
    text: "**Meshy FBX 재질은 발광(emission)이 켜져 온다** — 발광 맵 = 베이스컬러 텍스처, 발광색 흰색. 알베도가 빛으로 한 번 더 더해져 얼굴·흰 옷이 하얗게 탄다(09-06 01:15, 조명을 다 꺼도 탔다). 캐릭터 재질을 만질 때 반드시: m.DisableKeyword(\"_EMISSION\"); m.SetTexture(\"_EmissionMap\", null); m.SetColor(\"_EmissionColor\", Color.black)." },
  { id: "M14", role: "unity_code", verified: true,
    text: "캐릭터 루트는 y = 0 에 놓는다(Meshy 는 원점이 발바닥, A8). 캡슐처럼 y = 높이/2 로 올리면 공중에서 떨어지며 시작하고, 자는 '입력 없이 움직인 물체' 로 뺀다 — 22:24 판이 그랬다. CapsuleCollider 는 center (0, 0.9, 0) 높이 1.8 로 루트에." },
  { id: "M15", role: "unity_code", verified: true,
    text: "씬 빌더는 짓고 나서 캐릭터의 모든 Renderer 를 돌며 재질의 shader 가 null 이거나 이름에 'InternalErrorShader' 가 들면 Standard 로 바꾼다. 분홍 조각은 이 검사 하나로 없어진다." },
  { id: "M11", role: "blueprint", verified: false,
    text: "걷기 기준을 적는다: 'W 를 누르면 캐릭터가 걷기 애니메이션으로 앞으로 간다', '키를 놓으면 1초 안에 멈춘 자세로 선다', '움직이는 방향을 본다(뒤로 가면 몸이 돈다)', '발이 바닥 아래로 안 들어간다', 'Shift 면 달리기로 바뀐다'. 사진 한 장과 Play 30초로 사람이 확인한다." },
  { id: "M12", role: "blueprint", verified: true,
    text: "고치는 판에서 **지난 기준은 id 그대로 남긴다.** 여러 개를 '핵심 회귀' 한 줄로 묶지 않는다 — 21:08 판에서 29개가 13개로 묶여 무엇이 유지됐는지 볼 수 없게 됐다. 새 기준은 뒤에 더한다." },

  // ── N. 12회차 (09-05 22:40) — 캐릭터 디테일(생성 후). 교과 과정 6a ──
  // 사장님: "캐릭터 생성 AI 는 최대한 쓰지 말고, 생성된 캐릭터에 디테일을." 22:40 발견:
  // 원본 GLB 엔 노멀·금속거칠기 맵이 있고 리깅 FBX 엔 베이스컬러뿐 — 같은 UV 라 되붙인다.
  // 23:27 진단: 리깅 재질에 bump=normal, mg=metallic_smoothness, 키워드 둘 켜짐(N1 확인), MSAA 4,
  // 카메라 어깨 높이 3.5 m(N8), HeadIK·iKPass(N5). 그래도 사진은 거칠었다 — 캡처가 MSAA 없는
  // 960×540 이었고(시험지 고침), 분홍은 파티클(J5b). 다음 단계는 URP + 후처리(13회차).
  { id: "N1", role: "unity_code", verified: true,
    text: "캐릭터 폴더에 normal.png 와 metallic_smoothness.png 가 있으면(원본 GLB 에서 되찾은 것, R=metallic·A=smoothness 유니티 묶음) 씬 빌더가 리깅 재질에 붙인다: 노멀은 TextureImporter.textureType = TextureImporterType.NormalMap 으로 바꿔 SaveAndReimport 한 뒤 mat.SetTexture(\"_BumpMap\", t); mat.EnableKeyword(\"_NORMALMAP\"). 금속 맵은 ti.sRGBTexture = false 로 두고 mat.SetTexture(\"_MetallicGlossMap\", t); mat.EnableKeyword(\"_METALLICGLOSSMAP\"); mat.SetFloat(\"_GlossMapScale\", 1f). 재질은 캐릭터 인스턴스의 SkinnedMeshRenderer.sharedMaterial(꺼낸 .mat)." },
  { id: "N2", role: "unity_code", verified: true,
    text: "캐릭터 텍스처 임포트: maxTextureSize 2048, anisoLevel 8, mipmapEnabled true, textureCompression = CompressedHQ. 기본 aniso 1 은 비스듬한 청바지가 뭉개진다." },
  { id: "N3", role: "unity_code", verified: true,
    text: "안티앨리어싱: QualitySettings.antiAliasing = 4 (MSAA 4x, Built-in forward). 캐릭터 윤곽의 계단이 사라진다 — 사진에서 제일 먼저 보이는 싸구려 티." },
  { id: "N4", role: "unity_code", verified: true,
    text: "림(rim) 조명: 캐릭터 뒤-위(카메라 반대쪽, 회전 (35, 180+30, 0))에서 오는 Directional 하나, 세기 0.5~0.7, 색 살짝 차게(0.8, 0.9, 1), 그림자 끔. 윤곽에 얇은 빛이 생겨 배경에서 떨어져 보인다. 키·필·림 = 3점 조명 완성." },
  { id: "N5", role: "unity_code", verified: true,
    text: "머리가 가는 곳을 본다(Humanoid IK): Animator 컨트롤러 레이어에 IK Pass 를 코드로 켠다 — var L = ctrl.layers; L[0].iKPass = true; ctrl.layers = L. 캐릭터 스크립트에 void OnAnimatorIK(int layer) { anim.SetLookAtWeight(0.6f, 0.15f, 0.8f, 0f, 0.5f); anim.SetLookAtPosition(목표); } 목표는 이동 방향 앞 5 m(서 있으면 카메라가 보는 앞점). 사람처럼 보이게 하는 가장 싼 한 줄." },
  { id: "N6", role: "unity_code", verified: false,
    text: "발 IK(읽은 것): OnAnimatorIK 에서 각 발 아래로 0.6 m 레이캐스트 → SetIKPositionWeight(AvatarIKGoal.LeftFoot, w); SetIKPosition(goal, hit.point + up*0.05). 서 있을 때 w=1, 걸을 때 0.3. 평평한 바닥에선 차이가 작으니 첫 판엔 넣지 않아도 된다." },
  { id: "N7", role: "unity_code", verified: true,
    text: "상태 전이는 hasExitTime = false, duration 0.15~0.25초. 0 이면 걷기→달리기가 끊기고, 0.5 이상이면 굼뜨다." },
  { id: "N8", role: "unity_code", verified: true,
    text: "3인칭 카메라 프레이밍(읽은 것): 어깨 높이(1.4~1.6 m), 거리 3.5~4.5 m, FOV 55, 오른쪽으로 0.4 m 비껴서 캐릭터가 화면 중앙 아래 1/3 에. 정면 뒤통수 한가운데는 캐릭터도 앞도 안 보인다." },
  { id: "N10", role: "mesh_assets", verified: true,
    text: "재질이 한 장인 캐릭터는 피부·천·청바지·머리가 같은 광택이다. 자가 베이스컬러 색으로 갈라 매끄러움을 준다(피부 0.45 · 흰 천 0.12 · 청바지 0.2 · 머리 0.3 · 그 외 0.25, Meshy 거칠기는 1/4 만). 09-06 05:00 정면 사진: 피부에 살짝 윤기, 셔츠 무광 — 차이는 은은하다. 정면 필 조명이 평평하면 광택 차이가 잘 안 보이니, 키 조명을 옆 45° 로 두면 더 산다." },
  { id: "N11", role: "unity_code", verified: false,
    text: "흰 옷이 푸르스름하면 필·앰비언트 색이 너무 차다. 필 (0.8, 0.85, 1) 은 흰 천에서 파랗게 읽힌다 — 필은 (0.9, 0.92, 1), 앰비언트는 회색 쪽으로. 얼굴 사진에서 셔츠가 흰색으로 읽혀야 한다." },
  { id: "N12", role: "mesh_assets", verified: true,
    text: "피부 질감(16회차): 자가 코드로 타일 모공 노멀(detail_normal.png, 1024, 값 노이즈 + 둥근 움푹)과 피부 마스크(detail_mask.png, 알파)를 만들고, 유니티 창이 URP Lit 의 Detail 슬롯에 얹는다(_DetailNormalMap·_DetailMask, 세기 0.6, 타일 22, 키워드 _DETAIL_MULX2). 09-06 07:21 전후 비교: 플라스틱 같던 얼굴에 은은한 결·모공. 텍스처가 흐린 것(얼굴에 150 px)은 생성 해상도의 한계라 이 방법으로는 안 된다." },
  { id: "N13", role: "mesh_assets", verified: true,
    text: "Meshy Retexture 는 '다시 칠하기' 지 확대가 아니다 — 4K 로 재텍스처해도 원본 2048 보다 흐렸다(09-06 07:35, 텍스트·이미지 스타일 둘 다). 해상도는 **생성 시점**에: image-to-3D texture_resolution 4k(같은 30 크레딧, 피부 고주파 2배). 캐릭터는 4k 기본." },
  { id: "N14", role: "mesh_assets", verified: true,
    text: "얼굴 화질의 원천은 콘셉트 그림의 얼굴 픽셀이다. 1024 전신 그림에서 얼굴은 120 px — 4K 로 칠해도 원천이 그것이다. 콘셉트를 1536 이상으로 그리고 얼굴 클로즈업을 한 장 더 넣어 multi-image-to-3d(meshy-7, 최대 4장)로 만든다(다음 회차)." },
  { id: "M9b", role: "unity_code", verified: true,
    text: "캐릭터를 못 찾으면 **캡슐로 떨어지고 로그에 '못 찾음: 찾은 경로 목록' 을 남긴다.** 다른 캐릭터 폴더로 조용히 대체하지 마라 — 09-06 11:17 '짧은_검은_머리' 필터에 슬래시를 붙여(\"/짧은_검은_머리/\") 못 찾고, 스스로 만든 폴백이 옛 레인저를 골라 두 판이 헛돌았다. 필터는 슬래시 없이 부분 문자열로." },
  { id: "N16", role: "mesh_assets", verified: true,
    text: "옆모습 그림이 없으면 코·턱이 납작하다(사장님 09-06 10:49, 걷기 줄에서). 생성기는 본 각도만 안다. 캐릭터는 정면·뒷모습·**옆모습(프로필) 전신**·얼굴 클로즈업 네 장으로 만든다 — 옆모습이 얼굴과 몸의 두께를 준다." },
  { id: "N15", role: "blueprint", verified: true,
    text: "캐릭터 판정은 사진 셋으로 본다: 3인칭 게임 화면, 정면 얼굴, **옆에서 걷는 넉 장**. 유니티 창이 셋 다 찍어 대화에 붙인다. 걷기 줄에서 보는 것: 발이 바닥을 딛는가(미끄러짐), 어깨·팔꿈치가 뒤틀리지 않는가(스키닝), 옷이 몸을 따라오는가." },
  { id: "N9", role: "blueprint", verified: false,
    text: "캐릭터 디테일 기준: '옷 주름·머리결이 빛 방향에 따라 명암이 진다(노멀 맵)', '청바지는 무광이고 피부는 살짝 매끈하다(금속·매끄러움 맵)', '캐릭터 윤곽에 계단이 없다(MSAA)', '캐릭터 뒤쪽 윤곽에 얇은 빛이 있다(림)', '걷는 방향으로 머리가 돈다(IK)'. 전부 사진 한 장으로 확인된다." },

  // ── O. 13회차 (09-05 23:28~00:33) — URP + 후처리를 코드로. 창의 일이지만 Dev 도 알아야 한다 ──
  { id: "O1", role: "unity_code", verified: true,
    text: "프로젝트는 URP 일 수 있다(로키 창의 'URP + 후처리 켜기'). URP 에서 Standard·Legacy 셰이더 재질은 **분홍**이다 — 00:00 사진의 바닥·동전이 그랬다. 재질은 반드시 Lit()/Tint()/Surface() 도우미로만 만든다. 씬 빌더뿐 아니라 **런타임 스크립트**(GameManager 등)에서 만드는 재질도 같다 — 창의 안전망은 지은 씬만 바꿀 수 있고 런타임 재질은 못 잡는다." },
  { id: "O2", role: "unity_code", verified: true,
    text: "URP 후처리(Volume·카메라 데이터)는 씬을 새로 지으면 사라진다. 창이 지은 뒤마다 다시 씌우지만, 빌더가 카메라를 두 대 만들거나 Volume 을 지우면 깨진다. 카메라는 한 대, 'Rookery Post' 물체는 건드리지 않는다." },
  { id: "O3", role: "unity_code", verified: true,
    text: "파티클 렌더러 재질은 URP 에서 'Universal Render Pipeline/Particles/Unlit', Built-in 에서 'Particles/Standard Unlit'. Shader.Find 로 앞을 먼저 찾고 없으면 뒤로." },

  // ── P. 14회차 (09-06 00:35) — 살아 있는 서 있기·발 IK·얼굴 사진. 캐릭터만(사장님 '끝' 까지) ──
  // 읽은 것: 애니메이션 시스템은 Update 뒤 LateUpdate 전에 뼈를 쓴다 — 덮어쓰려면 LateUpdate
  // (Unity 포럼·DeepMotion). idle 은 2~4초 호흡, 8~12초 무게 이동(MoCap Online). 발 IK 는
  // 발 뼈에서 아래로 레이캐스트해 hit.point·hit.normal 로(Yarsa Labs·Lem Apperson).
  { id: "P1", role: "unity_code", verified: true,
    text: "서 있을 때 '얼어 있는' 캐릭터는 죽어 보인다(animator.speed = 0 의 대가, M5). 생성 AI 없이 코드로 살린다 — 휴머노이드 뼈를 **LateUpdate** 에서 살짝 더 돌린다(애니메이터가 쓴 뒤라 덮인다): 숨 = Chest 를 x 축으로 ±1.5° · 주기 3.5초(sin), Spine ±0.7°; 무게 이동 = Hips 를 x 로 ±0.015 m · 주기 8초; 머리 미세 끄덕임 ±0.8° · 주기 5초(위상 다르게). 속도가 0.05 이하일 때만 weight 를 1 로 올리고(0.3초 감쇠), 걸을 때는 0. 뼈는 animator.GetBoneTransform(HumanBodyBones.Chest/Spine/Hips/Head)." },
  { id: "P2", role: "unity_code", verified: true,
    text: "발 IK(휴머노이드, OnAnimatorIK): 컨트롤러 레이어 iKPass 켜기(N5). 각 발 뼈 위치 + 위 0.5 m 에서 아래로 1 m 레이캐스트(바닥 레이어), 맞으면 SetIKPositionWeight/RotationWeight(goal, w); SetIKPosition(goal, hit.point + hit.normal * 0.06f); SetIKRotation(goal, Quaternion.FromToRotation(Vector3.up, hit.normal) * transform.rotation). w 는 서 있을 때 1, 걸을 때 0.3(감쇠). 평평한 바닥에서도 발이 바닥을 정확히 딛는 것이 보인다." },
  { id: "P3", role: "unity_code", verified: true,
    text: "얼굴이 보이는 순간의 조명: 캐릭터 앞(카메라 쪽) 위 45° 에 **캐릭터 전용 필** Spot(range 4 m, 그림자 끔)을 루트의 자식으로. 세기는 **0.12~0.18**. 00:58 얼굴 필 0.3 에 키 1.0·필 0.35 가 겹쳐 흰 셔츠와 얼굴이 하얗게 날아갔다(URP·ACES·블룸)." },
  { id: "P5", role: "unity_code", verified: true,
    text: "**흰 표면에 닿는 빛의 합이 1.0 을 넘지 않게 한다.** URP + ACES 톤매핑 + 블룸에서는 알베도 0.9 짜리 흰 옷이 합 1.3 만 돼도 하얗게 타고 블룸까지 번진다. 기본값: 키 0.75, 필 0.25, 림 0.4(뒤라 앞과 안 겹침), 얼굴 필 0.15. 밝기가 모자라면 앰비언트를 올리지 조명을 더 세게 하지 않는다." },
  { id: "P4", role: "blueprint", verified: true,
    text: "캐릭터 기준엔 정면 사진을 넣는다: '서 있으면 3초 안에 가슴이 오르내린다', '발바닥이 바닥에 닿아 있다(떠 있거나 묻히지 않는다)', '정면 사진에서 얼굴이 검지 않다'. 유니티 창이 정면 얼굴 사진을 같이 찍어 준다." },

  // ── C. 범위·설계 (설계도) ──
  { id: "C1", role: "blueprint", verified: true,
    text: "첫 조각은 한 화면·한 조작·한 목표. 만들기→시험→다듬기→내보내기를 한 번 끝까지 돌리는 것이 목표다." },
  { id: "C2", role: "blueprint", verified: true,
    text: "합격 기준을 코드보다 먼저 쓴다. '빠르다' 가 아니라 '50개에서도 부드럽다' 처럼 사람이 눌러 볼 수 있는 문장으로." },
  { id: "E5", role: "blueprint", verified: true,
    text: "규격은 문턱 숫자보다 '무엇을 재는가' 부터 틀릴 수 있다. 자가 엉뚱한 것을 재면 좋은 것이 떨어진다 — 닫힘 규칙이 그랬다." },
  { id: "J13", role: "blueprint", verified: true,
    text: "기준에 **반응**을 적는다. '동전을 먹으면 사라진다' 는 기계 기준이다. '동전을 먹으면 사라지고, 그 자리에서 알갱이가 터지고, 점수 글자가 튄다' 처럼 플레이어의 모든 의미 있는 행동(줍기·점프·맞기·클리어)마다 눈에 보이는 반응 하나 이상을 기준으로 둔다. 확인할 수 있는 문장이다 — 사람이 Play 해서 본다." },
  { id: "J14", role: "blueprint", verified: false,
    text: "순서: ① 조작이 즉시 반응한다 ② 세계가 예측 가능하다(바닥을 안 뚫고, 벽이 막는다) ③ 그 다음이 손맛(연출). ①② 가 안 되면 ③ 은 헛것이다. 첫 판은 ①② 로 자를 통과하고, 고치는 판에서 ③ 을 얹는다." },
  { id: "C3", role: "blueprint", verified: false,
    text: "자산 목록에는 담당과 형식을 적는다: 캐릭터는 FBX·Humanoid·A-pose(Vox), 소품은 GLB(Vox), 코드·씬은 C#(Dev), 효과음은 나중에." },
];

/** 프롬프트에 붙일 글. 확인된 것과 읽은 것을 갈라 적는다 — 섞으면 둘 다 값을 잃는다. */
export function renderGamedevLessons(role: LessonRole): string {
  const mine = GAMEDEV_LESSONS.filter((l) => l.role === role);
  if (mine.length === 0) return "";
  const line = (l: Lesson) => `- [${l.id}] ${l.text}`;
  const verified = mine.filter((l) => l.verified);
  const read = mine.filter((l) => !l.verified);
  return (
    "\n\n## 게임 제작에서 배운 것\n" +
    (verified.length ? "우리 판에서 확인된 것:\n" + verified.map(line).join("\n") + "\n" : "") +
    (read.length ? "읽어서 아는 것(아직 우리 판에서 안 밟음 — 맞다고 단정하지 말고, 어긋나면 결과에 적어라):\n" + read.map(line).join("\n") + "\n" : "")
  );
}
