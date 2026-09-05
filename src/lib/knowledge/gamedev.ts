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
  { id: "F3", role: "mesh_assets", verified: false,
    text: "유니티 임포트에서 Normals 는 Import(Calculate 아님), Read/Write 는 끈다. 모델이 안 보이면 Transform 크기 0·뒤집힌 법선·재질 없음 셋 중 하나다." },

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
  { id: "J1", role: "unity_code", verified: false,
    text: "한 행동에 반응 하나로는 부족하다 — 겹친다. 줍기 하나에 크기 튐 + 알갱이 + 카메라 살짝 흔들림 + 점수 글자 튐(+ 나중에 소리). 글들은 큰 사건에 4~10개를 겹치라 한다. 반응이 하나뿐인 게임은 '아무 일도 안 일어난' 것처럼 읽힌다." },
  { id: "J2", role: "unity_code", verified: false,
    text: "소품에 생명: 동전·열쇠·보석은 제자리에서 돈다(transform.Rotate(0, 90~180 * deltaTime, 0)) 하고 위아래로 뜬다(y = 기준 + Mathf.Sin(time * 2~3) * 0.1~0.2). 가만히 선 소품은 배경으로 읽혀 플레이어가 주우려 하지 않는다." },
  { id: "J3", role: "unity_code", verified: false,
    text: "줍는 순간: 콜라이더를 먼저 끈다(두 번 세어지는 것 방지) → 크기를 1.3배로 튀겼다가 0.15초에 0 으로 줄인다 → SetActive(false). Destroy 는 안 쓴다(R 로 되돌리기가 되게). 숫자는 글의 것: 찌그러짐·늘림은 0.8×1.2 를 2~5 프레임." },
  { id: "J4", role: "unity_code", verified: false,
    text: "**사라지는 물체의 연출은 그 물체가 돌리지 않는다.** 코루틴은 주인이 비활성화·파괴되면 같이 멈춘다 — 동전이 자기 코루틴으로 줄어들다 SetActive(false) 하면 그 뒤 줄은 안 돈다. 매니저(GameManager)나 전용 연출 컴포넌트가 StartCoroutine 한다." },
  { id: "J5", role: "unity_code", verified: false,
    text: "알갱이(파티클)는 자산 없이 코드로 만든다: new GameObject + AddComponent<ParticleSystem>. main.startLifetime 0.3~0.6, startSpeed 2~4, startSize 0.05~0.15, emission.rateOverTime 0, emission.SetBursts(new[]{ new ParticleSystem.Burst(0f, 12~20) }), shape Sphere 반지름 0.1. 터뜨릴 때 transform.position 옮기고 Play(). 하나 만들어 재사용 — 매번 Instantiate 하지 않는다. 렌더러 재질은 Shader.Find 결과를 검사한다(G8)." },
  { id: "J6", role: "unity_code", verified: false,
    text: "카메라 흔들림은 카메라 자신이 아니라 **부모(rig) 의 localPosition** 에 준다. 시작 값을 기억했다가 되돌린다. 글의 수치: 4px·5프레임·감쇠 → 3D 에서는 진폭 0.05~0.1 m, 0.1~0.2초, 매 프레임 진폭 × 0.8. 큰 사건(클리어·맞음)에만. 줍기마다 흔들면 멀미다 — 일정한 흔들림은 금지." },
  { id: "J7", role: "unity_code", verified: false,
    text: "UI 튐: 점수 글자를 0.9 → 1.2 → 1.0 으로 0.1~0.15초(RectTransform.localScale). 클리어 글자는 크기 0 에서 튀어나온다(overshoot: 1.2 찍고 1.0). 글은 2~3 프레임이라 하지만 사람이 보려면 0.1초는 되어야 한다 — 우리 생각." },
  { id: "J8", role: "unity_code", verified: false,
    text: "움직임에 easing 을 쓴다. Lerp(a, b, t) 의 t 를 그대로 넣지 말고 1 - (1-t)^3(ease-out) 또는 Mathf.SmoothStep 으로. 선형은 기계처럼 보인다. 카메라 따라가기도 SmoothDamp." },
  { id: "J9", role: "unity_code", verified: false,
    text: "시간 정지(hit-stop)는 타격에만 40~80 ms — Time.timeScale = 0 뒤 복귀. 그동안 deltaTime 도 0 이므로 복귀는 WaitForSecondsRealtime, 정지 중 돌아야 할 UI 는 unscaledDeltaTime. 줍기에는 안 쓴다." },
  { id: "J10", role: "unity_code", verified: false,
    text: "3D 첫 씬의 배경 디테일 다섯: 바닥 색과 물체 색 대비(같은 회색 금지), 카메라 배경색(하늘색), Directional Light 그림자 켜기(shadows = LightShadows.Soft), 옅은 안개(RenderSettings.fog = true, fogColor = 배경색, fogDensity 0.01~0.02), 바닥 가장자리가 보이면 벽·울타리. 이 다섯이 없으면 '회색 상자 위의 캡슐' 로 보인다." },
  { id: "J11", role: "unity_code", verified: false,
    text: "소리는 나중이지만 **자리는 지금** 만든다(사장님: 효과음은 나중에). AudioSource 하나와 PlayPickup()/PlayClear() 같은 빈 함수를 두고 clip 이 null 이면 아무것도 안 한다. 나중에 클립만 끼우면 되게." },
  { id: "J12", role: "unity_code", verified: false,
    text: "플레이어 조작 반응이 먼저다. 입력 지연은 어떤 연출로도 못 살린다(글들의 첫 번째 규칙). 이동은 Update 에서 입력 읽어 Rigidbody 는 FixedUpdate 에서(B1), 점프가 있으면 coyote time·input buffer 100~150 ms." },

  // ── C. 범위·설계 (설계도) ──
  { id: "C1", role: "blueprint", verified: true,
    text: "첫 조각은 한 화면·한 조작·한 목표. 만들기→시험→다듬기→내보내기를 한 번 끝까지 돌리는 것이 목표다." },
  { id: "C2", role: "blueprint", verified: true,
    text: "합격 기준을 코드보다 먼저 쓴다. '빠르다' 가 아니라 '50개에서도 부드럽다' 처럼 사람이 눌러 볼 수 있는 문장으로." },
  { id: "E5", role: "blueprint", verified: true,
    text: "규격은 문턱 숫자보다 '무엇을 재는가' 부터 틀릴 수 있다. 자가 엉뚱한 것을 재면 좋은 것이 떨어진다 — 닫힘 규칙이 그랬다." },
  { id: "J13", role: "blueprint", verified: false,
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
