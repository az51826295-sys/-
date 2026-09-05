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
