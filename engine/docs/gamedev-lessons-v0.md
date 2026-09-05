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
