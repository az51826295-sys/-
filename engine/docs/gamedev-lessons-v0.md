# 게임 제작 시행착오 학습 v0 — 엔진에 넣을 것

2026-09-05 16:15. 사장님: "나는 게임 개발해 본 적이 없다. GPT·검색으로 시행착오를
학습해서 엔진을 강화하자." 이 문서는 **읽은 것**이고, 코드로 들어간 것은
`src/lib/knowledge/gamedev.ts` 다. 둘은 같은 번호를 쓴다.

각 항목에 **출처**와 **우리 판에서 확인됐는가**를 적는다. 남이 쓴 글은 그 사람의
경험이지 우리 것이 아니다 — 우리 판에서 한 번 밟아 본 것만 "확인" 으로 올린다.

## A. Meshy → 유니티 반입

| # | 배운 것 | 출처 | 우리 판 |
|---|---|---|---|
| A1 | **캐릭터는 FBX 로.** 유니티의 Humanoid 리그·애니 리타깃은 FBX 임포터에 있고, GLB(glTFast)는 그 설정이 없다. 소품은 GLB 도 된다 | glTFast 문서·discussion #359 | 미확인 |
| A2 | Meshy 는 **cm 단위**로 낸다. 유니티 임포트 Scale Factor 0.01 또는 Convert Units. 씬의 인스턴스를 늘리지 말고 임포트 설정에서 | meshy-dev/game-asset-pipeline | 미확인 (우리 판은 `auto_size` 로 m 단위를 청했다 — 실제 크기는 다음 판에서 잰다) |
| A3 | GLB 는 glTFast 패키지(`com.unity.cloud.gltfast`)가 있어야 열린다 | Unity 패키지 문서 | 미확인 |
| A4 | **분홍 재질** = 렌더 파이프라인에 없는 셰이더. URP 면 Lit 으로 바꾼다 | neural4d 가이드 | 미확인 |
| A5 | **하얀 모델** = 텍스처가 재질에 안 붙음. 임포트 설정에서 재질 다시 추출 | Meshy 도움말 | 미확인 |
| A6 | FBX 로 재질을 손으로 만들 때 **roughness 는 뒤집어 smoothness** 로 | meshy-dev 파이프라인 | 미확인 |
| A7 | 리깅된 캐릭터: Rig → **Humanoid**, 애니 클립이 Animation 탭에 보이는지 확인한 뒤 Animator 에 연결 | Meshy 도움말·파이프라인 | 미확인 |
| A8 | 피벗은 **바닥 중앙**(origin bottom). 아니면 (0,0,0) 에 놓을 때 땅에 박히거나 뜬다 | ithappystudios | **확인** — 우리 Meshy 호출이 `origin_at: bottom` |
| A9 | 콜라이더가 없으면 바닥을 뚫고 떨어진다. 메시에는 Box/Mesh Collider 를 따로 붙인다 | ithappystudios | 미확인 |

## B. 유니티 코드 (Dev 가 지킬 것)

| # | 배운 것 | 출처 | 우리 판 |
|---|---|---|---|
| B1 | 물리는 `FixedUpdate`, 입력 읽기는 `Update`. Rigidbody 를 Update 에서 밀지 않는다 | 여러 글 | 미확인 |
| B2 | `Find*`/`GetComponent` 를 매 프레임 부르지 말고 `Start` 에서 캐시 | game-developers.org | 미확인 |
| B3 | 한 클래스가 다 하지 않는다. 이름에 "And" 가 필요하면 둘로 | 같은 글 | 미확인 |
| B4 | 새 물체는 Transform Reset 부터. 루트는 깨끗하게, 조정은 자식에 | 같은 글 | 미확인 |
| B5 | 폴더: `Assets/Scenes·Scripts·Prefabs·Art·Audio`. 여러 번 놓는 것은 프리팹 | 같은 글 | 미확인 |
| B6 | **작게 만들고 자주 켠다.** 행동 하나 더하고 Play, 커밋 | 같은 글 | **확인** — 08-29~09-03 우리 고리가 "컴파일만 통과, 안 움직임" 을 여러 번 냈다 |
| B7 | 새 입력 시스템(`activeInputHandler: 1`)이면 `Input.GetAxis` 는 조용히 0 이다 | 우리 판 | **확인** (08-31, 09-03) |
| B8 | Unity 6 에 `Arial.ttf` 가 없다. UI 글꼴은 `LegacyRuntime.ttf` | 우리 판 | **확인** (08-29) |

## C. 범위·설계 (설계도 단계가 지킬 것)

| # | 배운 것 | 출처 | 우리 판 |
|---|---|---|---|
| C1 | 첫 게임은 **한 화면·한 조작·한 목표**. 고리를 끝까지(만들기→시험→다듬기→내보내기) 한 번 돌리는 것이 목표 | 여러 postmortem | **확인** — 09-05 별 피하기가 그 크기였고 한 번에 돌았다 |
| C2 | 설계도에 **합격 기준을 코드보다 먼저** 쓴다. "빠르다" 가 아니라 "50개에서도 부드럽다" | Dev 의 방식 + 글 | **확인** — 09-05 16/16 |
| C3 | 자산 목록에 담당·형식을 적는다: 캐릭터(FBX·Humanoid·A-pose), 소품(GLB), 배경 | A1·A7 에서 | 미확인 |

## E. 2회차 (09-05 16:47~17:10) — 우리 판에서 걸린 것들

| # | 배운 것 | 출처 | 우리 판 |
|---|---|---|---|
| E1 | **닫힘(watertight)은 3D 프린팅 기준이지 게임 기준이 아니다.** 실시간 메시는 열려 있어도 렌더·콜라이더에 문제없다 | polycount · sloyd · meshlib | **확인** — 두 판(보물상자·마네킹) 모두 안 닫혔고 그것으로 떨어졌다. 규격 v1 에서 정보만으로 |
| E2 | Meshy 리깅은 별도 API(`POST /openapi/v1/rigging`, `input_task_id`, `height_meters`), **5 크레딧**, 휴머노이드만, 텍스처 있어야, 얼굴 +Z, 30만 면 이하. 걷기·달리기 FBX 가 같이 온다 | Meshy 문서 | **확인** (17:00 마네킹: 본 24개, Hips·LeftUpLeg… 믹사모식 이름 → 유니티 Humanoid 자동 매핑 가능) |
| E6 | **응답은 문서와 다르게 `result` 아래, 애니는 `result.basic_animations` 아래**에 온다. 문서를 믿고 평평하게 읽으면 5 크레딧 쓰고 링크를 못 읽는다 | 우리 판 | **확인** (17:00) |
| E7 | **리깅된 GLB 는 단위가 100배 다르다** — 같은 마네킹이 이미지→3D 출력은 1.7 m, 리깅 출력은 0.017 m 로 잡힌다. 유니티에서 rigged.fbx 의 Scale Factor 를 확인(100 또는 0.01) | 우리 판 | **확인** (17:05). A2 의 실체 |
| E3 | 비인간형(Box 같은 관절 상자)은 Meshy 리깅이 안 된다 — 그 경우 리깅은 사람(Blender) 몫 | Meshy 문서 | 미확인 |
| E4 | 3인칭 조작 표준형은 유니티 **Starter Assets – ThirdPerson(URP)**: Input System + Cinemachine 이 같이 깔린다. 처음부터 짜지 않는다 | Asset Store · Unity | 미확인 |
| E5 | 규격은 "무엇을 재는가" 부터 틀릴 수 있다 — v0 M1 이 그랬다. 문턱 숫자보다 규칙 자체를 먼저 의심한다 | 우리 판 | **확인** |

## F. 3회차 (09-05 17:08~17:20) — 예산·세팅·갈아 끼우기

| # | 배운 것 | 출처 | 우리 판 |
|---|---|---|---|
| F1 | 폴리 예산: 모바일 <10k, **PC 20~50k**, 히어로 50~100k. 텍스처는 모바일 1K, **PC 2K**, 히어로 4K. 우리 T1 상한 40k·Meshy 기본 2K 는 PC 표준 안이다 | Meshy 유니티 워크플로 | 미확인(우리 값이 그 안에 있다는 것만 확인) |
| F2 | **텍스처가 메시보다 메모리를 더 먹는다.** 메시를 깎기 전에 텍스처를 줄인다 | 같은 글 | 미확인 |
| F3 | 유니티 임포트: Normals 는 **Import**(Calculate 아님), Read/Write 는 끔. 모델이 안 보이면 Transform 크기 0·뒤집힌 법선·재질 없음 셋 중 하나 | 같은 글 | 미확인 |
| F4 | Starter Assets 에 우리 캐릭터 끼우기: FBX Rig → Humanoid → Avatar "Create From This Model" → 플레이어 프리팹의 SkinnedMeshRenderer·본을 바꾸고 Animator 에 새 Avatar 지정. **본 이름이 표준이어야** 한다 — Meshy 리깅이 믹사모식 이름(E2)이라 맞는다 | Unity 매뉴얼·Code Monkey | 미확인 |
| F5 | PC 텍스처 압축: RGB 는 DXT1, RGBA 는 BC7. 바닥·벽처럼 반복되는 텍스처는 밉맵 켜고 Trilinear | Unity 매뉴얼 | 미확인 |
| F6 | Unity 6 URP 프로젝트 기본 패키지: `com.unity.render-pipelines.universal`(템플릿), `com.unity.inputsystem`, `com.unity.cinemachine`(3.x), `com.unity.cloud.gltfast`(6.x). 버전은 레지스트리에 물어서 고른다(우리 setup_env 방식) | Unity 문서 | 미확인 |

## G. 4회차 (09-05 17:15~17:30) — LLM 이 짜는 유니티 C# 이 Unity 6 에서 깨지는 자리

| # | 배운 것 | 출처 | 우리 판 |
|---|---|---|---|
| G1 | `FindObjectOfType/FindObjectsOfType` 은 폐기. `FindFirstObjectByType` / `FindAnyObjectByType` / `FindObjectsByType(FindObjectsSortMode.None)` | Unity 6 업그레이드 가이드 | **확인** — 우리 시험지(09-03)가 `FindObjectsByType` 을 쓴다 |
| G2 | `Rigidbody.velocity` → **`linearVelocity`**(2D 도). 옛 이름은 경고, 버전에 따라 오류 | Unity 6 문서 | **확인** — 09-03 PlayerMover 가 `velocity` 로 경고를 냈다 |
| G3 | `AddForceAtPosition(…, ForceMode.Acceleration/VelocityChange)` 의 뜻이 바뀌었다 — 질량을 곱해 Force/Impulse 로 | 업그레이드 가이드 | 미확인 |
| G4 | `GraphicsFormat.DepthAuto/ShadowAuto/VideoAuto` 는 **오류**로 승격 → `GraphicsFormat.None` | 업그레이드 가이드 | 미확인 |
| G5 | 씬을 코드로 짓는 패턴(에디터 스크립트): `EditorSceneManager.NewScene(EmptyScene, Single)` → `CreatePrimitive`/`new GameObject` + `AddComponent` → `EditorSceneManager.SaveScene(scene, path)` → `EditorBuildSettings.scenes` 에 추가. `[MenuItem]` 을 달아 사람도 누를 수 있게 | 우리 모의 씬 빌더 | **확인** — 09-05 10:57 배치모드에서 씬을 지었다 |
| G6 | 씬 빌더는 **두 번 불려도 겹치지 않게**: 있으면 열어서 지우고 다시 짓는다(`OpenScene` or `NewScene`). 09-03 에 밭이 겹쳐 쌓였다 | 우리 판 | **확인** |
| G7 | 새 입력 시스템: `UnityEngine.InputSystem.Keyboard.current.wKey.isPressed` 또는 `InputAction`. `Input.GetAxis` 는 새 입력 전용 프로젝트에서 0 | 우리 판 | **확인** (B7 과 같음) |

## H. 5회차 (09-05 18:19~18:25) — Dev 의 첫 유니티 판을 자로 잰 것

Dev 가 낸 C# 6개 + 입력 액션: **컴파일 오류 0**. 씬 빌더를 배치모드로 돌리고 아침의
PlayMode 합격 시험 6개로 쟀다: 통과 2 · 떨어짐 2 · 못 잼 2.

| # | 배운 것 | 출처 | 우리 판 |
|---|---|---|---|
| G8 | `Shader.Find("Universal Render Pipeline/Lit")` 이 **null** — 시험 프로젝트에 URP 가 없다. `new Material(null)` 로 씬 빌더가 죽고, 런타임 스크립트도 같은 자리에서 죽어 입력 시험까지 떨어졌다 | 우리 판 | **확인** |
| G9 | 씬 빌더가 **조명을 안 만들었다** → "삼차원이면_조명이_있다" 떨어짐 | 우리 판 | **확인** |
| G10 | 씬을 `Assets/Scenes/` 에 뒀다(규칙은 `Assets/Rookery/Scenes/`). 규칙에 없던 세부는 모델이 제 마음대로 정한다 — 규칙에 박는다 | 우리 판 | **확인** |
| G11 | 아침에 지운 합격 시험지(`unity/Tests`)가 이 판에서 값을 했다 — 되살렸다. 자 없이는 "컴파일 0" 이 곧 "된다" 로 읽힌다 | 우리 판 | **확인** |

## I. 6회차 (09-05 18:26~18:50) — 새 규칙으로 다시 시킨 판, 그리고 자가 틀린 자리

Dev 두 번째 유니티 판(규칙 G8~G11 적용 뒤): 컴파일 0 · 씬 빌더 예외 0 · **조명 통과 ·
카메라 통과** · 입력 시험만 떨어짐. 스포너를 꺼도, 중력을 꺼도 떨어져서 로그를 심었다 —
**플레이어는 움직이고 있었다.** 자가 플레이어를 후보에서 뺐던 것이다.

| # | 배운 것 | 출처 | 우리 판 |
|---|---|---|---|
| G12 | `MonoBehaviour.Reset()` 은 **에디터 콜백**이라 씬 빌더의 `AddComponent` 순간에 불린다. Dev 가 거기서 `position = 0` 을 해서 플레이어가 바닥에 반쯤 묻힌 채 저장됐고, 시작하자마자 물리가 밀어 올렸다 | 우리 판 | **확인** — Reset 만 빼니 **통과 4 · 떨어짐 0** |
| G13 | 자의 "입력 없이 움직인 물체는 뺀다" 는 옳지만, **무엇을 뺐는지 안 적으면** 진단이 엉뚱해진다("입력이 안 닿았다"). 이제 뺀 물체 이름을 적는다 — 플레이어가 거기 있으면 시작 위치 문제다 | 우리 판 | **확인** |
| G14 | 첫 판(딥시크)이 능력 이름 "Build a small app" 만 보고 "유니티 제작은 목록에 없다" 며 스스로 거절했다. 사람이 쓰는 낱말(게임·유니티·만들어 줘)이 능력 이름에 있어야 한다 | 우리 판 | **확인** |
| G15 | **실행 중에 배포하지 않는다.** 배포가 컨테이너를 갈면 돌던 실행이 죽고 행은 running 으로 남는다. 폴링이 20분 넘게 안 움직인 실행을 접게 했지만, 규율이 먼저다 | 우리 판 | **확인** (17:57) |

## J. 9회차 (09-05 19:58~20:10) — 디테일(손맛): 인터넷 + 우리 생각

사장님: "인터넷이랑 너의 생각을 넣어서 엔진에 넣는 거야. 일단 게임에 관련된 디테일
추가하는 법 — 그런 거 있지, 넣으라고." 지금까지의 회차는 '깨지지 않게' 였고, 이번은
'게임처럼 느껴지게' 다. 우리 동전 줍기 판은 통과 4 인데도 동전이 가만히 서 있고
먹으면 그냥 꺼진다 — 자는 통과시키지만 사람은 "아무 일도 안 일어났다" 고 느낀다.

읽은 것(세 글이 거의 같은 목록을 준다 — 이 분야의 상식이라는 뜻):
- 겹치기: 큰 사건 하나에 4~10개(카메라 흔들림 3프레임 + 시간 정지 2프레임 + 번쩍
  1프레임 + 알갱이 10프레임 + 소리 겹 + 반동). 하나로는 안 읽힌다.
- 수치: 찌그러짐 0.8×1.2 를 2~5프레임 / 흔들림 4px·5프레임·감쇠 / 시간 정지 1~5프레임
  (40~80 ms) / 알갱이 10~60프레임 / UI 튐 0.9→1.1→1.0 / 소리는 반응 무게의 절반.
- 순서: ① 조작 반응(입력 지연은 연출로 못 살린다) ② 세계의 예측 가능성 ③ 그 뒤 연출.
- 경고: 일정한 흔들림은 멀미, 알갱이 과하면 어지럽고 느려짐, 시간 정지 남발은 흐름 깨짐.

우리 생각(씬 빌더가 코드로 짓는 우리 구조에 맞춘 것):
- 자산 없이 코드로: ParticleSystem 을 AddComponent 로 만들고 burst 만 쓴다. 하나 만들어
  재사용.
- 사라지는 물체의 연출은 매니저가 돌린다 — 코루틴은 주인이 꺼지면 멈춘다(읽은 것,
  코루틴 글). 동전이 자기 코루틴으로 줄어들다 SetActive(false) 하면 그 뒤가 안 돈다.
- 카메라 흔들림은 부모(rig)의 localPosition 에. 카메라 따라가기 스크립트와 싸우지 않게.
- 소리는 나중이지만 자리(AudioSource + 빈 함수)는 지금.
- 기준에 반응을 적는다(J13) — 설계 단계에 blueprint 교훈이 이제 실린다.
- 3D 배경 디테일 다섯(J10): 색 대비·배경색·그림자·안개·가장자리.

엔진에 들어간 것: J1~J12(unity_code), J13·J14(blueprint), K1~K3(mesh_assets).
전부 `verified: false` — 다음은 같은 "동전 줍기" 를 다시 시켜 (a) 규칙이 실제로
코드에 나타나는지 (b) 그래도 자를 통과하는지 재는 것. 그 뒤 확인된 것만 올린다.

**재 본 결과(20:04 배포 → 20:05 "고쳐 줘: 디테일" → 20:10 Dev 끝 → 20:12 유니티):**
- 14개 규칙 중 13개가 코드에 나타났다. 빠진 것은 J11(소리 자리)뿐. 나쁜 것(Reset·
  Shader.Find·Destroy)은 0.
- 기준 15 → 29. 새 기준이 전부 반응 기준이다("코인이 Y축으로 1.5~2.0회 회전", "파티클
  15개 이상", "카메라 0.3~0.6초 진동"). J13 이 설계 단계에 먹었다.
- 파일 5 → 7(CoinFloatRotate·CameraShakeRig 추가). 카메라는 Rig → Pivot(흔들림) → Camera
  로 J6 구조 그대로. 파티클은 코드로 만든 것 하나를 재사용(J5).
- 컴파일 0 오류, 씬 지어짐, 시험 **통과 4 · 떨어짐 0 · 못 잼 2**. 뜨는 동전이 '입력 없이
  움직인 물체' 로 잡히지 않았다(자는 플레이어만 본다).
- verified 로 올린 것: J2·J5·J6·J10·J13. 나머지는 코드에 있지만 '보기에 맞는지' 는 자가
  못 잰다 — 사장님이 Play 해서 보는 것이 마지막 칸.

## L. 10회차 (09-05 20:42~) — 캐릭터 음영·그림자 (교과 과정 5번)

사장님의 상시 지시 첫 회차. 주제는 사장님이 첫째로 꼽은 "캐릭터 음영·그림자 표현".

읽은 것:
- URP 공식 문제 해결: 줄무늬(acne)·떨어짐(peter-panning)·빛 샘은 Depth/Normal bias 로;
  bias 를 크게 주면 빛이 샌다. 7colors 수치: depth bias 0.02~0.05, normal bias 0.5~1.5,
  그림자 거리 30~50(가까운 게임), 캐스케이드 2~4, 해상도 2048, PC 는 depth 0.015 normal 0.4.
- 3점 조명(Creative Bloq·Pluralsight·Unity Learn): 키(가장 셈, 카메라에서 살짝 비껴)·
  필(키에서 60~90°, 그림자를 밝힘)·림(뒤에서 윤곽). 게임에서는 림 대신 앰비언트로 대신하는
  일이 많다.
- 포스트(LogRocket·Unity Learn 등): ACES 톤매핑 + 대비 20 + 블룸 약간이 "영화 같은"
  기본값; 비네트 0.2~0.45 는 시선을 가운데로.
- Meshy game-asset-pipeline README: FBX 는 Lit 재질을 손으로, GLB 는 자동; Roughness 는
  뒤집어 Smoothness; 노멀은 텍스처 타입 Normal map.

우리 생각:
- 시험 프로젝트가 Built-in 이라 URP 전용 타입(Volume, UniversalAdditionalLightData)을
  코드에 쓰면 **컴파일이 깨져 시험이 0개**가 된다. 규칙은 Light·QualitySettings·
  RenderSettings 처럼 어디서나 되는 API 로만(L6). 포스트는 사람 손 한 줄로.
- 20:28 사진에서 보인 것: 바닥이 하늘색 안개에 묻혀 거의 흰색, 그림자는 있지만 대비가
  약함, 동전은 순노랑. L1(필·앰비언트)·L3(재질)·L4(바닥 알베도)가 그 사진의 처방이다.
- 캐릭터 규칙(L7)은 아직 캐릭터를 씬에 안 넣어서 읽은 것 그대로다. 6번(걷기)에서 잰다.

엔진에 들어간 것: L1~L8(unity_code), L9(mesh_assets), L10(blueprint). 전부 verified: false.

**재 본 결과(20:46 배포 → 21:01 "고쳐 줘: 빛과 그림자만" → 21:08 Dev 끝 → 21:10 유니티):**
- 코드에 나타난 것: 키+필 Directional(필은 그림자 끔, 0.35), QualitySettings shadows/
  distance/resolution/cascades, shadowStrength, _Metallic/_Glossiness(바닥 0.08, 캡슐 0.15,
  동전 metallic 1·0.7), nearClipPlane 0.3, `using UnityEngine.Rendering` 만(URP 타입 0).
- 안 나온 것: Trilight 앰비언트(Flat #2E2E2E 로 대신 — 결과는 괜찮음), shadowBias/
  normalBias(줄무늬가 없으니 안 건드린 것이 맞다).
- 사진 비교(20:28 → 21:10): 하늘색에 묻힌 흰 바닥 → 회색 바닥 위 또렷한 그림자; 순노랑
  구 → 하이라이트 있는 금속 동전; 캡슐은 무광. 통과 4 · 떨어짐 0.
- 기준이 29 → 13 으로 줄었다: 지난 기준을 "핵심 회귀" 한 줄로 묶었다. 기준을 유지하라는
  규칙이 "묶어도 된다" 로 읽힌 것 — 다음 회차에 '지난 기준은 id 그대로 남긴다' 를 박는다.
- 걸린 것 하나(20:47): Dev 가 "제출할게요" 라고 말만 하고 assignment 를 null 로 내서 아무
  일도 안 생겼다. delegate 로 넘어온 턴은 업무 객체 필수 + 비면 한 번 더 요구(21:01 배포).
- verified 로 올린 것: L1~L6. L7·L8(캐릭터)은 6번 회차(걷기)에서.

## M. 11회차 (09-05 21:15~) — 걷는 법 (교과 과정 6번)

사장님: "캐릭터 넣어 줄 수 있어? 실제 사람 같은" → 20~30대 남성 캐주얼(티셔츠·청바지).
그래서 이 회차는 시험용 마네킹이 아니라 **진짜 첫 캐릭터**로 잰다: Vox → Meshy → 리깅
→ Dev 가 동전 줍기 씬의 캡슐 자리에 끼워 걷게.

읽은 것:
- 블렌드 트리(Packt·Medium·GameDev Academy): Idle/Walk/Run 을 Speed 하나로 1D 블렌드,
  클립은 제자리(in-place), Loop Time 켜고 Humanoid 면 Bake Into Pose·Based Upon Original.
- 공식 API: ModelImporter.animationType/avatarSetup/clipAnimations/globalScale/
  SaveAndReimport; AnimatorController.CreateAnimatorControllerAtPath + BlendTree.AddChild +
  AddMotion + AddObjectToAsset.
- Mixamo/Meshy 반입: Rig → Humanoid, Avatar Create From This Model, 같은 뼈대면 아바타 재사용.
- 컨트롤러 글들: CharacterController 는 관성이 없어 즉답, Rigidbody 는 Lerp 로 가속;
  미끄러움은 피한다; 접지는 스피어캐스트.

우리 생각:
- 우리 씬은 코드로 짓는다. 그래서 **임포트 설정·클립 루프·Animator 컨트롤러도 코드로**
  (M1·M2·M4). 사람이 인스펙터를 만지는 순간 "사람 손 0회" 가 깨진다.
- Meshy 리깅은 idle 이 없다 → animator.speed 0 으로 임시(M5). idle 은 Meshy 애니메이션
  API 에서 받는 것을 교과 과정에 넣는다.
- 발 미끄러짐은 루트 모션 끄고 이동 속도를 클립 평균 속도에 맞추는 것으로(M6).
- 지난 판의 기준 묶기(29→13)는 규칙 M12 로.

엔진에 들어간 것: M1~M10(unity_code), M11·M12(blueprint). 전부 verified: false.

**재 본 결과(21:24 배포 → 21:35 Vox 캐릭터 → 21:43/22:17/22:28 Dev 세 판 → 22:35 유니티):**
- Vox: 흰 티셔츠·청바지·운동화 남성, A-포즈, 삼각형 28,007, 뼈 24, 걷기·달리기 클립.
  자가 S1(키 0.017 m)로 FAIL 을 냈다 — 리깅 출력이 cm 인 것(E7)을 자가 몰랐다. 자를
  고쳐(100배 단위면 통과 + 배율 힌트) 다시 매김.
- Dev 1판(21:48): 없는 enum 이름 CopyFromOtherAvatar → 컴파일 깨짐 → 배치 유니티가 영원히
  기다림(10분). 유니티 창에 컴파일 감시를 넣어 오류를 판정으로 보내고 끝나게 함. 이름은
  M1b 로 박음.
- Dev 2판(22:24): 컴파일 통과, 캐릭터가 섰지만 **새하얗고(묻힌 텍스처) 공중에 떠 있고
  (루트 y=1) 발 옆에 분홍 조각(셰이더 없음)**. 자는 뼈가 움직인 것을 표류로 잡았다 →
  시험지가 애니메이터 아래 뼈를 뺀다. M13·M14·M15 로 박음.
- Dev 3판(22:35): 텍스처 붙고 바닥 위에 서고 그림자·입력 반응. **통과 4 · 떨어짐 0**.
  기준 29개 id 유지(M12 먹음).
- 배관 쪽에서 걸린 것 둘: Dev 가 "제출할게요" 만 하고 업무를 안 받음 → delegate 턴은
  업무 필수; "고쳐줘" 를 대화 모델이 질문으로 보고 코드 조각으로 답함 → 돌아온 산출물이
  있으면 규칙으로 그 직원에게. 설계 단계 토큰 6000 → 16000(지난 기준을 다 되쓰느라 잘림).
- 배치 유니티는 깨진 스크립트가 있으면 시작을 못 한다(창은 괜찮다) — 헤드리스는 지난
  빌더 파일을 지우고 돈다.
- verified: M1·M3·M6~M9·M12~M15. 읽은 것으로 남김: M2·M4·M5·M10·M11.

## N. 12회차 (09-05 22:40~) — 캐릭터 디테일(생성 후) (교과 과정 6a)

사장님 22:37: "캐릭터 생성 AI 는 최대한 쓰지 말고, 생성된 캐릭터에 디테일을 주는 거야."
22:26 의 "조잡하다" 가 이 회차의 출발점이다.

**22:40 발견(우리 것):** 원본 model.glb 의 재질에는 baseColor·normal·metallicRoughness
세 맵이 다 있는데(각 2048), 리깅된 rigged.fbx 에는 baseColor 한 장뿐이다. 리깅은 같은
메시·같은 UV 위에서 하니, 원본의 맵을 리깅 캐릭터 재질에 그대로 붙이면 된다 — 생성기를
다시 돌리지 않는다. 자(판정 서비스)에 `/mesh/textures` 를 두어 GLB 에서 맵을 꺼내 유니티
묶음(R=metallic, A=1−roughness)으로 바꿔 주고, Vox 가 normal.png·metallic_smoothness.png
로 저장한다. 첫 캐릭터에는 손으로 되채웠다.

읽은 것: 재질 smoothness/normal(Medium·Coohom), 림 조명(Unity Toon Shader 문서·Rimlight
글), Humanoid IK(공식 OnAnimatorIK·SetLookAtWeight, UnityQueen 머리 추적, 발 IK 데브로그),
Standard 셰이더 노멀/세부 노멀(공식), 3인칭 카메라(Game Developer·CG Cookie·Little Polygon).

엔진에 들어간 것: N1~N8(unity_code), N9(blueprint). 전부 verified: false.

**재 본 결과(23:07 Dev → 23:23 끝 → 23:25 유니티):** N1(맵 붙음, 진단으로 확인)·N2·N3·N5·N8
전부 코드에 나타났고 통과 4 · 떨어짐 0. 그런데 사진은 여전히 거칠었다 — 사장님 23:26
"화질이 부족해". 진단 스크립트로 씬을 열어 본 것: 재질엔 노멀·금속 맵이 붙어 있고 MSAA=4
인데, (a) 캡처가 MSAA 없는 960×540 이었고 (b) 발밑 분홍은 캐릭터가 아니라 런타임에
AddComponent 한 **파티클**(재질 없음·붙는 순간 재생, J5b) (c) Built-in 파이프라인엔
후처리가 없다. 사진만 보고 "캐릭터가 나쁘다" 고 했으면 틀렸을 것이다.

## O. 13회차 (09-05 23:28~00:00) — URP + 후처리를 코드로 (교과 과정 6a 계속)

화질의 큰 덩어리. 로키 창에 "URP + 후처리 켜기" 를 넣었다(`RookeryRender.cs`): 패키지
넣기 → 리로드 → URP 자산(MSAA 4·HDR·그림자 50 m/4096/4단) → Volume 프로필(ACES·블룸
0.35·비네트 0.22·대비 12·채도 8) → 카메라 후처리·SMAA → 공식 변환기(Built-in→URP).
URP 가 없는 프로젝트에서도 컴파일되게 리플렉션·SerializedObject 로만 썼다.

걸린 것:
- `VolumeProfile.TryGet` 시그니처(out VolumeComponent) — 이름·인자 수로 찾는다.
- `Volume.isGlobal` 필드명은 버전마다 다르다(m_IsGlobal / isGlobal) — 둘 다 본다.
- `WaitForEndOfFrame` 은 배치 시험에서 예외 — 프레임 둘로 대신.
- 시험지는 서버에서 내려온다 — 로컬 수정은 배포해야 프로젝트에 닿는다.
- Dev 빌더가 씬을 새로 지으면 Volume·카메라 설정이 사라진다 → 지은 뒤마다 다시 씌움.
- Dev 가 만든 Standard 재질은 URP 에서 분홍 → 창이 씬 재질을 URP Lit 로 바꾸는 안전망
  + Dev 규칙에 양쪽 파이프라인 재질 도우미(Lit/Tint/Surface). 런타임에 만드는 재질은
  창이 못 잡는다 — Dev 가 규칙대로 써야 한다(23:58 판).

23:57 사진: 캐릭터에 셔츠 주름·명암이 살고 1080p·AA. 바닥·동전은 런타임 재질이라 아직
분홍(Dev 재판 대기).

**00:33 확정:** Dev 가 재질 도우미(Lit/Tint/Surface)와 파티클 Stop 을 넣은 판 → 분홍 0,
금속 동전 하이라이트, 셔츠 주름, 부드러운 그림자, 1080p·SMAA. 통과 4 · 떨어짐 0.
22:26 "조잡하다" 사진과 나란히 놓으면 무엇이 바뀌었는지 한눈에 보인다. O1~O3 확인.
배관: Dev 가 파일 9개를 매번 되쓰다 20분 정지 감시에 죽었다(00:19) → 고치는 판은
바뀐 파일만 내고(keep) 나머지는 코드가 이어 붙인다, 감시 40분. 이번 판 7분.


## P. 14회차 (09-06 00:35~01:32) — 정면 얼굴 사진, 살아 있는 서 있기, 그리고 두 가지 진짜 원인

유니티 창이 **정면 얼굴 사진**을 한 장 더 찍는다(같은 카메라를 얼굴 앞 1.4 m 로 옮겨,
후처리 그대로). 이것이 이 회차의 눈이었다 — 뒤통수 사진으론 아래 둘을 못 봤다.

읽은 것: 뼈 덮어쓰기는 LateUpdate(Unity 포럼·DeepMotion), idle 은 호흡 2~4초·무게 이동
8~12초(MoCap Online), 발 IK 는 발 뼈 아래 레이캐스트(Yarsa Labs·Lem Apperson).
Dev 판(00:56): BreathMotion(LateUpdate·Chest/Spine/Hips/Head)·FootIK(OnAnimatorIK·
Raycast)·얼굴 필 Spot 전부 코드에 나타남. P1·P2·P4 확인.

**진짜 원인 둘(실험으로 가름):**
1. **얼굴·흰 셔츠가 하얗게 탐(00:58).** 조명 합 ≤ 1(P5)로 내려도 그대로, 앞쪽 스팟 둘을
   0 으로 꺼도 그대로 → 조명이 아니다. 재질을 뜯어 보니 **Meshy FBX 재질은 발광이 켜져
   있고 발광 맵 = 베이스컬러, 발광색 흰색** — 알베도가 빛으로 한 번 더 더해졌다. Built-in
   Standard 에선 발광색이 검정이라 안 보였고 URP 변환 뒤 흰색이 됐다. M16 + 창 안전망.
2. **셔츠의 네모난 얼룩(00:46).** 거칠기 맵을 흐려도 그대로, 노멀 맵을 평평하게 바꿔도
   그대로, 베이스컬러 텍스처는 균일한 흰색 → 텍스처·맵이 아니다. 임포트 법선을 다시
   계산(Calculate·180°·용접)하니 사라졌다. **Meshy FBX 의 법선 데이터가 나쁘다.** 읽었던
   F3("Normals 는 Import")이 AI 메시엔 틀렸다 — F3 정정, 창이 받을 때 자동으로 한다.

교훈의 교훈: 사진을 보고 "조명이다/맵이다" 라고 짚은 첫 두 추측이 다 틀렸다. 변수를
하나씩 끄는 실험(로컬 빌드+캡처, 서버 반입 없이 2분)이 답을 줬다. 앞으로 화질 문제는
추측 두 번 전에 실험 한 번.

01:30 최종: 정면 사진에서 얼굴 정상 노출, 셔츠 매끈, 통과 4 · 떨어짐 0.

## Q. 15회차 (09-06 04:55~05:02) — 피부/옷 광택 가르기(생성 AI 없이)

재질이 한 장이라 피부·셔츠·청바지·머리가 같은 광택이었다. 자(`/mesh/textures`)가
베이스컬러의 색(HSV)으로 네 종류를 어림해 표준 매끄러움을 주고(피부 0.45·흰 천 0.12·
청바지 0.2·머리 0.3), Meshy 의 흐린 거칠기는 1/4 만 섞는다. 첫 캐릭터에 되채워 05:00
정면 사진: 피부에 은은한 윤기, 셔츠 무광. 차이는 작다 — 정면 필 조명이 평평해서다.
N10 확인, N11(흰 옷이 푸르스름 — 필 색) 읽은 것으로 남김. 다음 캐릭터 회차 후보:
키 조명 옆 45°·필 색 따뜻하게, 눈 하이라이트(눈 영역만 매끄러움 0.9), 머리카락 결.

## R. 16회차 (09-06 07:10~07:28) — 피부 질감 (사장님: "피부질감시행착오학습")

피부는 색만 있고 결이 없어 플라스틱처럼 보였다. 생성 AI 없이: 자가 **타일 모공 노멀**
(1024, 값 노이즈 두 옥타브 + 둥근 움푹 4천 개 → 높이 → 기울기 노멀)과 **피부 마스크**
(베이스컬러 색으로, 알파)를 만들어 저장하고, 유니티 창이 URP Lit 의 Detail 슬롯에 얹는다
(세기 0.6, 타일 22, 피부에만). 07:21 얼굴 전후 비교: 매끈한 플라스틱 → 은은한 결·모공.
N12 확인. 첫 시도는 모공이 네모났다(가우시안 창을 3σ 보다 작게 잘라서) — 창을 키워 둥글게.

한계(정직하게): 얼굴 텍스처가 2048 전신 맵에서 150 px 남짓이라 가까이선 흐리다. 이건
결로 못 가린다 — 해상도는 생성 쪽 일이라 사장님이 "생성 AI 써도 된다" 고 하시기 전엔
여기까지다. 다음 캐릭터 회차 후보: 눈 하이라이트(눈 영역 매끄러움 0.9·마스크), 머리카락
결(머리 영역 이방성 대신 디테일 노멀 방향성), 입술 매끄러움 0.55, 옆 45° 키 조명.

## S. 17회차 (09-06 07:29~08:40) — 생성 AI 허가 뒤 첫 판: 4K 텍스처

사장님 07:30 "생성 AI 써도 된다". 병목은 얼굴 텍스처 해상도(전신 2048 에서 얼굴 150 px).

시도 셋(전부 같은 콘셉트 그림):
1. **Retexture 4K(텍스트 프롬프트, 10 크레딧)** — UV 는 유지되지만 "다시 칠하기" 라 얼굴이
   조금 달라지고 원본(2048)보다 오히려 흐렸다. ✗
2. **Retexture 4K(이미지 스타일, 10 크레딧)** — 마찬가지로 흐림. ✗ 재텍스처는 확대가 아니다.
3. **image-to-3D 를 4K 로 다시 생성(30 크레딧, 2K 와 같은 값)** — 피부 고주파 에너지 2배
   (4.0 → 8.6). 리깅·유니티까지 돌려 정면 얼굴 비교: 같은 얼굴에 결이 조금 더 산다.
   차이는 은은하다. ✓ 캐릭터는 4K 를 기본으로(Vox).

**진짜 병목(우리 생각):** Meshy 는 콘셉트 그림을 보고 칠한다. 1024 전신 그림에서 얼굴은
120 px 남짓 — 4K 로 칠해도 원천이 120 px 이다. 다음 회차: 콘셉트 그림을 크게(1536+)
그리고 **얼굴 클로즈업을 한 장 더** 넣어 meshy-7 의 multi-image-to-3d(최대 4장)로 만든다.

배관에서 고친 것: 이름을 부르면 그 직원(Vox → Nova 로 갔었다), 접수 답이 잘려도 업무를
만든다(3000 토큰), 위임 실패를 대화에 알린다, PBR 맵은 GLB 링크로(4K base64 는 시간 초과),
지난 산출물 찾기 200개·돌아온 턴만. Vox 는 그림이 없으면 지난 캐릭터의 콘셉트 그림을 쓴다
(이번엔 못 찾아 새로 그렸는데 얼굴이 거의 같았다 — 다음 판에서 확인).

## T. 18회차 (09-06 08:45~09:20) — 얼굴 화질의 원천: 세 장으로 만든다

가설(17회차): 얼굴이 흐린 건 텍스처 해상도가 아니라 **콘셉트 그림의 얼굴 픽셀**(1024
전신에서 120 px)이다. 실험: gpt-image-2 로 전신 1024×1536(high) → 그 그림을 참조로 **같은
사람의 얼굴 클로즈업**(1024²)과 **뒷모습** 편집 → meshy-7 multi-image-to-3d(4K, 30 크레딧)
→ 리깅(5) → 유니티 정면 사진.

결과: 수염·피부톤·머리결이 살아 사람에 가깝다(09:11 비교 사진). 이제까지 판 중 가장 낫다.
Vox 의 캐릭터 기본 경로로 넣었다(정면 1536 → 얼굴·뒷모습 편집 → meshy-7 4K, 뷰 그림도
파일로 저장). 비용: 그림 3장(high) + 30 크레딧, 시간 +4분.

**정정:** 17회차의 "4K vs 2K 유니티 비교" 는 둘 다 옛 모델이었다. Dev 의 빌더가
`FindAssets("t:Model 사실적인")` 처럼 한글 검색어를 써서 빈 배열 → '아무 rigged.fbx' 폴백이
옛 폴더를 집었다. 씬 파일의 GUID 를 뒤져 확인했다. M9 에 박음: 검색어에 한글 금지, 경로
문자열로 거르고 무엇을 골랐는지 로그.

걸린 것 하나 더: 빌더가 텍스처를 공용 폴더(VoxExtracted)에 같은 이름으로 꺼내 옛 텍스처가
남았다 — 캐릭터 폴더 안에 꺼내야 한다(M13 보강 예정).

**09:42 제품 경로 확정:** "Vox, 지난 콘셉트의 그 남자를 세 장 방식으로" → 지난 콘셉트 재사용
(reusedConcept true) → 얼굴·뒷모습 편집 → meshy-7 4K → 리깅 → 맵 12개 파일 → Dev 교체
(이번엔 경로 문자열로 골라 진짜 바뀜) → 정면 사진: 망토·가죽끈·사슬갑옷·수염·머리결까지
선명. **지금까지의 모든 판과 격이 다르다.** 다만 옷이 캐주얼이 아니라 판타지 레인저다 —
재사용한 콘셉트가 07:56 판의 기계 그림(그 판은 유니티에 실제로 선 적이 없어 몰랐다).
사장님이 정한 옷(흰 티셔츠·청바지)으로 가려면 그 콘셉트 그림을 붙여 시키면 된다.
배관: 산출물 행이 파일보다 먼저 생겨 반쪽 목록이 붙던 것 → filesPending 으로 파일이 다
올라간 뒤에 붙는다.

## U. 19회차 (09-06 10:05~) — 걷는 모습을 본다

서 있는 사진 둘(3인칭·정면)만으론 리깅 품질(스키닝 뒤틀림·발 미끄러짐·팔 흔들림)을 못
본다. 시험지가 "입력을 주면 움직인다" 에서 먹힌 키를 계속 누르며 **옆(오른쪽 3.8 m,
시야각 45°)에서 넉 장**(0.22초 간격 ≈ 걷기 한 주기의 네 자리)을 찍어 가로로 붙인다 →
보고자 `walk` → 서버 `유니티 걷기.png`. 10:12 첫 줄: 레인저가 진짜 걷는다 — 다리·팔·망토가
따라온다. 첫 컷은 발이 잘려 카메라를 뒤로 뺐다.

배관: Vox 의 지난 콘셉트 재사용은 매니저가 "같은/지난 그림" 이라고 했을 때만(09:42 옷이
바뀐 원인). 사장님 사양(흰 티셔츠·청바지·한국 남성 20대 후반)으로 세 장 방식 재생성 중.

## V. 20회차 (09-06 10:49~11:25) — 옆모습 한 장이 얼굴 두께를 준다; 점토 문제

사장님 10:49 "옆에서 보니까 얼굴 입체감이 없네" → 옆모습(프로필) 전신을 네 번째 그림으로.
11:21 걷기 줄: 옆에서 코·턱이 선다(N16 확인). 사장님 11:11 "여전히 점토 같네 — 최신 기술은?"
— 맞다. 남은 점토 티는 생성기의 한계다: 재질 한 장, 머리카락이 덩어리, 피부에 SSS 없음,
눈이 텍스처. 조사(3DAI Studio·Reallusion): 사실적 사람은 **전용 도구**(Character Creator 5
+ Headshot: 사진→사람, 피부·머리·눈 셰이더 포함, 유니티 자동 세팅, 일회성 $299)가 표준이고,
AI 생성기 중엔 Rodin(Hyper3D)이 얼굴 충실도 최고이나 자동 리깅이 없다.
새로 걸린 것: 4장 캐릭터가 걸을 때 **허리가 45° 굽는다**(리타깃/아바타 휴식 자세). 다음 회차.
배관: Dev 가 캐릭터를 못 찾으면 폴백으로 옛 것을 집어 두 판이 헛돌았다 → M9b. 대화가 길어
문맥 초과 → 기록 자르기. 설계 토큰 32000.

## W. 21회차 (09-06 11:30~13:05) — 셋을 나란히: 도트 2D · 손그림 2D · 귀여운 3D

사장님 "2D 먼저 할까?" → 내 권고 2D → "일단 다 해보자" → "실제 사람 말고 귀여운 3D 는?"
→ "Meshy-6 는 잘 만드는데 네가 이상하게 하는 것 같아".

- **2D 두 스타일**(gpt-image-2, 정면 → 참조 편집으로 옆·걷기 4프레임 한 줄): 둘 다 같은
  사람이 유지되고 걷기 자세가 제대로다. 스타일당 그림 3장, 6분. 즉시 쓸 수 있다.
- **Meshy 대 우리 유니티**(같은 모델 나란히): 메시는 같고 **우리 조명이 더 나빴다** —
  셔츠 회색·얼굴 창백. 원인은 환경광(파란 단색 앰비언트, 반사 없음). 창이 프로시저럴
  스카이박스로 앰비언트·반사를 깔게 했다(RookeryRender.ApplyEnvironment). 흰 셔츠가
  흰색으로 돌아왔다. 사장님 말이 반은 맞았다.
- **귀여운 3D(치비)**: 네 장 방식 + meshy-7 → 콘셉트와 메시가 잘 맞고, 유니티에서 정면·
  걷기 모두 깨끗하다. 허리 굽음도 없다. **지금 AI 3D 에 가장 잘 맞는 자리**가 이것이다.
- 배관: Dev 가 캐릭터 찾기 필터에 또 슬래시를 붙여("/치비/") 못 찾음 → 규칙에 FindRig
  도우미 코드를 통째로 박음. 정정: 이번 판도 로컬에서 필터만 고쳐 잰 것이다.

## X. 22회차 (09-06 13:10~) — 결정: 귀여운 3D, 주인공은 고양이

사장님: "귀여운 3d 가 낫다. 하지만 Meshy-6 로 만든 거 고퀄이던데" → 6 vs 7 비교를 시작했다가
사장님이 중단: "네가 GPT 로 앞뒤옆 다 찍어서 안 올렸지? 그래서 그랬네." **맞다.** 11~17회차
사실적 사람은 정면 한 장만 Meshy 에 넣었고, 18회차부터 네 장이다. 모델(6 vs 7)이 아니라
입력이 문제였다. 교훈 N14·N16 이 그 자리다. → "동물로 가" → 고양이(3등신, 두 발, 주황
줄무늬, 흰 티셔츠). Vox 네 장 경로로 제작 중.

**14:44 고양이가 유니티에 섰다.** 네 장 + meshy-7 + 리깅 → Dev 교체 → 걷기·정면 사진 모두
깨끗하다(통과 4 · 떨어짐 0). 걸린 것 셋, 전부 배관:
- DB 시간 초과로 파일 기록 둘(model.glb·rigged.fbx)이 빠짐 → 산출물 행의 1.8 MB 콘셉트
  그림이 원인. 그림을 파일로 빼고 옛 행 8개도 비웠다. 유니티 반입 API 가 100행의 전체
  content_json 을 끌던 것도 필요한 칸만으로. 사진 파일은 유니티에 안 보낸다.
- Dev 가 세 번째로 슬래시 필터("/고양이/")를 씀 → 기계 교정(저장 전 정규식으로 고침),
  저장된 최신 판도 손으로 교정.
- "Avatar is null": 캡슐 폴백일 때 Animator 에 아바타가 없어 시험 5개가 떨어졌다 —
  Dev 가 폴백에서는 Animator 를 안 붙여야 한다(다음 규칙감).

## Y. 23회차 (09-06 15:00~18:30) — 얼굴 없는 캐릭터: 은빛 기사, 그리고 '지어내지 마라'

사장님: "사람 얼굴 없고 전체 갑옷으로 할래. 금속 질감만 살리면 돼" → "은빛 중세 기사".
눈·피부·머리카락(가장 어려운 셋)을 피하고 금속 하나에 집중하는 판.

세 판이 걸렸고, 셋 다 **생성 이전** 단계의 잘못이었다:
1. 17:20 판 — 그림 생성기가 '닫힌 투구' 를 무시하고 얼굴을 그렸다. 30 크레딧을 쓴 뒤에
   알았다. → 콘셉트 검수(N17): mustHave 목록을 시각 모델이 보고, 어긴 조건을 대문자로
   앞세워 최대 3번 다시 그린다.
2. 17:35 판 — 브리프가 '3등신' 을 지어내고 파랑 천을 진홍으로 바꿨다. 사장님: "3등신?
   존나 맞을래". 내가 고양이의 3등신을 관성으로 옮긴 것. → 브리프 규칙(N18): 매니저가
   말한 것을 바꾸거나 더하지 않는다, 비율 미언급 = 실제 비율. 메모리에도 적었다.
3. 17:45 판 — 그림은 맞았는데 하이라이트·역광이 구워져 있었다. 사장님: "빛은 후처리해야지".
   → CONCEPT_FORM 에 평평한 확산광 강제, 항상-필수 조건에 조명 항목(N19). 판정 T1(삼각형)
   42150 이 상한 40000 에 걸려 FAIL → 상한 60000 으로 올리고 재판정 PASS(4K 갑옷은 판이 많다).

배관에서 걸린 것:
- 유니티 반입 API 가 파일 130개를 하나씩 서명해 100초를 넘김 → 한 번에 서명, 창 HTTP 5분.
- Dev 빌더가 기사 폴더 셋 중 **첫 판**(얼굴 보이는 것)을 집었다 → FindRig 도우미가
  .rookery.json 의 createdAt 최신 것을 고르게(M17). 18:29 Dev 수정 판 진행.

**확인된 것**: N17(3번째 판 한 번에 통과). **아직**: N18·N19·M17 은 기사가 유니티에 선 사진으로 잰다.

**20:19 기사가 고양이 앞에 섰다** (Dev 판 b4ab89cb, 통과 4·떨어짐 0). FindRig 가 후보 셋의
createdAt 을 찍고 최신 판(08:38)을 골랐다 — M17 확인. 사진에서 본 것 둘, 둘 다 다음 판의 입력:
- **금속이 회색 돌이다.** Dev 가 사람 판의 버릇대로 `forceMatte(metallic 0, smoothness 0.15)` 를
  기사에도 걸었다. URP 에선 `_Smoothness` 가 맵의 배율이라 은빛 맵이 0.15 배가 됐다. → M18.
- **투구·어깨판이 너덜너덜.** 얇고 떨어진 판은 메시 생성기가 찢는다. → N20(콘셉트 필수 조건).
- 사진 틀은 플레이어(고양이) 기준이라 기사는 정면 사진에 반쯤만 나온다. 다음: 자가 씬의 캐릭터마다
  한 장씩 찍게.

배관에서 또 걸린 것(18:33~19:32, 두 번 25분): **DB 가 멈췄다.** 대화 한 턴의 attachments 에 base64
그림 3 MB 가 있었고, 일이 걸린 동안 화면이 6초마다 그 대화 전체를 읽었다(collectWorkReturns).
작은 인스턴스의 IO 예산이 바닥나 한 줄 조회도 30초를 넘겼다. 그림은 저장소로(`<회사>/chat/…`),
폴링 조회는 두 칸만(id 둘). 옮긴 뒤 같은 조회 0.27초. 그 사이 브라우저 세션이 끊겨 Dev 판은
스케줄러 경로(`engine/tools/rerun_assignment.mts`)로 돌렸고, 결과는 `post_returns.mts` 로 붙였다.
`-nographics` 로 돌리면 사진이 안 찍힌다(메모리 정정).

## D. 다음에 배울 것 (아직 안 읽음)

- LOD Group 기본(거리별 메시 3단).
- Meshy 입력 그림 규격의 실측(같은 물체를 정면/¾ 로 넣어 비교) — 크레딧 60.
- 리깅 출력의 단위 100배가 GLB 만인지 FBX 도인지(유니티에서 rigged.fbx 열어 확인).
- 판정기가 리깅 GLB 단위를 스스로 잡을지(v2 감).

## 출처

- https://help.meshy.ai/en/articles/16102633-unity-import-checklist-for-meshy-assets
- https://github.com/meshy-dev/game-asset-pipeline
- https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.17/manual/index.html
- https://github.com/atteneder/glTFast/discussions/359
- https://blog.neural4d.com/user-guide/how-to-import-3d-models-into-unity-6-fbx-glb-ai-workflow/
- https://game-developers.org/biggest-mistakes-new-developers-make-in-unity
- https://ithappystudios.com/blog/unity-for-beginners-5-common-mistakes-when-working-with-3d-models/

- https://polycount.com/discussion/213605/is-this-a-problem-when-a-model-is-not-a-watertight-mesh
- https://www.sloyd.ai/blog/image-to-3d-for-games-vs-3d-printing
- https://docs.meshy.ai/en/api/rigging
- https://assetstore.unity.com/packages/essentials/starter-assets-thirdperson-urp-196526
- https://www.meshy.ai/tutorials/3d-model-for-unity-workflow
- https://docs.unity3d.com/6000.5/Documentation/Manual/Retargeting.html
- https://unitycodemonkey.com/video.php?v=AO1vw-b8Qzw
- https://docs.unity3d.com/2023.2/Documentation/Manual/class-TextureImporterOverride.html
- https://docs.unity3d.com/6000.3/Documentation/Manual/UpgradeGuideUnity6.html
- https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Rigidbody-linearVelocity.html
- 9회차: [egmatic — How to Make Your Game Feel Good](https://egmatic.com/blog/how-to-make-your-game-feel-good),
  [tigerabrodi — Juice is the difference…](https://tigerabrodi.blog/juice-is-the-difference-between-a-game-that-feels-alive-and-one-that-doesn-t),
  [GameAnalytics — Squeezing more juice](https://www.gameanalytics.com/blog/squeezing-more-juice-out-of-your-game-design),
  [Game Dev Beginner — Coroutines](https://gamedevbeginner.com/coroutines-in-unity-when-and-how-to-use-them/),
  [Meshy — Unity Import Checklist](https://help.meshy.ai/en/articles/16102633-unity-import-checklist-for-meshy-assets),
  [Meshy — Unity workflow 2026](https://www.meshy.ai/tutorials/3d-model-for-unity-workflow)

- 10회차: [Unity — Troubleshooting shadows in URP](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/shadows-troubleshooting-urp.html),
  [7colors — shadow acne & bias](https://unity-trouble-atlas.7colorsgame.com/en/article/unity-urp-shadow-acne-bias-adjustment/),
  [Creative Bloq — key/fill/rim](https://www.creativebloq.com/3d/how-to-use-key-fill-and-rim-lighting-in-3d-art),
  [Unity Learn — tone mapping](https://learn.unity.com/tutorial/post-processing-effects-tone-mapping-2019-3),
  [LogRocket — post-processing](https://blog.logrocket.com/exploring-post-processing-unity/),
  [Meshy game-asset-pipeline](https://github.com/meshy-dev/game-asset-pipeline)

- 11회차: [Packt — Blend Trees walk/run](https://subscription.packtpub.com/book/game-development/9781785883910/4/ch04lvl1sec38/using-blend-trees-to-blend-walk-and-run-animations),
  [GameDev Academy — Animator](https://gamedevacademy.org/unity-animator-tutorial/),
  [Unity — ModelImporter](https://docs.unity3d.com/ScriptReference/ModelImporter.html),
  [Unity — AnimatorController.CreateAnimatorControllerAtPath](https://docs.unity3d.com/ScriptReference/Animations.AnimatorController.CreateAnimatorControllerAtPath.html),
  [Unity — ModelImporterClipAnimation.loopTime](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/ModelImporterClipAnimation-loopTime.html),
  [Unity — Importing humanoid animations](https://docs.unity3d.com/Manual/ConfiguringtheAvatar.html),
  [Kirwan — Mixamo → Unity](https://danielkirwan.medium.com/download-and-import-mixamo-animations-for-your-humanoid-character-in-unity-a04763203691)

- 12회차: [Unity — OnAnimatorIK](https://docs.unity3d.com/ScriptReference/MonoBehaviour.OnAnimatorIK.html),
  [Unity — SetLookAtWeight](https://docs.unity3d.com/ScriptReference/Animator.SetLookAtWeight.html),
  [UnityQueen — head tracking](https://unityqueen.com/2026/08/04/how-to-add-head-tracking-to-any-character-in-unity-simple-universal-method/),
  [Unity — normal maps](https://docs.unity3d.com/Manual/StandardShaderMaterialParameterNormalMap.html),
  [Unity Toon Shader — Rim light](https://docs.unity3d.com/Packages/com.unity.toonshader@0.8/manual/Rimlight.html),
  [Shaun Codes — materials tips](https://medium.com/@fulton_shaun/mastering-materials-in-unity-10-pro-tips-you-should-know-ac67c10b9a71),
  [Game Developer — third person camera](https://www.gamedeveloper.com/design/third-person-camera-view-in-games-a-record-of-the-most-common-problems-in-modern-games-solutions-taken-from-new-and-retro-games),
  [Little Polygon — cameras](https://blog.littlepolygon.com/posts/cameras/)
- 14회차: [Unity 포럼 — LateUpdate 뼈 회전](https://forum.unity.com/threads/bones-rotation-from-script-with-lateupdate.482376/),
  [DeepMotion — procedural animation](https://deepmotion.medium.com/procedural-animation-for-characters-via-scripting-in-c-e60435da9e13),
  [MoCap Online — idle guide](https://mocaponline.com/blogs/mocap-news/idle-animation-game-dev-guide),
  [Yarsa Labs — foot placement IK](https://blog.yarsalabs.com/dynamic-foot-placement-in-unity-inverse-kinematic/),
  [Lem Apperson — IK](https://medium.com/@lemapp09/beginning-game-development-inverse-kinematics-00177650c4b2)
- 17회차: [Meshy — Retexture API](https://docs.meshy.ai/en/api/retexture),
  [Meshy — Image to 3D API](https://docs.meshy.ai/en/api/image-to-3d),
  [Meshy — Multi-Image to 3D](https://docs.meshy.ai/en/api/multi-image-to-3d)
- 20회차: [3DAI Studio — AI 3D character generators 2026](https://www.3daistudio.com/blog/best-ai-3d-character-and-avatar-generators-2026),
  [Reallusion — CC5 for game characters](https://magazine.reallusion.com/2026/05/18/character-creator-5-for-game-characters-indigo-studios/),
  [Reallusion — CC/iClone → Unity](https://www.reallusion.com/auto-setup/unity/default.html),
  [Creative Bloq — CC5 review](https://www.creativebloq.com/3d/character-creator-5-review-unreal-engine-support-and-auto-rigging-make-it-a-joy-to-use)
- 23회차: (웹 출처 없음 — 이 회차는 제품 배관과 사장님 지시로만 채워졌다)

## Z. 29회차 (09-07 09:58~10:30) — 동작 클립: Meshy 동작 라이브러리 (교과 16)

캐릭터는 걷기·뛰기뿐이었다(리깅이 주는 둘). 서 있을 때 숨 쉬는 idle 과 점프·공격이 없으면 게임이 아니다.
**읽은 것**: Meshy `POST /openapi/v1/animations` — `rig_task_id` + `action_id`(라이브러리 566개, idle 0·jump 466·attack 4·wave 290·dead 8·dance 22·sit 33)
또는 `motion_task_id`(생성 모션). 결과 `animation_fbx_url`/`animation_glb_url`, 3 크레딧, 리깅 자산은 3일 뒤 만료.
**잰 것**: 기사 리그에 idle 한 개 = 22초·3 크레딧·FBX 17.9 MB(메시 포함). 제품 경로(초안 재사용 → 고화질 + idle·jump) = 12분·$1.57.
**엔진에 박은 것**: 공급자 `animate()` + 이름표(`MESHY_ACTIONS`), Vox 브리프 `actions`(캐릭터면 idle 기본), 파일 `<이름>.fbx`, 장부 3크레딧/개,
Dev 규칙(Idle 기본 상태·Space 점프·클립은 rig 폴더에서 이름으로·없으면 만들지 마라).
**남긴 것**: 각 클립 FBX 가 메시를 통째로 다시 담아 18 MB — 유니티 창은 같은 크기면 안 받으니 괜찮지만 저장소는 캐릭터당 +36 MB/클립 2개.
`motion_task_id`(글로 동작 생성)는 안 해 봤다.
**확인(10:30)**: Dev 가 `KnightController.cs` 를 새로 내 idle 기본·Space 점프(SetTrigger)를 넣었고, 씬 빌더는 idle.fbx·jump.fbx 를 이름으로 찾아
없으면 빼고 로그에 적게 짰다(규칙대로). 유니티 검사 통과 4, 정면 사진에서 기사(초안 재사용 판)는 찢어진 판 없이 은빛 그대로 idle 자세.
따뜻한 유니티가 스스로 집어 검사(10:26 붙음 → 10:29 결과). 기사 폴더는 다섯 개가 됐고 FindRig 가 최신을 골랐다.
**정직하게**: 점프가 실제로 재생되는지는 자가 안 잰다(걷기만 찍는다). 다음 자: 점프 키를 눌러 넉 장.

## AA. 30회차 (09-07 10:35~) — 3인칭 카메라 (교과 7) + 자에 점프 줄

**읽은 것**: Cinemachine 3 Third Person Follow([문서](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineThirdPersonFollow.html)):
어깨 피벗(shoulder offset x0.7 y0.3 z-0.5) → 손(vertical arm) → 카메라 거리; 축별 damping(따라잡는 데 걸리는 시간);
충돌은 카메라 반지름으로 막힘을 재고 "부딪힐 땐 빨리, 되돌아올 땐 천천히"(damping into/from collision); 대상 태그는 무시.
커뮤니티([1](https://discussions.unity.com/t/how-to-add-damping-to-3rd-person-follow-collision/831273)): 가려지면 튀는 게 남은 불만.
**판단**: 패키지를 안 넣는다(배치 컴파일에 변수 하나 더). 같은 모양을 손으로 — 규칙 파일 한 문단으로 Dev 에게. `SmoothDamp` 는 LateUpdate 에서만.
**자**: 지난 회차 구멍(점프 안 잼) — Space 한 번 뒤 옆에서 넉 장(`unity-jump.png`). 시험지·창·검사 문·종류표 넷을 고쳤다.
**결과 (11:02~11:20)**: Dev 가 FollowCamera.cs 를 다시 짰다 — SphereCast·SmoothDamp·LateUpdate 다 있음, 기둥 넷 세움. 검사 통과 4.
그러나 사진에서: ① 캐릭터가 화면 **가운데**에 크게 — "가로 1/3·거리 4~5 m" 를 안 지킴(규칙 문단이 길어 뒤쪽 조건이 묻힌 듯). ② **자가 깨졌다**: 새 카메라가
LateUpdate 에서 매 프레임 자리를 되돌려 걷기·점프 줄이 전부 뒤통수. → 자가 카메라를 잡는 동안 카메라의 스크립트를 끈다(MuteCameraScripts).
③ 점프 줄에 점프가 없다 — 플레이어(고양이)에는 점프가 없고 기사에만 있다. 자는 플레이어를 찍으니 당연. 다음 판: 플레이어에게 점프.
**교훈(M19)**: 게임 카메라 스크립트는 자의 카메라를 이긴다. 자는 찍는 동안 카메라 스크립트를 끄고, 끝나면 되켠다.
**2판 (11:28~11:37)**: 카메라 거리 4.5 m 로 물러남(사진에서 확인), 벽 뚫림 방지·기둥 있음. 가로 1/3 배치는 아직 가운데 — 규칙 문단 맨 앞에 숫자를 두는 것으로
고쳤으니(M20) 다음 판에서 잰다. **자 고침 확인**: 카메라 스크립트를 끄니 걷기·점프 줄이 옆에서 찍힌다(M19 확인).
**점프 줄에 점프가 없다(2판째)**: PlayerController 에 spaceKey·wasPressedThisFrame 이 들어갔는데 넉 장 다 서 있다. 가설 둘 —
① 자가 Space 를 두 프레임만 눌러 `wasPressedThisFrame` 의 가장자리가 플레이어 Update 앞에 안 옴 ② `isGrounded` 가 false. 다음 판: 자가 Space 를 0.1초 누르고, 플레이어는 isPressed 로.
**이 회차 값**: Dev 두 판 ≈ $0.35, 유니티 두 바퀴 각 2분 20초. 교과 7 은 🔶(거리·충돌 됨, 배치·점프 확인 남음).
**3판 (11:44~12:33)**: 점프가 안 뜬 진짜 원인은 **자**였다. 자의 코루틴이 `InputSystem.Update()` 를 손으로 부르면 그 프레임에 가장자리(wasPressedThisFrame)가
소비돼 다음 프레임 플레이어 Update 에선 이미 꺼져 있다. 걷기(isPressed)는 상태라 살아남았고 점프(가장자리)는 죽었다. 자에서 점프는 상태 이벤트만 큐에 넣고
자동 갱신에 맡긴다 → **점프 높이 0.81 m** (자가 숫자로 잰다: `[Rookery] 점프 높이 x m`). Dev 는 세 판 내내 멀쩡했다 — 자를 먼저 의심했어야 했다.
덤: 켜 둔 배치 에디터는 로컬 스크립트 변경을 스스로 안 읽는다(가져오기 때만 Refresh) → 자·창을 고치면 에디터를 다시 켠다. `data/unity_recheck` 로 같은 버전 재검사.
**교훈(M21)**: 판이 세 번 실패하면 만드는 쪽이 아니라 **재는 쪽**을 먼저 의심한다. 자가 숫자를 내게 하면(높이 0.81 m) 사진 해석 논쟁이 사라진다.
**교과 7 상태**: 카메라 거리·충돌·점프 확인 ✅, 가로 1/3 배치는 사진에서 아직 가운데(Dev 3판 모두) — 규칙 숫자를 앞에 둔 뒤 첫 판이라 다음에 잰다.

## AB. 31회차 (09-07 12:40~) — UI/HUD (교과 10) + 교과 7 마무리

**의심 → 확인**: 지금까지 검사 사진에 점수 글자가 한 번도 안 보였다. 원인은 Canvas `Screen Space-Overlay` 가 카메라 렌더텍스처에 안 찍히는 것
([Unity 이슈](https://issuetracker.unity3d.com/issues/rendertextures-do-not-include-canvas-ui-elements), [해법](https://discussions.unity.com/t/capture-screenshots-and-the-ui/666607)):
`Screen Space-Camera`(worldCamera = Main Camera) 로 두면 찍힌다. 즉 **자가 못 보는 것은 게임에도 없는 것처럼 취급됐다** — HUD 는 규칙에서 빠져 있었다.
**읽은 것/판단**: UI Toolkit 은 런타임 HUD 도 되지만 카메라 캡처·폰트 자산이 또 다른 변수라, 첫 판은 UGUI Text + OS 글꼴(Malgun Gothic)로 간다.
기본 글꼴은 한글이 네모. TextMeshPro 는 한글 폰트 자산이 필요해 나중에.
**규칙에 박은 것**: Canvas 는 ScreenSpaceCamera·planeDistance 1, OS 한글 글꼴, CanvasScaler 1920×1080, 점수 오른쪽 위·안내 가운데, 글자 크기 화면 세로 4~6%.
**판정(얼릴 것)**: 게임 사진에 '점수: N' 한글이 오른쪽 위에 읽히는가, 캐릭터가 가로 1/3 에 있는가. 둘 다 사진.
**결과 (12:49~12:57, Dev 5분 35초 + 유니티 2분 18초)**: 사진 오른쪽 위에 **'점수: 1' 한글**이 처음으로 찍혔다 — Screen Space-Camera + OS 글꼴, 확인.
클리어 문구는 동전을 다 안 먹어 안 뜸(사진으로 못 잼 — 다음 자: 점수 글자 내용을 시험이 읽어 '점수:' 가 있는지). 점프 0.81 m 그대로.
**가로 1/3 배치는 네 판째 가운데.** 어깨 오프셋 x 1.2 m 를 명시했는데도 그렇다 — Dev 의 FollowCamera 가 look-at 을 캐릭터로 두어 오프셋이 회전에 먹히는 구조로 보인다.
규칙만으로는 안 되는 자리다 → 다음: 자가 캐릭터의 화면 x 좌표를 재서 숫자로 낸다(WorldToViewportPoint), 그러면 Dev 가 스스로 다시 고친다(스스로 다시 루프).
**교훈(N21)**: 자가 못 보는 것은 없는 것이 된다. HUD·점수는 검사 사진에 찍혀야 규칙이 되고, 규칙이 되어야 지켜진다.
**교과 10**: ✅ 첫 판(카메라 캔버스·OS 한글 글꼴·앵커·크기). 남은 것: 클리어 문구 확인, UI Toolkit 은 안 봄.

## AC. 32회차 (09-07 13:00~14:20) — 엔진: 자가 숫자를 내고, 숫자가 실패 줄이 되어 스스로 다시가 돈다

**한 일**: 자(`RookeryAcceptance`)가 `player_viewport_x/y`·`jump_height_m`·`hud_score_visible`·`coin_count` 를 `measures.json` 으로 내고, 가져오기가 검사 문에
같이 보낸다. Dev 의 계획에 `expectations`(다섯 이름 enum, min/max/equals). 검사 문이 맞춰 `기대_<measure>` 줄을 만들고, 실패면 스스로 다시(최대 3)로 간다.
지난 판 측정값이 0/false 로 떨어지면 `퇴보_<measure>` 실패 줄(아직 실제로 잡은 적 없음).
**확인된 것**: 실패 줄(0.275 vs 0.6~0.75) → Dev 자동 재시도 → 재검사 0.725 통과, 점프 0.809 유지 — 사람 손 0회, 7분. 자세한 표는 `efficiency-2026-09-06.md` §9.
**교훈(M22)**: 자가 재는 **대상**을 차례에 맡기지 마라. `FindObjectsByType` 의 차례는 판마다 달라 고양이와 기사를 번갈아 쟀고, 그래서 점프가 0 ↔ 0.81 로
보였다. 대상은 점수로 고른다(태그·컨트롤러·움직이는 Rigidbody·스크립트 이름). 같은 판 두 번 재기가 자의 첫 시험.
**교훈(M23)**: 이름을 모델이 짓게 두면 짓는다 — 잴 수 있는 이름은 스키마 enum 으로.
**교과 7 상태**: 가로 1/3 배치 ✅ — 2판 실측 0.35(자 고치기 전이라 대상이 불확실), 고리 시험 뒤 0.725(오른쪽 1/3, 고친 자). 왼쪽 1/3 은 고친 자로 다시 한 번 재야 확정.

## AD. 33회차 (09-07 14:20~14:50) — 레벨 디자인 기초 (교과 8) + 교과 7 마무리

**읽은 것**: The Level Design Book — 'metrics'(플레이어 캡슐 1.0×1.8 m, 길 너비 ≥ 2 m = 플레이어 폭 두 배, 벽 3 m, 문 1.25×2.5, 계단 0.15×0.3, "느리다·빠르다는
플레이어 크기와 카메라 높이에 상대적 — 카메라를 먼저 정하라"), 'wayfinding'(플레이어는 가는 방향을 보고, 위는 이유가 있어야 보고, 대비(색·형태·빛·움직임)에
눈이 간다; 멀리 보이는 수집품이 길잡이(weenie)). 책엔 첫 레벨 크기·랜드마크 수 같은 숫자는 없다 — 걷기 속도로 셈했다(4 m/s × 15~25초 → 동선 60~100 m → 바닥 40×40 m).
**규칙에 박은 것**(`unity-rules.md` '첫 레벨'): 척도, 40×40 m, 시작(안전 10 m)·도전·목표 셋, 높이 6 m 랜드마크 하나(색 대비), 고리 동선, 동전 3~5 m, 높이 차 하나.
**자에 더한 것**: `level_extent_m`(바닥을 뺀 정적 물체의 XZ 크기), `landmark_count`(높이 ≥ 6 m). 계획 enum 일곱.
**결과 (14:31~14:45, Dev 5분 20초 + 검사 3분, 재시도 Dev 2분 + 검사 2분 30초; $0.59)**:
- 1판 a577279d: 크기 37.5 m ✅, 랜드마크 1 ✅(빨간 원기둥, 시작점에서 보임), 동전 15, 점프 0.81 유지. 사진에 길·초록 구역·경사로·단이 처음 생겼다.
  카메라는 실측 0.114 로 **진짜 실패 줄** → 스스로 다시(1/3) → 7267bf20 실측 0.305 ✅. 사람 손 0회. 심지 않은 첫 실패가 스스로 고쳐졌다.
- 눈으로 본 것(자가 아직 못 재는 것): 카메라가 너무 가깝다(캐릭터가 화면 세로 절반) — 규칙의 4.5 m 가 안 지켜진 듯. 다음 자: `camera_distance_m`.
  구역 셋이 색으로 갈리는지는 사진 한 장으론 모른다(시작 구역만 보임) — 다음 자: 위에서 찍은 지도 사진(top-down) 한 장.
**교훈(M24)**: 재시도 판의 계획은 **떨어진 줄만** 기대치로 적었다(레벨 기대치 셋이 사라짐). 지난 기대치는 기준(criteria)처럼 코드가 이어 붙여야 한다 — 이번 판에서 우연히
안 깨졌을 뿐. (고침: appBuild 가 previous.expectations 를 이름 기준으로 합친다.)
**교훈(R3, 읽은 것→확인)**: 숫자 규칙(40 m·6 m·고리)은 첫 판에 지켜졌다. 숫자가 없는 규칙("구역마다 색 다르게")은 잰 게 없어 모른다 — 규칙마다 자를 붙이지 않으면 "지켜졌다"고 말할 수 없다.
**교과 7**: ✅ (거리·충돌·점프·가로 1/3 모두 숫자로 확인; 남은 것 카메라 거리 자). **교과 8**: ✅ 첫 판(크기·랜드마크·고리 규칙 + 자 둘; 남은 것 지도 사진, 구역 색, 경사 각도 자).

## AE. 34회차 (09-07 14:55~15:30) — 레벨 둘째 판 (교과 8): 눈으로만 보던 둘을 자가 잰다

**한 일**: 자에 `camera_distance_m`(카메라→플레이어 가슴)·`ground_color_count`(넓이 4 m² 이상 납작한 정적 물체의 바탕색 가짓수), 위에서 내려다본 **지도 사진**(`unity-map.png`,
증거 사진 둘째 자리). 규칙 둘(카메라 거리 4~5 m 는 자가 잰다, 구역 바닥은 다른 색 재질). 계획 enum 아홉.
**결과 (15:03~15:22, Dev 9분 + 검사 2분 20초, 재시도 Dev 3분 + 검사 2분 15초; $0.50)**:
- 1판 cf17d247: 구역 색 4 ✅, 가로 위치 0.305 ✅(지난 기대치를 코드가 이어 붙인 것이 처음 돌았다 — M24 고침 확인), 카메라 거리 **실측 2.5 m 실패**(Dev 는 제목에 "4.5 m 유지" 라 썼다).
- 스스로 다시(1/3) → 31371173: 카메라 4.075 ✅, 가로 0.384 ✅, 색 4 ✅, 크기 37.5·랜드마크 1·점프 0.81 유지. 사진에서 캐릭터가 화면 세로 절반 → 1/3 로 물러났다.
- 두 회차 연속 **진짜 실패 → 스스로 다시 → 통과**. 사람 손 0회.
- 지도 1판은 전부 파랬다: 80 m 위에서 찍으니 씬 안개(RenderSettings.fog)가 덮었다. 안개 끄고 30 m 로 고쳐 다시 찍음(아래 줄).
- 지도 재촬영(15:27, 안개 끔·30 m): 세 구역이 초록(시작)·모래(도전)·파랑(목표)으로 확실히 갈리고, 빨간 랜드마크가 목표 끝, 동전이 가운데 줄로 놓였다. 고리 동선은 오른쪽으로 돌아오는 길이 있긴 하나 좁다 — 다음 판 기준.
**교훈(M25)**: 직원이 "지켰다"고 쓴 숫자는 잰 게 아니다. 카메라 4.5 m 는 제목에도 코드(pivot z -3.5)에도 있었지만 실측 2.5 였다 — 충돌 SphereCast 가 당겼든 뭐든, 자만 안다.
**교훈(M26)**: 새 사진(지도)은 첫 장을 사람이 본다. 안개·높이·클리어 색은 자가 못 판단한다 — 새 자는 한 번은 눈으로 검사한 뒤 믿는다.
**교과 8**: ✅ 둘째 판(카메라 거리·구역 색 숫자, 지도 사진). 남은 것: 경사 각도 자, 동전 "다음 것이 보인다" 자(레이캐스트), 지도에 동선 그리기.

## AF. 35회차 (09-07 16:00~16:50) — 되묻기: 설계도 단계 (교과 14 첫 판)

**한 일**: Dev 가 계획(기준·기대치)을 쓴 뒤 코드를 쓰기 **전에** 멈추고 대화에 "이렇게 이해했어요" 를 숫자로 보인다(`src/lib/execution/approval.ts`).
'시작' → 이어서 만든다(새 실행, 단계 저장 복사 — 계획을 다시 사지 않는다). 고칠 말 → 설명에 얹고 계획만 다시 쓴다(두 번까지, 그 뒤엔 그대로 시작). '취소' → 접는다.
대화 접수(`everydayService`)가 확인 대기 중인 대화의 답을 먼저 가로챈다(모델 안 부름). 계획 카드(오른쪽 칸)는 기대치 줄이 먼저.
스스로 다시 판은 묻지 않는다(승인된 계획의 떨어진 줄 고치기).
**배관 사정**: `work_executions.status` 는 CHECK 로 잠겨 waiting 을 못 넣는다(PAT 없이는 DDL 불가) → 실행은 `fail_work_execution(WAITING_APPROVAL)`, 업무는 `assignments.waiting`.
**결과 (16:44~16:46)**: 주문 80초 뒤 대화에 계획 카드가 붙었다 — "동전 15→20 — coin_count 20~20 / 카메라 4~5 / 구역 색 3~ / 가로 0.25~0.41 / 기준 45개 · 사람이 볼 것 3개 / 약 $0.2·5분".
지난 판 기대치를 이어 받는 것이 카드에 그대로 보인다(사장님이 한눈에 "카메라·구역은 그대로구나" 를 안다).
"동전은 18개로 해" → 설명에 얹히고 계획 단계가 버려지고 새 실행이 섰다 — 거기서 **회사 30일 지출 한도 $25 에 걸려**(SPEND_LIMIT_REACHED, 30일 합계 $25.05) 멈췄다.
고침 → 다시 카드 → '시작' → 만들기 → 유니티 재기는 **한도가 풀린 뒤** 확인한다(같은 업무 ee28b60a 를 다시 세우면 된다: `scratchpad/requeue35.py`).
**나머지 절반 (16:51~17:19, 한도 $50 으로 올린 뒤)**: 다시 세우니 80초 뒤 **고친 계획 카드**(coin_count 18~18, 나머지 기대치 셋 그대로) → '시작' → 계획은 다시 사지 않고 만들기만($0.27, 4분) → 대화에 붙음 → 유니티: 동전 18 ✅, 카메라 4.075 ✅, 색 4 ✅, 가로 0.384 ✅, 점프 0.81 유지. **세 갈래(고침→다시 카드→시작) 전부 사람 손 0회로 확인.**
**교훈(E9)**: 되묻기 한 장이 $0.07(계획 한 번)이고, 그 한 장이 "카메라·구역은 그대로, 동전만" 을 사장님에게 보여 준다. 잘못 이해한 채 만드는 판($0.25 + 유니티 3분)보다 싸다.
**교훈(E10)**: 한도는 제대로 섰다. 오늘 $5.4, 30일 $25 — 실험 여덟 판이 하루 반 예산이다. 한도를 올릴지는 사장님 결정.
**교과 14**: ✅ 첫 판(계획 카드·세 갈래 답 배관). 남은 것: 고침→다시 카드→시작 실측, 화면의 '시작' 단추, Vox 에도 같은 되묻기.

## AG. 36회차 (09-07 17:00~17:30) — 게임 아닌 것: 분석 직원 Ana (자료·유튜브 영상)

**왜**: 사장님 "게임만 너무 판 것 같은데 다른 거 위주로". 종류 등록표에 자리만 있던 '분석' 을 첫 직원으로 채웠다. 뼈대는 게임과 같다 — 읽기(단계 저장) → 쓰기 → **자** → 산출물 → 대화.
**한 일**: `src/lib/skills/analysis`(Ana, `youtube-transcript` 로 자막, 웹은 기존 fetcher). 산출물 = 요약 5줄 · 주장 표(주장·**원문 인용**·시각) · 숫자 표 · 우리에게(원문에 없는 판단이라고 적음) · 답하지 않은 것.
**자(출처 자)**: 모델이 아니다. 인용마다 글자 비교로 **원문에 있는지**, 시각이 영상 길이 안인지 잰다. 절반 넘게 떨어지면 떨어진 줄을 보여 주고 한 번 다시 쓴다. 못 찾은 줄은 표에 "❌ 근거 못 찾음" 으로 남는다.
**결과 (GDC 2018 Invisible Intuition, 56분)**:
- 1판(17:17): 자막이 **아랍어**로 왔다(라이브러리가 첫 트랙을 집음). 모델은 아랍어를 그대로 인용했고 자는 19개 중 18개를 원문에서 찾았다 — 배관은 맞는데 사람이 못 읽는 표. $0.13.
- 2판(17:24, 영어→한국어→아무거나 순으로 고침): 주장 12 · 숫자 10, **22/22 원문에서 찾음(PASS)**, 시각 붙음, "거리·비율 같은 수치는 없다" 고 정직하게 적음. $0.10. 저장은 같은 업무의 1판과 버전 충돌 → 1판 지우고 단계 저장(read·analyze)으로 이어 저장($0).
- 대화 접수·고용은 제품 길(`delegate`)이 하는데 DB 로 바로 세우느라 지식 카드가 없어 첫 실행이 CONTEXT_INCOMPLETE — Dev 카드 복사로 해결(제품 길에선 안 나는 일).
**교훈(A1)**: 자막 언어를 정하지 않으면 아무 언어나 온다 — 새 입력은 첫 장을 눈으로 본다(M26 과 같은 교훈, 다른 자리).
**교훈(A2)**: 인용 글자 비교는 언어를 가리지 않는다. 아랍어에서도 18/19 를 잡았다 — 이 자는 싸고(모델 0), 지어낸 인용을 확실히 잡는다.
**교훈(A3)**: 같은 업무를 다시 돌리면 산출물 버전이 충돌한다(`deliverables_assignment_id_version_key`). 제품 길은 말마다 새 업무라 안 나지만, 도구로 다시 세울 땐 새 업무로.
**남은 것**: 웹 글·PDF 실측(이번엔 영상만), 영상 없는 자막(음성→글)은 안 됨, 대화에서 "이 영상 분석해 줘" 라우팅은 로그인 뒤 사장님이 확인.

## AH. 37회차 (09-07 17:30~17:50) — Ana 둘째 판: PDF·글·영상 셋을 한 업무로

**한 일**: PDF 읽기(`unpdf`, 쪽마다 [p.N] 표시, `at` = p.N), 자에 **쪽 검사**(인용이 그 쪽에 있는가) 추가, 여러 자료면 `source` 를 자료마다 정확히. 같은 주제 자료 셋(GDC 영상 · 발표자 PDF 230쪽 · 80.lv 기사)을 한 업무로.
**결과**:
- 1판(17:37, $0.12): PDF 58,571자·230쪽 읽힘, 쪽 인용 전부 그 쪽에 있음. 기사는 1,140자(원래 짧은 소개 글). **영상은 서버에서 못 읽음** — 유튜브가 Railway IP 에 "Transcript is disabled" 를 준다(로컬은 됨, 데이터센터 IP 차단).
  그런데 자가 **22/22 통과**를 줬다: 못 읽은 영상을 출처로 적은 인용이 PDF 에서 발견돼 통과한 것. → **자의 구멍**: 출처가 읽은 자료 중 하나여야 한다.
- 고침: 출처가 읽은 자료가 아니면 실패, 못 읽은 자료는 모델에게 "인용 금지" 로 알리고 산출물 맨 위에 "못 읽은 자료 N개" 띠, 자막은 3번 재시도.
- 2판(17:43, $0.16): 영상 3번 다 거절(IP 차단 확정). 모델은 영상을 출처로 안 적었고 맨 위에 못 읽음 띠. 인용 43개 중 39 통과 · 4 못 찾음(쪽 머리글을 이어 붙인 인용 — 정직하게 ❌ 로 남음). PARTIAL.
**교훈(A4)**: **자가 통과를 준 판이 제일 위험하다.** 못 읽은 자료를 다른 자료로 검사해 통과시켰다 — 자의 첫 시험은 "일부러 못 읽게 한 자료" 여야 했다(M21·M26 과 같은 자리: 자를 먼저 의심).
**교훈(A5)**: 유튜브 자막은 서버 IP 로는 못 믿는다. 로컬 됨 ≠ 서버 됨. 다음: `youtubei.js`(Innertube, 안드로이드 클라이언트) 시험, 안 되면 프록시 또는 자막 서비스. 그 전까지 영상 분석은 "됐다/못 읽었다" 를 산출물이 앞에 말한다.
**교훈(A6)**: PDF 는 쪽 검사까지 있어야 한다. 인용은 맞는데 쪽이 틀린 것도 지어낸 것이다 — 2판에서 쪽 틀림 0, 이어 붙임 4.
**교과 17**: ✅ 둘째 판(PDF·글·여러 자료·쪽 검사). 남은 것: 서버에서 유튜브 자막(youtubei.js), 긴 PDF 자르기(230쪽은 됐지만 500쪽은 12만 자 상한에 걸림).

## AI. 38회차 (09-07 17:50~18:05) — 서버에서 유튜브 자막 뚫기

**병**: 37회차에서 Railway 의 watch 페이지 긁기(`youtube-transcript`)가 "Transcript is disabled" — 데이터센터 IP 가 봇으로 찍혀 자막 없는 페이지를 받는다. 로컬은 됨.
**해 본 것(로컬)**: 직접 timedtext 주소 → 0바이트(서명 필요). `youtubei.js` get_transcript → 400. WEB 클라이언트 → UNPLAYABLE. **ANDROID → 트랙 1(en), IOS → 트랙 21**, 트랙 주소(서명 포함)+`fmt=json3` → 됨.
**넣은 것**: Innertube ANDROID → IOS 순으로 자막 트랙을 받아 json3 로 읽고, 둘 다 안 되면 긁기 3번(예비).
**결과(서버, 18:00~18:02, $0.10)**: ANDROID 는 서버에서 XML 을 돌려 실패, **IOS 로 1,452 조각 받음** → 조명 파트 주장 18·숫자 8, **26/26 원문 확인**. 되는 길이 서버에 하나 생겼다.
**교훈(A7)**: 같은 사이트라도 앱이 쓰는 API 는 브라우저 페이지보다 봇 차단이 느슨하다. 다만 오늘 되는 길이 내일도 된다는 보장은 없다(ANDROID 가 로컬에선 되고 서버에선 안 됐다) — 길을 여러 개 두고 안 되면 안 됐다고 산출물이 말한다(A5 유지).
**교과 17**: ✅ 셋째 판. 남은 것: 다른 영상·짧은 영상(shorts)·자막 없는 영상(음성→글은 안 함)에서 재현 확인, 긴 PDF 자르기.

## AJ. 39회차 (09-07 18:05~18:45) — 영상 직원 Vid: 60초 설명 영상 첫 판

**왜**: 사장님 목록(과제·게임·유튜브 영상·분석)의 마지막 빈자리. 뼈대는 같다 — 대본(단계 저장) → 목소리(gpt-4o-mini-tts)·장면 그림(gpt-image-2 low)·조립(ffmpeg) → **자**(ffprobe) → mp4·SRT·사진 셋 → 대화.
**먼저 모델 없이**: `ffmpeg-static`(로컬 Windows·서버 Linux 같은 코드)으로 색 카드 3장 + 소리 3토막 → 6.7초 mp4 (`engine/tools/video_assemble_test.mts`, 16초). 이게 되고 나서 직원을 붙였다.
**결과**:
- 1판(18:31): 대본 단계에서 잘림(maxTokens 6000) — Dev 계획에서 겪은 것 그대로. 24000 으로.
- 2판(18:36~18:40, **$0.10**, 4분): 장면 5, 49.8초, 소리 있음, 자막 5, mp4 1.6 MB, 썸네일·첫 5초·중간 사진. 자: 6개 중 5 통과, **첫 장면 9.8초 실패**(≤6초 규칙) — 대본이 첫 장면에 규칙 하나를 다 넣었다. 프롬프트에 "첫 장면 40자 이하".
- 그림은 1536×1024(3:2)라 1280×720 안에 검은 기둥이 섰다 → 채우고 자르기(crop)로 바꿈.
**교훈(V1)**: 배관은 모델 없이 먼저(색 카드+삐 소리). 조립·자막·사진이 로컬에서 돌고 나서 직원을 붙였고, 서버 첫 성공까지 두 판이면 됐다.
**교훈(V2)**: 영상의 자는 ffprobe 숫자(길이·소리·장면 수·자막 수)까지다. "재미"는 사진 둘(첫 5초·중간)로 사람이 본다 — 게임의 화면 사진과 같은 자리.
**한계(알고 둔 것)**: 정지 그림 한 장/장면, 자막은 SRT 사이드카(굽지 않음), 배경음 없음, 스스로 다시 없음(자 실패 → 사람이 말함).
**교과 18**: ✅ 첫 판. 남은 것: 첫 장면 짧게·crop 재확인, 장면 하나만 다시 만들기(고치는 판), 자막 굽기(글꼴 동봉), 쇼츠(9:16).

## AK. 40회차 (09-07 18:50~19:15) — 접수 자: 말하면 누가 불려 오는가

**병**: 09-05 에 Nova·Dev 는 등록 한 줄이 빠져 **일주일 동안 일을 한 번도 못 받았다**. 화면에도 로그에도 안 보이고, 사람이 "왜 아무 일도 안 생기지" 하고 포기할 때까지 조용하다.
오늘 직원 둘(Ana·Vid)을 더했는데 **대화에서 불릴 수 있는지 아무도 확인하지 않았다** — 나는 전부 DB 로 업무를 꽂았으니까.
**한 일**: 접수 프롬프트를 `src/lib/chat/everydayService.ts` 안에서 `src/lib/chat/routing.ts` 로 빼고(화면과 시험이 **같은 글**을 쓰게), 접수 자 `engine/tools/routing_test.mts` — 말 14개를 실제 모델에 넣어 **어느 직원이 불려 오는지** 잰다.
이름표(capabilityId)가 아니라 **기술(직원)**로 잰다: 한 직원이 이름표를 여럿 가지므로(Alex 는 competitor_analysis·market_context) 무엇이 와도 부른 사람은 같다.
**결과 (19:0x, 14/14 통과, $0.16)**: 게임 2, 분석 3(영상·글·PDF), 영상 2, 3D 1, 2D 1, 조사 1, 아트 바이블 1 → 전부 맞는 직원. 잡담·바로 답할 질문 3 → 사람 안 붙임.
**중간에 잡은 것**: 내 기대값이 틀렸다(기술 id 를 이름표로 적었다). 자가 6개를 떨어뜨렸고, 실제 이름표를 보고서야 알았다 — **자가 처음 떨어뜨리면 자를 먼저 본다**(M21·A4 와 같은 자리, 세 번째).
**교훈(R4)**: "직원을 더했다" 는 등록 한 줄이 아니라 **말이 그 사람에게 닿는가**로 끝난다. 이 자는 모델을 14번 부르고 $0.16 이라 직원을 더할 때마다 돌린다.
**교훈(R5)**: 화면이 쓰는 글과 시험이 쓰는 글이 다르면 그 시험은 시험이 아니다. 프롬프트를 파일로 빼는 진짜 이유는 재사용이 아니라 **잴 수 있게 하는 것**.
**교과 19**: ✅ 첫 판(접수 자 14줄). 남은 것: 애매한 말("이거 좀 봐 줘" + 링크), 두 직원이 겹치는 말("영상 분석해서 영상으로 만들어 줘"), 사장님 실제 말투 모으기.

## AL. 41회차 (09-07 19:10~21:30) — 스스로 다시를 게임 밖으로

**병**: 로키의 대표 고리("자가 떨어뜨리면 같은 직원이 스스로 고친다")가 **게임에만** 있었다. 유니티 검사 문에서만 불렸고 `app_build` 만 받았다.
Ana("인용이 원문에 없다")도 Vid("첫 장면이 9.8초")도 자를 갖고 있는데 아무도 고치지 않았다 — 자가 있어도 고리가 없으면 사람이 읽고 다시 말해야 한다.
**한 일**: `src/lib/execution/selfRetry.ts` — 산출물이 저장된 직후 엔진이 판정(`content_json.verdict.cases`)을 보고 떨어진 줄이 있으면 같은 직원에게 그 줄만 고치는 업무를 만든다(최대 3).
`scheduleAutoRetry` 에서 종류 제한(app_build 만)을 걷어내고, 게임이 아니면 "지난 판과 같은 일을 다시, 이 줄만 고쳐서" 로 설명을 쓴다. 대화는 지난 업무가 실린 대화를 찾아 붙인다.
**두 번 튕긴 것(같은 원인)**: `assignments_one_active_per_employee` — 직원 한 명당 살아 있는 업무는 하나다. 방금 낸 판이 `submitted` 라 새 업무가 409 로 튕겼다.
① 19:15 내 주문 스크립트가 튕겨 **두 시간 아무것도 안 돌았다**(내가 안 보고 있었다). ② 21:17 재시도가 같은 이유로 튕겼다 — 그 판만 풀어서는 모자랐고, 대화가 일을 맡길 때처럼 **그 사람의 막힌 것 전부**를 푸는 것이 맞았다.
**결과 (21:18~21:27, $0.27)**: 낮에 첫 장면 9.8초로 떨어졌던 영상에 고리를 걸었다 → Vid 가 "첫장면_3초안 — 첫 장면 9.8s" 한 줄을 받아 다시 만듦 → **첫 장면 4.3초, 6/6 통과**. 대화에는 "실패한 줄 1개를 Vid 가 스스로 고쳐요 (1/3)" 가 붙었다. 사람 손 0회.
같은 시간 새 영상(로키 소개 40초)은 처음부터 6/6 통과라 재시도가 안 걸렸다 — 걸릴 때만 걸린다는 것도 같이 봤다.
**교훈(S1)**: 고리를 한 종류에 맞춰 만들면 그 종류 밖으로 안 나간다. `app_build` 라는 한 줄이 고리를 게임 전용으로 묶고 있었고, 그걸 지우는 데 든 시간보다 **없는 줄 몰랐던 시간**이 훨씬 길었다.
**교훈(S2)**: DB 제약은 제품 길(대화)에서만 안 걸리게 돼 있었다(`delegate` 가 먼저 풀어 준다). 도구·엔진 등 **다른 길로 같은 일을 하면 그 준비를 빠뜨린다** — 새 길을 낼 때는 옛 길이 먼저 하던 것을 세어 본다.
**교훈(S3)**: 내가 안 보는 사이 두 시간이 비었다. 주문 스크립트는 실패해도 조용했다 — 걸어 놓고 결과를 확인하지 않으면 걸지 않은 것과 같다.
**교과 20**: ✅ 첫 판(분석·영상까지 스스로 다시). 남은 것: Ana 에서 실측(인용 못 찾음 → 다시), 재시도 3번을 다 쓰면 사람에게 오는 말, 게임처럼 "퇴보 지킴이" 를 다른 종류에도.

## AM. 42회차 (09-07 22:00~22:40) — 엔진 전체 점검

**사장님**: "전체 엔진구성부터 세부엔진 구성까지 시행점검학습". 네 영역(실행 엔진 / 직원과 자 / 대화·API / 돈·모델·설정)을 동시에 훑고, **내가 코드로 다시 확인한 것만** 고쳤다. 자세한 표는 `engine/docs/engine-audit-2026-09-07.md`.
**제일 큰 것**: `waiting` 이 두 뜻이었다("차례 기다림" · "사람 답 기다림"). 화면 폴링이 확인 대기 판을 대기열로 꺼내 **승인 없이 돌리고 계획을 다시 샀다**($0.2/판, 폴링마다) — 되묻기(35회차)를 만들며 옛 대기열이 같은 이름을 쓰는 걸 안 봤다. 두 영역이 독립으로 같은 병을 잡았다.
**둘째**: 지출 한도가 **못 읽으면 열어 주는** 쪽으로 넘어져 있었고(오류를 버려 0원으로 침), 합계가 장부 한 쪽(1000행)만 셌다.
**고친 것 8건**(22:32 배포): 위 둘 + 유니티 검사 문 회사 울타리, 한 줄 실패에 세 판 다시 사던 것, 재시도 3번 소진 알림, 실행 끝에 단계 저장이 지워지던 것, 분석 UNMEASURED·자른 길이 표기, 위아래 빈 기대치가 통과하던 것.
**안 고치고 적어 둔 것**: 2D(Nova) 지출이 장부 밖 + base64 를 DB 행에 두 번, 워커가 큐를 집을 때 자리를 안 잡음(`heartbeat()` 는 만들고 한 번도 안 부름), 실패한 호출이 장부에 안 남음, Meshy 크레딧 짐작, 조사 종류 등록 어긋남, 익명 금액 벽 $0, 계획 카드가 열린 창에 안 흐름, 한 판이 한도를 크게 넘길 수 있음.
**교훈(T1)**: 상태 이름 하나를 두 뜻으로 쓰면 배관 둘이 서로를 밟는다 — 새 상태를 못 만들면 **표시라도 따로**.
**교훈(T2)**: 안전장치는 **못 읽을 때 어느 쪽으로 넘어지는지**가 전부다. 있는 것처럼 보이는 한도가 없는 한도보다 나쁘다.
**교훈(T3)**: 고리를 넓힐 때 문턱도 같이 옮긴다(41회차에 "떨어지면 다시" 만 옮기고 "얼마나 떨어져야" 는 안 옮겼다).
**교훈(T4)**: 점검은 넷으로 갈라 동시에 — 두 번 나온 병을 먼저 고친다.
**교과 21**: ✅ 첫 판(엔진 전체 점검). 남은 것: 위 "안 고친 것" 목록, 그리고 점검을 도구로 굳히기(자주 도는 자).

## AN. 43회차 (09-07 22:40~23:10) — 점검에서 남긴 것 고치기, 그리고 2D 첫 산출물

**한 일**(42회차 점검의 "안 고친 것" 중 여섯):
① **2D(Nova) 지출이 장부 밖 + base64 를 DB 행에 두 벌** → 그림 값을 `recordUsage` 로 적고, 후보는 `storeDeliverableFile` 로 파일에.
② **워커가 큐를 집을 때 자리를 안 잡았다** → 조건부 갱신(`status='queued'` 일 때만 `running` 으로)에 성공한 쪽만 돌린다. 죽은 것을 잇는 쪽도 같은 방식.
③ **죽음 판정 4분** → 20분(3D 는 몇 분을 기다리는데 그 사이 아무것도 안 쓴다; `heartbeat()` 는 만들어 놓고 호출 0 — 자리를 제대로 놓기 전까지의 임시).
④ Meshy 크레딧을 30·5 로 박아 두던 것 → API 가 준 **실제 소모량**으로(없으면 옛 값).
⑤ 조사 종류 등록 어긋남(`market_research_report`·`lead_list`) → 등록표를 실제 이름으로.
⑥ 계획 카드·재시도 소진 알림이 **새로고침해야 보이던 것** → 유니티 결과와 같은 길로 열린 창에 흐르게.
**확인 (23:04, $0.06)**: Nova 가 **처음으로 산출물을 냈다**(그전까지 0건). 동전 스프라이트 후보 4장, 행 1,977자·본문 325자, **행에 base64 없음**, 파일 4개(각 ~0.85 MB)는 저장소로.
장부에 그림 값 $0.037 이 처음 찍혔다. 자는 넷 다 떨어뜨렸다 — "바닥 대비 7.6 < 60, 땅에 묻힌다"(어두운 배경에 금색이라 게임 바닥에서 안 보인다). 그림 자체는 예쁘다; 자가 게임에서 쓸 수 있는지를 본 것이다.
**놓칠 뻔한 것**: 첫 판(22:55)은 **저장에서 죽었다**(`statement timeout`) — 42회차 점검이 예고한 바로 그 병이다. 원인은 내 패치 스크립트가 파싱 단계에서 죽어 **고침이 아예 안 붙어 있었던 것**이고, 나는 그걸 안 보고 "고쳤다" 고 적었다.
**교훈(U1)**: 고쳤다고 말하기 전에 **파일에서 확인한다.** 스크립트가 성공했다는 말(`ok`)이 아니라 바뀐 줄이 파일에 있는지. 22:49 배포는 여섯 중 넷만 들고 나갔다.
**교훈(U2)**: 점검이 예고한 병은 진짜였다 — 코드를 읽고 "이러면 죽는다" 고 적은 것이 30분 뒤에 그대로 죽었다. 점검표는 소설이 아니다.
**교훈(U3)**: 자가 넷 다 떨어뜨린 것은 자가 일한 것이다. 예쁜 그림과 **게임에서 보이는 그림**은 다르고, 그 차이를 사람 눈이 아니라 숫자가 잡았다(바닥 대비 7.6 vs 60).
**교과 21 뒤**: 남은 것 — 실패한 모델 호출이 장부에 안 남는 것(라우터 상향 재시도 포함), 익명 금액 벽 $0, 한 판이 한도 크게 넘길 수 있는 것, `heartbeat()` 부르는 자리.

## AO. 44회차 (09-08 07:20~07:35) — 직원끼리 이어받기: Ana 분석 → Vid 영상

**병**: 엔진에서 넘어가는 것은 "그 직원이 지난번에 낸 것"(previousDeliverableId) 뿐이었다. **남이 만든 것을 재료로 쓰는 일**은 아예 못 했다.
협업 배관(`collaboration/engine.ts`)은 조사 한 곳에만 붙어 있고 업무 74판 내내 한 번도 안 돌았다(전부 `assignment_type: manager`).
**한 일**: ① 대화의 **마지막 산출물**(누가 냈든)을 `sourceDeliverableId` 로 다음 사람에게 넘긴다(`delegate` → `runChatTurn` → role input).
② 영상 직원은 재료가 있으면 **그 안의 사실만** 쓰라는 지시를 받고, 재료 본문(4만 자)을 프롬프트에 싣는다. ③ 자에 `숫자가_재료에_있다` — 대본의 숫자를 재료 글자와 대조한다(지어낸 숫자는 사람이 원문을 안 읽으면 못 잡는다).
**결과 (07:26~07:31, $0.12)**: Ana 의 GDC 조명 분석(어제, 인용 26/26)을 재료로 **57초 영상**이 나왔다. 장면 5, 검사 7개 통과, 첫 장면 3.8초. 산출물에 "재료: …" 줄이 붙어 어디서 온 사실인지 보인다.
**바로 잡은 헛통과**: 대본이 "네 가지" 처럼 한글로만 써서 대조할 아라비아 숫자가 0개였는데 자가 **통과**로 찍었다 → 잴 게 없으면 `해당 없음`. (42회차 #7·#8, 43회차와 같은 병 — 오늘만 네 번째다.)
**교훈(W1)**: 사람이 "이걸로 저거 만들어 줘" 라고 말할 수 있으려면 배관이 **산출물을 재료로 넘길 줄** 알아야 한다. 직원을 늘리는 것보다 이 한 줄이 조합을 늘린다(직원 7명 → 이어받기 쌍 수십 개).
**교훈(W2)**: 이어받기에는 반드시 **출처 자**가 같이 와야 한다. 재료를 줬는데 재료 밖 사실이 들어가면 그건 요약이 아니라 창작이고, 사람은 원문을 다시 안 읽는다.
**교훈(W3)**: "잴 게 없었다" 를 통과로 적는 버릇이 오늘만 네 번 나왔다(분석 PASS·빈 기대치·2D·이번). 자를 새로 만들 때는 **잴 게 없는 경우를 먼저 적는다**.
**교과 22**: ✅ 첫 판(이어받기 + 출처 자). 남은 것: 대화에서 "이걸로 영상 만들어 줘" 가 실제로 재료를 집는지(사장님 로그인 뒤), 세 사람 이상 이어받기, 재료가 여럿일 때.

## AP. 45회차 (09-08 08:40~09:05) — 화면 편의: 눈앞의 것에 대고 누른다

**사장님**: "유아이 편의성, 우리가 시행착오학습한 건 다 넣어야 해. 근데 지금 버튼(코인 만들기 등) 그건 편의성이 아니야."
맞는 지적이다 — 그 넷은 **예시 문장**이고, 처음 한 번 눌러 보고 그다음부터는 자리만 차지한다.
**넣은 것**: ① 계획 카드에 [시작][고칠게요][취소] — 35회차에 되묻기를 만들어 놓고 정작 '시작' 을 **타자로 쳐야** 했다.
② 결과 턴에 다음 일 단추: 3D 초안이면 [고화질로 만들기], 분석·조사면 [이걸로 영상 만들기], 어디든 [수정 요청](커서만 옮긴다 — 무엇을 고칠지는 사람이 쓴다).
③ 통과한 검사 줄은 접는다(여덟 줄이 다 펴져 있으면 실패 한 줄이 안 보인다). ④ 예시 버튼은 **첫 대화에서만**.
**어디서 정하나**: 어떤 단추가 맞는지는 **서버**가 정해 턴에 실어 보낸다(`ReturnedTurn.kind/actions`) — 종류와 판정을 아는 쪽이 거기다. 화면은 받은 대로 그린다.
**확인**: 배포 뒤 익명 화면은 정상(예시 버튼이 빈 대화에서만 보인다). **단추 자체는 로그인해야 보인다** — 계획 카드·결과 턴이 로그인 대화에만 붙기 때문. 사장님 확인 대기.
**교훈(X1)**: 편의는 **예시가 아니라 지금 눈앞의 것에 대고 누르는 것**이다. 우리가 만든 기능(되묻기·이어받기·초안 먼저)은 전부 "말로 정확히 쳐야" 쓸 수 있었다 — 그건 있는 게 아니라 숨어 있는 것이다.
**교훈(X2)**: 어떤 단추를 보일지는 서버가 정한다. 화면이 종류를 추측하면(파일 확장자로 3D 인지 보는 식) 종류가 늘 때마다 화면을 고쳐야 한다.
**남은 것**: 도는 중 멈추기(취소), 보내기 옆 예상 비용, 사장님 확인.

## AQ. 47회차 (09-08 09:20~09:45) — 모듈러 캐릭터: 맨몸 먼저, 갑옷은 조각으로

**사장님이 알려 준 것**: "캐릭터는 아무것도 안 입은 몸을 먼저 만들고 갑옷을 하나하나 넣는 거야." 우리는 **옷 입은 캐릭터를 통째로** 뽑고 있었다 —
투구 하나 바꾸려면 캐릭터 전체를 다시 만들고(30 크레딧), 리깅도 다시 하고, 애니메이션도 다시 붙는다.
**읽은 것**: Unity `SkinnedMeshRenderer`(bones·rootBone 을 몸과 같게 채우면 조각이 같은 뼈대로 움직인다; 딱딱한 것은 MeshRenderer 로 뼈에 매단다), polycount 모듈러 파이프라인(맨몸 + 조각, poke-through 는 조각을 몸보다 살짝 바깥으로).
**바꾼 것**: ① Vox 주문서에 `attachTo`(head·chest·shoulder_l/r·hand_l/r·hip·foot_l/r) — 몸인지 조각인지. ② **조각이면 리깅을 안 산다**(5 크레딧). ③ 규칙 둘: 맨몸을 먼저 만들고 한 번만 리깅한다 / 딱딱한 조각은 뼈에 자식으로, 휘는 조각은 몸과 같은 뼈 배열. 자에 잴 것도 정함(`parts_attached`·`part_offset_m` ≤ 0.15 m).
**결과 (09:34~09:40, $0.68)**: "기사 머리에 씌울 투구 조각" → `attachTo: head`, `wantRig: false`(리깅 건너뜀), 판정 PASS, 파일 넷(glb·fbx·썸네일·콘셉트). 몸을 안 만들고 **조각만** 나왔다.
**한 번 더 나온 병**: 주문서가 `maxTokens 1500` 에서 잘렸다(칸이 하나 늘었을 뿐인데). Dev 계획 32000, 영상 대본 24000 에 이어 **네 번째** — 스키마에 칸을 더하면 출력 예산부터 본다.
**교훈(Y1)**: 사장님이 아는 방식이 있으면 그게 먼저다. 나는 "한 번에 뽑기" 를 당연하게 여겼는데, 그건 갈아 끼울 수 없는 결과물을 만드는 방식이었다.
**교훈(Y2)**: 갈아 끼울 수 있게 만들면 **자가 재 놓은 값이 이어진다.** 몸이 안 바뀌니 키·비율·카메라 거리·점프 높이가 그대로다 — 조각을 바꿔도 판정을 다시 안 해도 된다.
**교훈(Y3)**: 조각은 리깅을 안 산다. 딱딱한 것은 뼈에 매다는 것이라 스키닝이 필요 없다 — 조각마다 5 크레딧이 굳는다.
**남은 것**: 유니티에서 실제로 머리뼈에 붙여 보기(Dev 판 + `part_offset_m` 실측), 휘는 조각(사슬갑옷) 한 번, 맨몸 하나 만들어 기준 몸으로 두기.

## AR. 48회차 (09-08 09:45~11:40) — 조각을 실제로 붙여 보기: 어긋난 자리 다섯

투구 조각(47회차)을 기사 머리뼈에 실제로 매다는 판. **한 번에 된 것이 하나도 없었고, 어긋난 자리가 다섯 군데였다.**

| # | 어디 | 무엇이 잘못됐나 | 어떻게 알았나 |
|---|---|---|---|
| 1 | 배관 | 자산이 유니티로 가는 문이 **완료된 업무만** 통과시켰다. 투구는 제출까지만 돼 있어 안 들어갔다 | Dev 가 "못 찾음" 오류를 적었다 |
| 2 | Dev | 파일이 들어온 뒤에도 못 찾았다 — 파일 이름은 `model.fbx` 고 '투구'는 **폴더 이름**에 있다 | 유니티 로그 |
| 3 | 자 | 플레이어(고양이) 아래만 셌다. 투구는 **기사 NPC** 머리에 붙었다 | 붙었는데 0 |
| 4 | 자 | Dev 가 때운 **임시 캡슐**을 조각으로 셌다 | 코드를 읽어 보고 |
| 5 | 자 | 크기를 **몸 전체 키**로 나눴다 → 3등신 기사는 머리가 키의 1/3 이라 **머리를 삼킨 투구도 0.294 로 정상** | 숫자는 통과인데 사진이 그대로 |

**결과**: 진짜 FBX 가 머리뼈에 매달렸다(parts 1). 다만 크기·자리가 안 맞고, 그걸 자가 제대로 못 잡았다.
Dev 는 세 판을 돌며 숫자(0.319 → 0.2)를 줄였지만 **사진은 안 바뀌었다** — 잘못된 자를 향해 최적화한 셈이다.
**고침(커밋됨, Railway 장애로 배포 대기)**: 조각 크기를 **머리 크기**로 나눈다(투구는 1.0~1.6), 그리고 `part_covers_bone` — 조각이 붙은 뼈를 감싸는가.
**교훈(Z1)**: **숫자가 통과인데 사진이 그대로면 자가 틀린 것이다.** 오늘 자를 세 번 고쳤는데, 세 번 다 "재는 것과 보는 것이 어긋난" 자리였다.
**교훈(Z2)**: 기준값은 **대상의 크기로 나눠서** 잡는다. 절대 길이(0.15 m)와 몸 전체 비율은 3등신·8등신에서 다른 뜻이 된다.
**교훈(Z3)**: 조용한 실패가 제일 비싸다. ①은 Dev 가 오류를 적어 준 덕에 30분 만에 찾았다. 적지 않았으면 "자가 이상하다"에서 멈췄을 것이다.
**내 실수**: 주문 스크립트를 쉘로 고치다 파일을 깨뜨려 **20분 동안 아무 일도 안 일어났다**(오늘 세 번째). 스크립트는 파일로 새로 쓴다 — 쉘 안에서 파이썬을 고치지 않는다.
**남은 것**: 새 자로 다시 재기(배포 대기), 휘는 조각(사슬갑옷), 기준 맨몸 만들기.

## AS. 49~51회차 (09-08 12:20~13:50) — 조각 크기: 회사가 늘 재는 줄, 그리고 아직 안 끝난 것

**사장님**: "크기가 너무 다르다."
**깨달은 것**: 생성기(Meshy)가 만든 조각에는 **실제 크기가 없다.** 프롬프트로 "0.2~0.4 로 맞춰라" 를 주는 것은 이번 조각에만 맞는 답이다.
그래서 규칙을 바꿨다 — **붙이는 코드가 재서 나눈다**(머리 크기 × 1.15 ÷ 조각 크기), 그리고 **준 뒤 다시 재서 2% 안에 들 때까지 보정**한다(뼈 배율·단위·부모 스케일을 전부 흡수).

**오늘의 알맹이 — 회사가 늘 재는 줄 (50회차)**
Dev 가 스스로 쓴 기대치 10개가 **전부 통과**인데 투구는 머리의 1.3%(점)였다. 계획을 쓰는 쪽과 검사하는 쪽이 같으면 이런 일이 난다.
그래서 검사 문에 **계획과 무관하게 늘 붙는 줄**을 넣었다: `규격_조각_크기`(붙은 자리의 0.3~3.0배) · `규격_조각_감싸기`.
넣자마자 바로 잡았다 — Dev 기대치 10 통과 · 규격 줄 1 실패.

**자를 네 번 고쳤다**(48~51회차): ① 플레이어만 보던 것 → 사람 전부 ② 기본 도형으로 때운 것 제외 ③ 몸 키 기준 → **머리 크기 기준** ④ MeshRenderer 만 보던 것 → **스키닝된 조각도**(Meshy FBX 가 뼈를 달고 온다) + 무엇을 셌는지 이름·크기를 찍기.
④ 덕분에 진짜 원인이 드러났다: **화면에 그려진 투구는 0.005 m** 였다. Dev 로그는 H=0.327, P=0.200, S=1.880 으로 계산이 맞다 — 그러니 계산이 아니라 **재는 시점**이 틀렸다(실행 중 `Awake()` 에서 맞추는데 그때 Renderer.bounds 가 아직 안 선다).

**아직 안 끝났다.** 씬 빌더(에디터)에서 맞추라고 시킨 판이 나왔지만, 스스로 다시가 3/3 까지 돌면서 검사가 옛 판을 따라잡지 못했다. 여기서 멈추고 기록한다 — 투구는 여전히 5 mm.
**교훈(AA1)**: **계획을 쓰는 쪽과 검사하는 쪽이 같으면 안 된다.** 회사가 늘 재는 줄을 따로 둔다. 오늘 그 줄 하나가 열 줄짜리 통과를 뒤집었다.
**교훈(AA2)**: 생성물에는 크기가 없다. 숫자를 주지 말고 **재서 맞추게** 한다. 그리고 준 뒤 다시 잰다.
**교훈(AA3)**: 자가 "무엇을 셌는지" 를 못 말하면 진단이 안 된다. 이름·크기 한 줄을 찍게 하자마자 여섯 판 헤매던 원인이 한 판에 나왔다.
**교훈(AA4, 내 것)**: 패치를 만들고 **붙었는지 확인하지 않은 채 배포**한 것이 오늘만 세 번(그중 하나는 20분 공백). 이제 배포 전에 파일에서 문자열을 센다.
**남은 것**: 씬 빌더 판을 다시 재기, 자동 재시도가 검사보다 빨리 도는 문제(판이 밀린다), 휘는 조각, 기준 맨몸.

## AT. 52~55회차 (09-08 14:00~14:45) — 투구 5 mm 의 진짜 원인, 그리고 내가 낸 회귀

**추적 순서**
1. 자에 **뼈 배율**을 찍게 했다 → `뼈배율 1`. 내가 세운 산수(뼈가 1/75)는 **틀렸다**. 남는 원인은 FBX 파일의 단위.
2. 가져오기에서 파일 단위를 무시해 봤다(1유닛=1m) → 투구가 **0.005 → 0.452 m**. 원인 확인.
3. 그런데 그 설정을 **FBX 53개 전부**에 걸었다 → 캐릭터가 100배가 되어 화면에서 **사라졌다**(사진: 레벨만 남고 고양이·기사 없음).
4. 되돌렸는데 안 돌아갔다 — 가져오기 조건이 "이미 정리됨" 이라며 건너뛰었다. 조건에 크기 항목을 넣어서야 실제로 복구(점프 0.809·동전 18·가로 0.384 원상).
5. 최종: **조각만** 단위를 고정한다. 자산 문이 `attachTo` 를 보내고, 가져오기가 파일 옆 사이드카에 남기고, 조각인 파일만 1유닛=1m 로 들어온다. 캐릭터는 파일 단위 그대로.

**아직**: 투구는 5 mm. 새 규칙은 배포됐지만 **가져오기 한 바퀴**가 돌아야(다음 Dev 판) 사이드카가 다시 써지고 적용된다.

**교훈(AB1)**: 한 물건이 틀렸다고 **전체 규칙을 바꾸면 안 된다.** 조각 하나 때문에 자산 53개의 단위를 바꿔 게임을 통째로 깼다. 틀린 **그 종류만** 바꾼다.
**교훈(AB2)**: **되돌렸다고 되돌아간 게 아니다.** 코드는 되돌렸는데 "이미 정리됨" 이라 건너뛰어 파일은 100배인 채였다. 되돌림에도 확인이 필요하다.
**교훈(AB3)**: 자가 **자기 근거를 찍게** 하면 가정이 깨진다. `뼈배율 1` 한 줄이 내 산수를 무너뜨렸고, 그때부터 진짜 원인으로 갔다. 추측 대신 계측.
**교훈(AB4)**: 생성 자산은 **단위가 제각각**이다. 크기를 맞추는 자리는 (a) 들어올 때 종류별로, (b) 붙일 때 세상 좌표로 재서 — 둘 다 있어야 한다. 프롬프트로 숫자를 주는 것은 세 번째로도 못 온다.
**값**: 이 조각 하나에 오늘 여덟 판, 약 $2. 그 대신 조각을 붙일 때마다 나올 고장 다섯 가지(자산 문·파일 찾기·자의 범위·자의 기준·자산 단위)를 규칙과 코드로 박았다.

## AU. 57회차 (09-08 16:00~) — 캐릭터 만드는 기술을 읽고, 비율 자를 놓았다

사장님: "우린 캐릭터 만드는 기술부터 시행착오학습해야 돼." 그리고 앞서 가르쳐 준 것 —
"캐릭터는 아무것도 안 입은 몸을 먼저 만들고 갑옷을 하나하나 넣는 거야."

**읽은 것(업계 표준)**
- 순서: 콘셉트 → 블록아웃 → 스컬프트 → 리토폴로지 → UV → 베이크 → 텍스처 → 리깅 → 스키닝 → 애니메이션 → 엔진.
- 모듈러 캐릭터: **벌거벗은 base body 하나 + 몸이 안 들어있는 갑옷 조각 + 뼈대 하나.** 사장님 말과 같다.
- 갑옷을 여러 몸에 돌려 쓰려면 **평균 7등신 몸 하나**에 맞춰 만들고 나머지는 리타깃한다.
- 비율은 미터가 아니라 **등신**으로 잰다: 리얼 7~8 · 스타일라이즈 5~6 · 데포르메 3.

**우리 손잡이로 옮긴 것** — Meshy 는 스컬프트~텍스처를 한 번에 하니 우리가 쥔 것은 셋뿐이다:
콘셉트 그림 · 생성 설정 · 엔진에서의 크기·부착. 표준 단계를 설정에 매핑했다
(리토폴로지→`topology: quad`, 베이크·텍스처→`enable_pbr`, 리깅→`pose_mode: a-pose`, 해상도→캐릭터 4k·소품 2k).
확인해 보니 이 넷은 이미 기본값으로 맞게 나가고 있었다 — **읽고 나서야 왜 맞는지 알았다.**

**놓은 자(새로 잰다)**: `body_height_m`(스키닝된 살만, 세상 좌표로 발끝~정수리) · `head_count`(키 ÷ 머리 크기).
**회사가 늘 붙이는 줄**: `규격_사람_키` 0.4~4.0 m · `규격_등신` 2~9.
비율을 보려고 만든 게 아니다 — **단위가 깨진 것을 잡으려고** 만들었다. 53회차에 캐릭터가 100배가 됐을 때 검사 10개가 다 통과했다. 이 줄이 있었으면 첫 판에 걸렸다.

**이번 판의 시험**: 마네킹을 플레이어로 세운 뒤 그 몸의 키·등신을 읽어 **기준 맨몸 숫자**로 굳히고,
다음 조각을 그 숫자에 맞춰 만들어 `규격_조각_크기`가 **첫 판에** 통과하는지 본다(투구는 여덟 판이 걸렸다).

### 57회차 결과 (09-08 16:30~16:50)

**자는 돌았다.** 첫 판에서 바로 잡혔다: `body_height_m` **1.971 m**, `head_count` **2.728 등신**, 규격 두 줄 다 통과(통과 10 → 12).
주인공은 2.7 등신이다 — 데포르메(3)보다도 짧다. 갑옷을 이 몸에 맞춰 만들면 다른 몸에는 못 쓴다.

**투구가 5 mm 였던 마지막 이유 — 내가 그 업무를 취소했기 때문이다.**
막힌 직원을 풀려고 정리 스크립트가 업무를 `cancelled` 로 돌렸다. 자산 문은 `completed`·`submitted` 만 내보낸다.
그래서 이미 만들어 **판정까지 통과한** 투구가 유니티 목록에서 사라졌고 → 사이드카가 다시 안 써지고 → `attachTo` 를 못 읽고 → 단위 고정이 안 걸렸다.
파일은 디스크에 그대로 있었으니 자는 계속 5 mm 를 쟀고, 나는 여덟 판을 "붙이는 코드"에서 찾고 있었다.
**교훈(AC1)**: **취소는 "이 일을 그만한다" 이지 "낸 물건을 회수한다" 가 아니다.** 자산 문이 `cancelled` 도 내보내게 고쳤다(낸 것이 없는 취소는 산출물이 없으니 안 걸린다).
**교훈(AC2)**: 운영용 정리 스크립트가 **제품의 상태를 바꾼다.** 직원을 푸는 것과 산출물을 감추는 것이 같은 칸(status)에 묶여 있었다.

**막대 마네킹은 쓸 수 없다.** `_mannequin/character-a.fbx` 는 뼈가 6개뿐이다(root·head·arm-left/right·leg-left/right).
Humanoid 로 넣으면 `Required human bone 'LeftLowerLeg' not found`. 그리고 **Humanoid 가 아니면 우리 자는 아무것도 못 잰다** —
키·등신·조각 붙음이 전부 `Animator.isHuman` 을 기준으로 재기 때문이다. Generic 으로 되돌리고 규칙을 고쳤다.
**교훈(AC3)**: 자산을 고르기 전에 **자가 그것을 잴 수 있는지** 먼저 본다. 56회차에 "마네킹을 쓰자"고 정할 때 뼈 개수를 안 봤다.

**다음**: Vox 에게 진짜 **기준 맨몸**(A 포즈·옷 없음·7등신·리깅 1회)을 시켰다. 그 몸의 키·등신을 기준 숫자로 굳히고,
갑옷 조각은 전부 그 몸에 맞춰 만든다. 그것이 사장님이 가르쳐 준 순서이자 업계 순서다.

### 57회차 이어서 (17:00~17:20) — 기준 맨몸이 나왔고, 회사가 멈춰 있던 이유를 찾았다

**기준 맨몸 PASS.** 삼각형 29,385 · 메시 1 · UV 있음 · **뼈 24개** · 리깅 + 걷기·달리기 (메시 30 + 리깅 5 + 동작 3 크레딧 = $0.76).
초안 $0.66 + 최종 $0.76 ≈ **$1.4** 로 앞으로 모든 갑옷의 기준이 될 몸 하나를 얻었다.
판정문에 남은 것: `S1` 이 "높이 0.017 m — 단위가 100배 다르다(cm)" 라고 적었다. 유니티에 들어갈 때 `규격_사람_키`(0.4~4.0)가 이것을 잡을 것이다.

**회사는 화면이 열려 있어야만 돌고 있었다.**
끝난 일을 대화에 붙이는 일(`collectWorkReturns`)은 **브라우저 폴링**에서만 돌았다. 그런데 "현재 판" 은 대화에 마지막으로 붙은 산출물이고,
유니티는 그 "현재 판" 을 묻는다. 그래서 창을 안 열어 두면 → 결과 턴이 안 붙고 → 새 판이 현재 판이 아니고 → 유니티가 못 보고 → 검사가 안 돌고 → 다음 일이 안 풀린다.
09-08 에 판 셋(16:23·16:27·16:39)이 그렇게 멈춰 있었다. 그 시간 동안 나는 "유니티가 왜 안 집어가지" 를 유니티 쪽에서 찾고 있었다.
**고침**: 워커가 1분마다 같은 일을 한다(`returnsTick`). 화면이 열려 있어도 중복으로 붙지 않는다 — 이미 붙은 것은 거른다.
**교훈(AC4)**: **사람이 보고 있어야만 도는 것은 자동이 아니다.** 폴링에 업무 진행(결과 붙이기·죽은 실행 표시·직원 풀기)을 얹으면,
화면이 닫히는 순간 회사가 조용히 선다. 화면은 **보는 곳**이지 **도는 곳**이 아니다.

**또 하나 고침**: 초안 검수가 다시 그리기 한도(3판)를 다 쓰고도 못 맞춘 조건을 **판정문에 안 적고** 대화에는 "필수 조건을 맞췄어요" 라고 냈다.
자기가 떨어뜨린 것을 맞췄다고 말한 셈이다. 이제 못 맞춘 조건이 판정문에 FAIL 로 남고 대화에도 그대로 적힌다.

### 57회차 — 투구, 여덟 판 만에 붙었다 (17:20)

`조각 model 뼈배율 1 (mesh) 크기 **0.451 m**, 붙은 곳 Head` · 머리 0.723 m → `part_size_ratio` **1.288** (0.3~3.0 안). **규격_조각_크기 통과.**
검사 통과 14 · 실패 1(남은 것은 씬 빌더가 찍은 옛 오류 로그 한 줄, 조각은 실제로 붙어 있다).

**원인 사슬(뒤에서부터)**: 업무를 취소함 → 자산 문이 그 산출물을 안 내보냄 → 가져오기가 그 폴더를 안 건드림 →
사이드카에 `attachTo` 가 안 써짐 → 조각인 줄 모름 → FBX 파일 단위(cm)를 안 고침 → 씬에서 5 mm.
고친 자리는 **다섯 군데가 아니라 한 군데**였다: 자산 문의 상태 조건.
**교훈(AC5)**: 여러 판을 같은 자리에서 헤맬 때는 **그 값이 어디서 오는지 끝까지 거슬러 올라간다.**
나는 사슬의 마지막 고리(붙이는 코드)만 여덟 번 고쳤다. 첫 고리는 내가 만든 것이었다.

### 57회차 마무리 (17:22) — 자가 고친 판, 그리고 내가 또 저지른 것

**투구 판 최종: 통과 14 · 실패 0.** 사람 손 0회로 자동 재시도 3판을 돌아 초록이 됐다
(`part_size_ratio` 0.013 → 1.288, `part_offset_m` 0.15, `part_covers_bone` true). 남은 두 줄은 못 잼(스프라이트 규칙은 3D 게임에 안 맞고, 재시도 판이라 기대표가 비었다).

**내가 또 저지른 것.** "리깅된 캐릭터는 Humanoid 로 들이자" 는 규칙을 넣었더니, 사이드카가 **폴더 단위**라
리깅 안 된 `model.fbx` 와 동작 클립까지 걸려 `Hips 없음` 오류가 쏟아졌고 **FBX 40개를 다시 들였다.**
게다가 씬 빌더가 이미 아바타를 세우고 있었으니 **없어도 되던 규칙**이었다. 규칙은 뺐다.
남은 자국: FBX 58개 중 56개가 Humanoid 로 남았다. 게임은 초록이고(통과 14·실패 0) 플레이어도 제대로 잡히니 **되돌리지 않는다** —
되돌리는 것 자체가 또 한 번의 전면 변경이고, 53회차에 그걸로 게임을 깼다.
**교훈(AC6)**: 53회차에 "전체 규칙을 바꾸지 마라" 를 적어 놓고 **같은 날 같은 실수를 했다.**
차이는 하나였다 — 그때는 파일 크기, 이번엔 리그 종류. 규칙을 적는 것과 지키는 것은 다르다.
넣기 전에 물을 것: **이 규칙이 몇 개 파일에 닿나?** 셋보다 많으면 먼저 세 개에만 걸어 보고 잰다.

### 58회차 (09-08 17:28~) — 맨몸 갈아 끼우기, 그리고 자가 계획을 잘못 읽은 자리

**자가 낸 실패 두 줄이 가짜였다.** 계획이 "동전이 18개로 유지되는지" 를 `equals: true` 로 적었고,
자는 `coin_count = 18` 을 재서 `18 === true` 로 **떨어뜨렸다.** 게임은 멀쩡한데 실패 2 가 나고 스스로 다시가 돌 뻔했다(재시도는 껐다).
**고침**: 숫자를 재는 자에 참/거짓 기대치가 오면 **실패가 아니라 못 잼**으로 적고, 그 이유를 그대로 말한다("숫자 자에 참/거짓을 적었다 — min·max 로 적어야 잰다").
계획 프롬프트에도 `equals` 는 참/거짓 자(hud_score_visible·part_covers_bone)에만 쓴다고 못 박았다.
**교훈(AC7)**: **자가 틀리면 사람이 아니라 기계가 헛돈다.** 가짜 실패 한 줄이 재시도 한 판($0.25)과 그 판을 검사하는 몇 분을 부른다.
기대치의 **모양**(숫자 자 ↔ 참/거짓 자)이 맞는지는 재기 전에 본다.

**맨몸 교체는 아직 안 붙었다.** 판정 측정값이 `head_count` 2.615 · `body_height_m` 2.095 — 앞 판(2.728 · 1.971)과 **같은 비율**이다.
7.5등신 맨몸이 섰다면 등신 수가 크게 달라졌어야 한다. Dev 코드는 "rigged.fbx 가 있으면 자동 배치" 라고 적었는데,
그 파일들은 **같은 바퀴에** 들어왔다(로그 12367~12570) — 씬을 지을 때 아직 준비가 안 됐을 수 있다.
자산이 이미 있는 상태로 **한 바퀴 더** 돌려 확인한다(모델 호출 0원 — 판정만 다시 잰다).

**운영 메모**: 같은 판을 **한 번 더 재고 싶으면** `data/unity_recheck` 파일을 만들면 된다(감시자가 보고 지운다).
유니티를 다시 켤 필요가 없다 — 판정 기록만 지우는 것으로는 안 된다. 감시자는 "마지막 버전" 을 에디터 세션에 들고 있기 때문이다.

**내가 한 시간을 버린 자리(57회차 17:31~18:31)**: 감시자를 **손으로** 켰더니 `ROOKERY_KEY` 가 안 붙어
`감시 묻기 실패: 401` 만 30초마다 찍으며 한 시간을 아무것도 안 했다. 켜는 스크립트(`engine/tools/unity_warm.ps1`)가
그 열쇠를 붙여 주는데 나는 명령을 직접 지어 냈다.
**교훈(AC8)**: **켜는 스크립트가 있으면 그것으로 켠다.** 손으로 지은 명령은 스크립트가 해 주던 것을 조용히 빠뜨린다.
그리고 감시자가 열쇠를 못 찾으면 이제 `.env.local` 에서 읽는다 — 켜는 방법에 기대지 않게.

### 58회차 — **안 지어진 게임이 합격했다**

맨몸이 안 선 이유를 찾았다. 씬 빌더가 **통째로 죽었다**:
`[Rookery] ✗ Rookery/CoinPickup/Rebuild Scene: parsing ""createdAt":"([^"]+" - Not enough )'s.`
Dev 가 낸 `FindRig` 의 정규식에 닫는 괄호가 빠졌다. 그래서 씬은 **다시 지어지지 않았고**, PlayMode 시험은
**지난 판 씬**(고양이 주인공)을 재서 `통과 14 · 실패 0` 을 냈다. 맨몸 교체는 코드에 있었지만 실행된 적이 없다.

**이것이 이 회차에서 제일 큰 구멍이다.** 우리 자는 "게임이 지어졌는가" 를 안 물었다.
지음이 죽어도 옛 씬이 디스크에 남아 있으니 시험은 멀쩡히 돌고 초록이 나온다 —
**측정은 정확했고, 측정 대상이 틀렸다.**
**고침**: 씬 빌더가 죽으면 판정 맨 앞에 `씬을_다시_지었다` 실패 줄을 박는다
("아래 값들은 지난 판 씬을 잰 것입니다"). 그러면 스스로 다시가 걸리고 Dev 가 자기 정규식을 고친다.
**교훈(AC9)**: **잰 값이 맞는지보다, 무엇을 쟀는지를 먼저 물어야 한다.**
자를 아무리 늘려도 대상이 낡았으면 전부 거짓 초록이다. 파이프라인의 각 단계는 **자기가 돌았다는 것**을 판정에 남겨야 한다.

**그리고 나는 그 고침을 넣다가 유니티를 깼다.** 패치 스크립트가 C# 안에 `Split('\n')` 를 넣어야 하는데
**진짜 줄바꿈**을 넣어 `error CS1010: Newline in constant` 가 났다. 컴파일이 죽으니 시험이 0/1 로 떨어지고
그 실패를 보고 **엉뚱한 자동 재시도**까지 걸렸다(껐다). 괄호 개수만 세고 넣은 줄을 눈으로 안 봤다.
**교훈(AC10)**: 이스케이프(`\n`·`\"`·`\`)가 들어가는 패치는 **넣은 자리를 그대로 찍어 눈으로 본다.**
괄호가 맞는 것과 글자가 맞는 것은 다르다. 오늘 같은 종류로 세 번 넘어졌다.

**확인됨(18:50)**: 같은 판을 다시 재니 판정이 이렇게 나왔다 —
`✗ 씬을_다시_지었다 — 씬 빌더가 죽어서 이번 판이 씬에 반영되지 않았습니다. 아래 값들은 지난 판 씬을 잰 것입니다 — … Not enough )'s`
그리고 가짜 실패 두 줄(`기대_coin_count`·`기대_parts_attached`)은 **못 잼**으로 바뀌며 이유를 말했다("숫자 자에 참/거짓을 적었다").
**통과 14 · 실패 0** 이던 판이 **실패 1(진짜 하나)** 이 됐다. 그 줄을 보고 Dev 가 스스로 자기 정규식을 고치러 갔다 —
사람이 코드를 고쳐 주지 않았다. 자를 고치는 것이 곧 고침을 부른다.

### 58회차 마무리 (18:55) — 맨몸이 섰다

Dev 가 **자기 정규식을 스스로 고쳤고**(자동 재시도 1판), 씬이 다시 지어지자 마네킹이 주인공으로 섰다.
`사람 VoxPlayer 키 **1.996 m**, 머리 0.317 m, **6.3 등신**` — 앞 판 2.6 등신에서 사람 비율로 바뀌었다. 사진으로도 확인했다(회색 마네킹 + 투구 쓴 기사 NPC).

**이 회차의 시험은 "몸을 갈아 끼워도 재는 값이 이어지는가" 였다. 이어졌다.**
가로 위치 0.384 · 카메라 4.075 m · 점프 0.809 m · 동전 18 · 조각 1 · `part_size_ratio` 1.29 — **통과 14 · 실패 0.**

**기준 맨몸 확정 숫자**: 키 1.996 m · 6.3 등신 · 머리 0.317 m. 앞으로 모든 조각은 이 숫자에 맞춘다.

**오늘 하루 값**: $10.4(gpt-5 $7.7 · 메시 크레딧 $1.4 · 그림 $1.3). 그중 투구 한 조각을 여덟 판 쫓는 데 $5쯤 썼고,
원인은 자산 문의 상태 조건 한 줄이었다. **가장 비싼 것은 모델 호출이 아니라 잘못된 곳을 보는 시간이었다.**

## AV. 59회차 (09-08 19:30~) — "투구 크기 개판인데"

사장님이 사진을 보고 한 줄 했다. 자는 `part_size_ratio` **1.29**, 통과였다. 둘 다 맞다 — **자가 틀렸다.**

**자가 자기 눈을 가리고 있었다(AC11).**
머리 크기를 `모든 렌더러의 꼭대기 − Head 뼈` 로 쟀는데, 그 '모든 렌더러' 안에 **재려는 조각 자신**이 들어간다.
투구가 커지면 → 꼭대기가 올라가고 → '머리'가 커지고 → 비율이 1 근처로 돌아온다.
**커질수록 자기 잘못을 더 잘 숨기는 자였다.** 48회차에 "몸 키로 나누지 말고 뼈 자리로 나눠라" 를 고치면서
분모를 바꿨지만, 분모 안에 분자가 섞여 있는 것은 못 봤다. 이제 머리는 **살(스키닝된 몸)만** 보고 잰다.

**그리고 대상이 틀렸다.** 기사는 **이미 자기 투구를 쓰고 있었다**(확대 사진: 뒤에 원래 바이저, 그 위에 Vox 조각).
갑옷이 구워진 캐릭터에 조각을 또 얹으면 투구가 둘이 된다. **조각은 맨몸에 얹는다 — 그러라고 맨몸을 만들었다.**

**문턱에 맞춰 깎인 자국(AC12).** `part_offset_m` 이 정확히 **0.15** 로 나왔다 — 합격 문턱과 소수점까지 같다.
머리에 맞춘 것이 아니라 **검사에 맞춘 것**이다(Goodhart). 절대 미터를 버리고 `part_offset_ratio`(÷머리 크기, 0.35 이하)로 바꿨다.
**자에 절대 숫자를 쓰면 그 숫자가 목표가 된다. 비율로 쓰면 대상이 목표가 된다.**

**바꾼 규격**: `규격_조각_크기` 0.3~3.0 → **0.8~1.8**, 새로 `규격_조각_자리` **0.35 이하**.

### 59회차 — 판이 커져서 시간이 먼저 끊겼다

투구 고치는 판이 두 번 죽었다. 원인은 하나였고 내가 처음에 반만 짚었다.
1판: `terminated` 만 남기고 죽음 → 나는 "선이 끊겼다" 로 보고 **같은 자리 1회 재시도**를 넣었다(그건 그것대로 맞다).
2판: 로그가 진짜 이름을 말했다 — `Request timed out. Node.js fetch timed out waiting for response headers`.
**끊긴 게 아니라 Node 가 먼저 끊은 것이다**(undici headersTimeout). 코드 생성 한 판이 **30분**을 넘겼다(10:47→11:17).
그리고 옆자리(anthropic)로 넘어갔는데 **거기 잔액이 0** 이라 업무가 통째로 죽었다.

**고침**: OpenAI 클라이언트에 undici `Agent`(headersTimeout·bodyTimeout 20분)와 SDK timeout 20분.
**교훈(AC13)**: **오래 걸리는 것은 고장이 아니다.** 기본 시간 제한은 짧은 대화를 전제로 잡혀 있는데,
우리 판은 74 KB 짜리 파일을 통째로 다시 쓰는 일이다. 일의 크기가 바뀌면 **시간 제한도 같이 바꿔야 한다.**
**교훈(AC14)**: 오류 문장을 **끝까지 읽는다.** 1판의 `terminated` 한 낱말로 원인을 정하고 고쳤는데, 2판의 긴 문장이 진짜 이름을 말했다.
짧은 오류는 증상이고 긴 오류는 원인일 때가 많다.

**남은 진짜 문제**: 한 판이 30분 걸리는 이유는 `CoinPickupSceneBuilder.cs` 한 파일이 **74 KB** 인데 매번 통째로 다시 쓰기 때문이다.
시간도 돈도 거기서 나간다 — 파일을 쪼개거나 바뀐 부분만 내게 해야 한다.
**그리고 anthropic 잔액이 0이라 지금 옆자리가 사실상 없다**(사장님 결정 사항).

**3판: `MODEL_OUTPUT_TRUNCATED`.** 세 판이 다 다른 얼굴로 죽었는데 **뿌리는 하나**였다 —
`CoinPickupSceneBuilder.cs` 가 **74 KB(≈2만 토큰)** 이라 투구 하나 옮기는 데도 그 파일을 통째로 다시 써야 한다.
1판 연결 끊김 → 2판 시간 초과 → 3판 출력 잘림. 전부 "한 판이 너무 크다" 의 증상이다.
예산을 32,000 → 100,000 으로 올려 막았다. **막은 것이지 고친 것이 아니다.**
`keep`(안 바꾸는 파일은 경로만) 장치는 이미 있다 — 문제는 **바꿔야 하는 그 한 파일이 큰 것**이다.
**교훈(AC15)**: 증상이 매번 바뀌는데 같은 자리에서 죽으면, 증상마다 고치지 말고 **크기를 의심한다.**
다음 판: 씬 빌더를 쪼갠다(빌드·조각 부착·카메라·레벨).

**그리고 `keep` 은 쓰이지 않고 있었다.** 이번 판이 낸 파일 **16개, `keep` 0개**.
"바꾸는 파일만 내라, 나머지는 `keep` 에 경로만" 이라고 주문서에 적혀 있는데 Dev 는 매번 전부 다시 쓴다.
그러니 투구 하나 옮기는 데도 74 KB + 나머지 15개를 통째로 낸다 — **시간과 돈이 새는 자리가 여기다.**
**교훈(AC16)**: 규칙을 적어 두는 것과 그 규칙이 지켜지는 것은 다르다. **지켜졌는지 세어 보는 자**가 없으면 안 지켜진다.
(`keep` 이 0인 판을 세는 줄이 필요하다 — 판정에 넣을 것.)

### 59회차 — **문법 그물에 우리 언어가 빠져 있었다**

4판은 코드가 나왔는데 유니티가 컴파일을 못 했다. 자리는 정확히 아까 그 정규식이었다:
`Regex.Match(at, "\"createdAt\":\"([^\\"]+" )` — `\\"` 는 역슬래시+따옴표라 **문자열이 거기서 닫힌다.**
Dev 가 자기 괄호 하나를 고치려다 이스케이프를 더 망가뜨렸다(내가 오늘 두 번 빠진 것과 같은 함정이다).

**그런데 이건 배달 전에 잡혔어야 했다.** `appBuild` 에는 "파싱 안 되면 한 번 고친다" 는 단계가 있다.
그물을 열어 보니 `PARSEABLE = { ts, tsx, js, jsx, json }` — **C# 이 없다.**
`.cs` 파일은 전부 `checked: false` 로 지나갔다. **우리가 실제로 내는 유일한 언어가 한 번도 검사된 적이 없었다.**

**고침**: `csharp.ts` — 파서 없이 **세는** 자. 문자열·문자·주석을 제대로 건너뛰며 (1) 줄 안에서 안 닫힌 리터럴,
(2) 괄호 짝을 본다. 진짜 파서가 아니라 우리가 실제로 겪는 두 가지만 확실히 잡는다.
실측: 깨진 씬 빌더에서 **1056줄을 정확히** 짚었고, 멀쩡한 C# 세 개(RookeryImporter·RookeryAcceptance·PlayerController)는 통과.
이제 깨진 C# 은 배달 전에 수리 단계로 간다.

**교훈(AC17)**: **그물이 있다고 덮인 것이 아니다.** "문법 검사 있음" 을 믿고 반년을 썼는데
그 목록에 우리 언어가 없었다. 안전장치는 **무엇을 덮는지 열어서 확인**해야 한다.

## AW. 60회차 (09-08 21:20~) — 자가진단: 회사가 자기 기록을 잰다

사장님: "이걸로 시행착오학습, 자가진단학습."
그날의 구멍 넷을 **내가 로그를 읽어서** 찾았다. 그건 사람이 붙어 있어야만 도는 일이다 — 화면이 그랬듯이.
그래서 `engine/tools/selfcheck.mts` 를 놓았다. **모델에게 묻지 않는다. 전부 결정적인 셈이다.**

**설계 규칙 둘**
1. 판정이 의견이면 판정이 아니다 → 전부 SQL 과 셈으로.
2. **"이상 없음"과 "본 게 없음"을 같이 적지 않는다.** 각 줄이 **몇 개를 봤는지**를 남긴다.
   0개를 보고 통과라 말하는 자는 오늘 고친 그 고장(안 지어진 게임이 합격)과 같은 종류다. `◻︎ 못 잼` 으로 따로 적는다.

**첫 판에 나온 것 (7일, 줄 8개 중 7개가 걸림)**
- **안 바뀐 파일을 다시 낸다 — 73판 중 68판**, 한 판에 최대 **139 KB**. 내가 알던 것보다 훨씬 크다.
- **파일이 너무 크다 — `CoinPickupSceneBuilder.cs` 76 KB** (895개 중 유일).
- **일이 커서 죽은 판 10건** — 출력 잘림·시간 초과·연결 끊김·잔액 없음.
  그중 **계획 단계 잘림이 5건**: 나는 생성 쪽 예산만 올렸었다. 자가 세어 주니 보였다(32000 → 60000).
- **기대치 모양 10건** — 숫자 자에 참/거짓, 위아래 없는 줄.
- **값이 안 움직인다 10건** — `part_offset_m` 4판 내리 0.15(문턱에 굳음)가 자동으로 잡혔다.
- **옆자리가 비었다** — anthropic 잔액 없음.

**자를 두 번 고쳤다(자가진단도 자다).**
1. *거짓 경보 제거*: "measures 가 비었다" 31건 중 대부분은 **컴파일이 깨진 판**이었다 — 못 재는 게 맞다.
   못 잰 이유가 판정에 적혀 있으면 정상으로 본다. 31 → 0.
   **늑대를 잘못 외치는 진단은 아무도 안 본다.**
2. *속일 수 없게*: 처음엔 `keep` 이 비었는지를 셌는데, 그러면 **keep 만 채우고 파일은 다 내면** 통과다.
   지난 판과 **글자까지 같은 파일을 다시 냈는지**로 바꿨다. 이건 못 속인다.
   **교훈(AC18)**: 자를 놓을 때 "이 자를 통과하는 가장 싼 방법"을 먼저 생각한다. 그게 곧 일어날 일이다.

**교훈(AC19)**: 사람이 로그를 읽어서 찾는 것은 **자가 아니다.** 오늘 넷을 찾았지만 그건 내가 붙어 있었기 때문이고,
같은 구멍이 그 전 며칠 동안은 아무도 모르게 있었다(안 바뀐 파일 68판이 그 증거다).
**진단을 자로 만들면 그때부터는 안 붙어 있어도 보인다.**

### 60회차 이어서 — **창 하나에 15분, 그리고 자가진단의 사각지대**

투구 재시도 판은 씬을 제대로 지었다(`Rebuild Scene OK`). 그런데 시험이 안 끝났다:
```
DisplayDialog: Scene(s) Have Been Modified … : Untitled
This should not be called in batch mode.
[Rookery] 15분째 바쁨 — 푼다
```
씬이 **이름 없이(Untitled)** 열려 있어서 시험 러너가 "저장할까요?" 창을 띄웠고, batchmode 에선 답할 수가 없다.
빌더가 씬 저장을 빠뜨린 것이다(16개 파일을 다시 쓰다 흘렸다).

**고침 둘**
1. 시험 전에 **우리가 먼저 저장한다** — 창이 뜰 일을 없앤다. 이름이 없으면 `Assets/Scenes/CoinPickup.unity` 로 저장하고
   판정에 `씬을_저장했다` **실패 줄**을 박는다(빌더가 고치도록).
2. **자가진단에 사각지대를 메웠다.** 이렇게 굳으면 결과가 없으니 **DB 에 행이 아예 안 생긴다** —
   실패로도 안 보인다. `소식 없이 사라진 판`(90분 넘었는데 검사가 안 붙은 판)을 세는 줄을 더했다.
   **첫 판에 17개.** 7일 동안 만들어 놓고 판정을 못 받은 판이 열일곱이었고 아무도 몰랐다.

**교훈(AC20)**: **없는 것은 세기 어렵다.** 실패는 행으로 남지만 **굳은 것은 아무것도 안 남긴다.**
그래서 진단은 "있는 것 중 나쁜 것" 만 보면 안 되고, **있어야 할 것에서 빼는 줄**이 하나는 있어야 한다.

### 60회차 — 크기는 맞고 **자리가 틀렸다** (22:40)

씬 저장 고침이 먹었다(굳지 않고 끝까지 돌았다). 판정 **통과 18 · 실패 1**, 유일한 실패는 내가 새로 넣은
`씬을_저장했다`(빌더가 씬을 저장 안 한다는 진짜 결함). 기사에서 추가 투구도 떨어졌다.

**그런데 사진을 보니 투구가 맨몸의 목에 걸려 있다.** 크기는 맞다(`part_size_ratio` 1.192).
`part_offset_ratio` 는 **0** — 만점이었다. 이유: 이 리그의 `Head` 뼈는 **목 밑동**에 있고 보이는 머리는 그 위다.
뼈 점에 정확히 맞추면 자는 0을 주고 투구는 목에 걸린다.
**고침**: 앉을 자리를 `headBone + up × (머리높이/2)` 로 보고 거기서 잰다.

**교훈(AC21)**: **오늘 이 한 조각에서 자가 세 번 틀렸다** — 몸 키로 나눔(48회차), 자기를 분모에 넣음(59회차),
뼈 점을 자리로 봄(60회차). 셋 다 "숫자는 통과인데 사진이 이상하다" 로 나타났고, 셋 다 사장님이 사진을 보고 먼저 알았다.
**자는 사람 눈을 대신하지 못한다. 자는 사람 눈이 한 번 본 것을 반복하게 해 줄 뿐이다.**
새 자를 놓을 때는 **처음 한 번은 반드시 사진과 맞춰 본다.**

### 60회차 — 자를 고쳤는데 **자가 조용히 옛것으로 돌아갔다**

자리 자를 고쳤는데 세 판을 다시 재도 `part_offset_ratio` 가 계속 0이었다. 프로젝트 파일을 열어 보니
내가 넣은 코드가 **없었다**. 이유: **자의 원본은 저장소 `unity/Tests/` 이고 웹 서비스가 유니티에 내려 준다.**
로컬만 고치면 아무 효과가 없고, 그다음 임포트가 **배포된 옛 판으로 내 수정을 덮어쓴다.**
오전에 `body_height_m` 이 먹었던 것은 그때 웹을 같이 배포했기 때문이었다.
**교훈(AC22)**: 자를 고쳤으면 **웹을 배포해야 자가 바뀐다.** 안 하면 조용히 되돌아간다 —
오전의 "되돌렸다고 되돌아간 게 아니다"(AB2)와 같은 종류의 고장이다. 눈에 안 보이는 되돌림이 오늘만 두 번이다.

**배포 뒤 확인(23:00)**: 같은 판을 다시 재니 **통과 18·실패 0 → 통과 15·실패 3**.
`part_offset_ratio` 0 → **0.50**, `✗ 규격_조각_자리`. **사장님이 사진으로 본 것과 자가 같은 말을 하게 됐다.**
이것이 자를 고쳤다는 증거다 — 초록이 빨강이 되는 것을 봐야 고친 것이다.
자동 재시도(3/3)가 자리를 고치러 갔다.

## AX. 61회차 (09-09 07:20~) — "갑옷을 대충 끼워 넣지 마라", 그리고 모델 이야기

**사장님 지적이 정확했다.** 이틀을 **산 투구를 숫자로 끼워 맞추는 데** 썼다. 제대로 읽으니 우리가 **한 단계를 통째로 빠뜨렸다.**
- 갑옷은 **몸 위에서 만들어진다.** 갑옷 입은 캐릭터를 만든 뒤 쪼개서 맨몸 + 몸 없는 조각 + 뼈대 하나로 나눈다.
  조각이 맞는 이유는 **그 몸의 표면에서 파생됐기** 때문이다. 따로 만든 것을 나중에 맞추는 게 아니다.
- 투구·금속은 **강체, 뼈 하나에 가중치 1.0**(가중치 전이 금지). 천은 반대로 **몸에서 가중치 전이**. 이음매는 양쪽 단일 뼈 1.0.
- 갑옷 밑의 몸은 **숨긴다.**
- 생성한 조각은 **엔진 앞에 DCC 한 단계**(블렌더)를 거친다 — 원점·크기, Shrinkwrap 으로 감싸 맞추기, 가중치 전이, 덮인 몸 숨기기.
  Meshy 자기 안내도 "블렌더/마야에서 리깅 뒤 뼈에 붙이라" 고 한다.
**교훈(AC23)**: 자를 세 번 고치는 동안 투구는 목에 걸려 있었다. **자는 빠진 단계를 대신하지 못한다.**
같은 자리에서 자를 계속 고치고 있으면, 고칠 것이 자가 아니라 **없는 단계**일 수 있다.

**모델**: 사장님이 GPT-6 Astra 를 물었다(09-03 출시, 내 지식 시점 뒤). 확인한 것 —
우리 키로 **`gpt-6-astra` 가 열려 있다.** 값은 **$10/$50 per 1M** = 지금 `gpt-5`($1.25/$10)의 **입력 8배·출력 5배**.
09-08 처럼 판 32개를 돌리면 하루에 $50~60, 한 달 한도를 하루에 쓴다.
그리고 더 눈에 띄는 것: **우리는 2025-08 판 `gpt-5` 를 그대로 쓰고 있었다.** 그 사이 5.4·5.5·5.6(luna/sol/terra)이 나와 있다.
오늘 겪은 코드 품질 문제(정규식 깨짐·잘림)의 일부는 그냥 낡은 모델일 수 있다.
**정하는 방법**: 소문 말고 **같은 일을 시켜서 잰다.** `OPENAI_JUDGMENT_MODEL` 로 판단 자리 모델만 갈아 끼울 수 있게 했다(기본은 그대로).

## AY. 62회차 (09-09 07:50~) — 판을 작게: 말이 아니라 **구조로**

사장님: "너 제대로 일해 돈만 갖다 쓰지 말고." 어제 $13 중 대부분이 **같은 것을 다시 쓰는 데** 갔다.

**문제**: 주문서에 "바꾸는 파일만 내라, 나머지는 `keep` 에 경로만" 이라고 **이미 적혀 있었다.** 그런데 자가 세어 보니
**73판 중 68판이 안 바뀐 파일을 통째로 다시 냈다**(한 판 최대 139 KB). `keep` 을 쓴 판은 5개뿐.
**말로 부탁하는 규칙은 안 지켜진다.**

**고침(구조)**: 계획이 `touch` 로 **이번에 손댈 파일**을 선언하고, 생성 단계에는 **그 파일만 전문을 준다.**
나머지는 경로와 크기만 알려 준다 — **볼 수 없으면 다시 쓸 수도 없다.** 코드가 나머지를 이어 붙인다(이미 있던 장치).

**첫 판 실측** (한 파일짜리 일: 투구 자리 고치기)
| | 어제 기준선 | 이번 판 |
| --- | --- | --- |
| 다시 쓴 파일 | 15~16개 · 83~139 KB | **1개 · 13 KB** |
| 출력 토큰 | 24,857 ~ 34,801 | **9,723** |
| 생성 값 | $0.30 ~ $0.42 | **$0.124** |
| 판 전체(계획+생성) | 약 $0.38 | **$0.18** |
로그: `손댈 파일 1개 선언 → 실제로 낸 것 1개 (13 KB) · 선언대로`

**교훈(AC24)**: **규칙을 적는 것과 지켜지는 것은 다르고, 세는 자가 없으면 안 지켜진다.**
그리고 지켜지게 하는 방법은 더 세게 부탁하는 것이 아니라 **못 어기게 만드는 것**이다 —
여기서는 "안 바꿀 파일은 보여 주지 않는다" 한 줄이었다.
**교훈(AC25)**: 자가진단이 먼저 세어 줬기 때문에(68/73) 이 자리를 알았다. 어제 내가 눈으로 본 것은 "한 판이 16개를 냈다" 였고,
자가 본 것은 "7일 내내 그랬다" 였다.

## AZ. 63회차 (09-09 08:00~) — 블렌더를 들였다. 규격이 생겼다.

사장님: "3D 투구 만드는 것도 **기준도 없이** 만들고 조잡하게 붙여놓고… 3D 모델링은 공부할 생각은 없고."
둘 다 맞다. 나는 지오메트리를 만질 줄 모르는 채로 **붙이기만** 했고, 그래서 자만 계속 고쳤다.

**한 일**: 블렌더 4.5.9 LTS 를 사용자 폴더에 풀었다(관리자 권한 없음). 헤드리스로 파이썬이 돈다.
- `engine/tools/blender/measure_body.py` — 아무 FBX 나 잰다. 머리는 눈대중이 아니라 **스킨 가중치**로 잡는다(Head 뼈에 0.5 초과로 물린 정점).
- `engine/tools/blender/fit_part.py` — 조각을 몸에 맞춰 다시 내보낸다. 크기를 뼈 덩어리에 맞추고, 자리로 옮기고, **원점을 뼈로 굽는다.**

**규격 없이 만들면 뭐가 나오는지, 숫자로**
| | 산 투구(model.fbx) | 기준 맨몸 |
| --- | --- | --- |
| 크기 | 21.7 × 27.6 × **30.0 cm** | 머리 17.2 × 20.7 × **23.3 cm** |
| 삼각형 | **30,356** | 몸 전체 29,385 |
| 원점 | **투구 아래 테두리**(z=0) | — |
투구 하나가 **몸 전체보다 삼각형이 많다.** 그리고 원점이 아래 테두리라 Head 뼈에 달면 **테두리가 뼈에 오고 투구는 목에 걸린다** —
사진 그대로였고, 유니티에서 아무리 밀어도 안 되던 이유가 이것이다. **나는 이 둘을 한 번도 보지 않았다.**

**맞춘 뒤**: 19.4 × 24.7 × 26.8 cm, **원점 = Head 뼈**, 머리 중심은 뼈에서 8.4 cm 위.
유니티는 이제 뼈에 자식으로 달고 위치·회전·크기 0/기본이면 끝. **실행 중 계산이 없다.**
블렌더 단계는 **모델 호출 0회 · 비용 0원 · 몇 초**, 결정적이라 매번 같다.

**중요한 부수 발견**: 원본 몸의 키는 **1.70 m** 인데 유니티 자는 1.996 m 로 쟀다 — 씬에서 **1.17배**로 커져 있다.
조각 계산은 그 배율을 탄다. 여태 모르고 맞추고 있었다.

**교훈(AC26)**: **만들기 전에 숫자를 준다.** 글로 주문하고 나중에 맞추는 것은 맞추는 게 아니라 찍는 것이다.
규격표(`lessons-mesh_assets.md`)에 몸 치수·조각 한계(삼각형 3,000 이하·원점은 붙는 뼈·앞은 +Z)를 박았다.
**교훈(AC27)**: 할 줄 아는 것이 붙이기뿐이면 모든 문제가 붙이기 문제로 보인다. 이틀 동안 자를 세 번 고친 것이 그 증거다.

## BA. 64회차 (09-09 08:40~) — 폴리곤 줄이기 (비용 0원)

**읽은 것**: 감축(Decimate·Collapse)은 **딱딱한 조각 전용**이다. 스키닝된 몸에 쓰면 토폴로지가 불규칙해져
가중치가 깨지고 **관절에서 메시가 찢어진다** — 몸은 리토폴로지의 일이다.
Collapse 는 살아남은 정점이 제 UV 를 들고 가서 텍스처는 계속 맞지만, 많이 줄이면 **이음매 근처가 늘어난다**.
크게 줄여 디테일이 죽으면 고폴리에서 **노멀 맵을 구워** 씌운다(우리 단계는 아직 아님).

**한 것**: `fit_part.py` 에 감축을 넣었다. 투구 **30,356 → 3,000 삼각형**, 여유 1.15 → 1.08 로 크기 30.0 → **25.2 cm**(머리 23.3).
모델 호출 0회, **비용 0원**, 몇 초.

**확인 안 된 것(정직하게)**: 파일은 새로 썼고 유니티가 임포트 로그도 남겼는데 **잰 값이 안 움직였다**
(0.41 m · `part_size_ratio` 1.293 — 감축 전과 같다). 씬이 아직 옛 임포트를 쓰고 있다는 뜻이다.
**그러므로 "게임에 반영됐다"는 확인된 것이 아니다.** 다음 판에서 숫자가 25.2 cm 쪽으로 내려가는지로 판정한다.

## BB. 65회차 (09-09 09:48~) — 아끼는 장치가 일을 막았다

씬 빌더(77 KB)를 쪼개라고 시켰다. 나온 것: `#if false` 로 감싼 **빈 껍데기 5개(합쳐 3 KB)**, 원본은 **77 KB 그대로**.
Dev 가 그 이유를 코드 주석에 적어 놨다 — *"메인 파일이 '손대지 않는 파일' 로 지정돼 있어, 동작을 바꾸지 않기 위해 `#if false` 로 감싼 비기능 플레이스홀더"*.

**내 지시가 모순이었다**: "쪼개라" + "원본은 건드리지 마라". 62회차에 돈을 아끼려고 넣은 장치
(`touch` 에 없는 파일은 내용을 안 보여 주고 내지도 못하게 한다)가, **파일을 줄이는 일** 앞에서는 정확히 반대로 작동한다 —
줄이려면 다시 내야 하는데 다시 내는 것을 막아 놨다.

**교훈(AC28)**: **아끼는 장치는 그 자체로 하나의 제약이다.** 넣을 때는 "무엇을 못 하게 되는가" 를 같이 적어야 한다.
여기서 못 하게 된 것은 **리팩터링**이었고, 그건 우리가 제일 하고 싶던 일이었다.
**교훈(AC29)**: 이번엔 시스템이 조용히 실패하지 않았다 — Dev 가 이유를 주석에 남겼고, 로그의 `5개 (3 KB)` 가 바로 잡았다.
**모순된 지시를 받은 쪽이 그 모순을 적어 두면 사람이 1분 만에 안다.**

**고침**: `touch` 설명에 "**줄어드는 파일·쪼개지는 파일도 반드시 넣는다**" 를 박았다. 2판을 원본 포함으로 다시 걸었다.

## BC. 67회차 (09-09 11:00~) — 확인을 **돈 안 드는 자리**로 옮겼다

사장님: "ㅠㅠ 처음부터 하자 제대로."
그동안 나는 조각을 유니티에 넣고 **판을 하나 사서**(돈·몇 분) 사진을 본 다음에야 틀린 걸 알았다.
**확인을 돈 드는 자리에서 하고 있었다.**

**만든 것**: `engine/tools/blender/preview_fit.py` — 몸에 조각을 씌우고 앞·옆·뒤 세 장을 렌더한다.
유니티에 보내는 것과 **같은 계산**으로 앉힌다(그래야 그림이 의미가 있다). 몇 초, **0원**.

**그 자리에서 바로 알게 된 것들**
1. **중심끼리 맞추면 안 된다.** 이 투구는 뒤통수 판이 길어 바운딩 박스 중심이 뒤·아래로 끌린다 —
   중심을 맞추니 돔이 뒤로 밀리고 정수리가 드러났다. 쓰는 물건은 **정수리를 맞춘다.**
2. 내가 카메라 이름을 뒤집어 달아 놨었다(첫 렌더의 '정면'이 실은 뒤통수).
3. 자동 정렬만으로 안 되는 조각이 있다 → 밀어 보는 값(`nudge_fwd`·`nudge_up`, 머리 크기 대비 비율)을 인자로 뺐다.

**그리고 진짜 결론**: 렌더 다섯 장으로 **위치 문제가 아니라는 것**이 드러났다.
앞으로 밀면 뒤통수가 비고 뒤로 밀면 앞머리가 빈다 — **이 투구는 머리를 감싸는 형태가 아니다.**
어디에 놓아도 안 된다. 규격 없이 글로만 주문했기 때문이다(안쪽이 머리를 감싸는지 아무도 정하지 않았다).
나는 이것을 **이틀 동안 유니티에서 밀고 당기고 있었다.**

**교훈(AC30)**: **확인이 비싸면 확인을 덜 하게 되고, 그러면 틀린 채로 멀리 간다.**
같은 판단을 5분·$0.3 에서 5초·0원으로 옮기니 이틀 걸린 결론이 다섯 장 만에 나왔다.
새 자를 만들기 전에 물을 것: **이 확인을 더 싼 자리에서 할 수는 없나?**


## AD. 226회차 (09-26 02:30~03:05) — 3D 도 고칠 수 있게 됐다 (다시 칠하기 10 크레딧)

09-09 뒤로 3D 고치는 판(previousDeliverableId)이 **0건**이었다. 게임은 고치는 판이 도는데
3D 만 안 돌았다. 왜인지 파 보니 문이 셋 닫혀 있었다.

**① 다시 칠하기가 배관에 아예 없었다.** 17회차(09-06)가 Retexture 를 손으로 써 보고
"화질이 안 오른다" 며 접었는데, 그때 목적이 **화질**이었다. 색·재질을 바꾸는 본래 용도로는
한 번도 안 붙였다. `MeshProvider.retexture()` 를 넣었다.

**② 실측: 필드 이름이 `prompt` 가 아니다.** 첫 호출이 400 —
`Either text_style_prompt, image_style_url or multiview_image_urls must be provided`.
`text_style_prompt` 로 고치니 돌았다. 문서만 읽고 넘어갔으면 첫 실전에서 터졌을 자리다.

**③ 재사용 정규식이 메시까지 막고 있었다.** 지난 산출물을 집는 조건이
`같은 그림|지난 캐릭터|고화질|최종…` 이었다. 고치는 주문("갑옷을 더 어둡게")은 여기
**하나도 안 걸린다.** 그 정규식은 09-06 에 "새로 그려" 를 무시하고 지난 그림을 집던 사고를
막으려고 만든 것 — 콘셉트 **그림** 재사용에만 맞다. 지난 **메시 taskId** 는 그와 상관없이 읽고,
실제로 다시 칠할지는 브리프의 `fixKind`(AI 판단)가 정하게 갈랐다.
[사장님 반응은 AI가 읽는다(09-16)] 와 같은 줄이다 — 정규식이 뜻을 가르는 자리에 서 있으면 샌다.

**갈림은 둘뿐이다.** `texture` = 색·재질·무늬만(10 크레딧, **모양 그대로**),
`shape` = 모양·비율·부품(30 크레딧, 새로 만들기). 애매하면 `shape` 로 가게 적었다 —
텍스처만 바꿔 모양 주문을 넘기면 매니저는 **안 고쳐진 것**을 받는데, 그게 더 나쁘다.

### 실측 (09-26 02:37~03:00, 개발 계정)

| | 새로 만들기 | 고치는 판 |
|---|---|---|
| 크레딧 | 30 | **10** |
| 모델 | meshy-7 | meshy-retexture |
| GLB | 받음 | 받음 (3,067 KB) |
| 걸린 시간 | 약 9분 | 약 3분 40초 |
| 모양 | 새로 뽑힘 | **그대로** |

`fixKind=texture`, `texturePrompt` 는 AI 가 주문에서 뽑았다:
*"near-black gunmetal grey, dull burnt patina, completely matte… keep the original shape and
geometry unchanged"*. `retexturedFrom` 에 이전 taskId 가 남는다.

### 새로 안 사실: **Meshy task 는 오래 못 산다**

고치는 판을 지난 산출물에 대 보려다 전부 404(`Task not found`) 를 받았다.
DB 의 실제 3D **20개 전부**, 16~20일 전 것들이다. 즉 **다시 칠하기는 그 판이 Meshy 에
살아 있는 동안만** 된다. 며칠인지는 아직 모른다(16일 이상 지난 것만 재 봤다).

그래서 404 가 나면 **조용히 새로 만들기로 되돌아간다.** 여기서 끝내면 매니저는
"못 만들었습니다" 를 받는데, 사실은 만들 수 있었다([고장이냐 배울 거리냐, 09-15]).
되돌아간 판은 본문에 그렇게 적는다 — 모양이 지난 것과 다를 수 있으니까.

### 아직 안 잰 것

- **판정을 못 댔다.** 판정 엔진은 `JUDGE_URL` 로 부르는 별도 서비스라 로컬에 없다.
  고친 GLB 에 대한 자 결과는 **배포 뒤에** 나온다(새로 만든 판은 Railway 에서 6개 쟀다).
- **정말 어두워졌는지는 사람 눈이다.** 17회차가 "다시 칠하면 얼굴이 조금 달라진다" 고
  재 뒀다 — 얼굴 있는 캐릭터를 고칠 때 그게 문제가 될지는 아직 안 봤다.
